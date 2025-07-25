#!/usr/bin/env bun

/**
 * Unified GitLab entrypoint that combines prepare, execute, and update phases
 * This replaces the multi-step shell commands in GitLab CI with a single TypeScript file
 */

import { $ } from "bun";
import * as fs from "fs";
import * as path from "path";

interface PhaseResult {
  success: boolean;
  error?: string;
  commentId?: number;
  outputFile?: string;
}

async function runPreparePhase(): Promise<PhaseResult> {
  try {
    console.log("=========================================");
    console.log("Phase 1: Preparing Claude Code action...");
    console.log("=========================================");

    // Run prepare.ts and capture output
    const prepareResult = await $`bun run ${path.join(__dirname, "prepare.ts")}`.quiet();
    
    // Print the output for debugging
    console.log(prepareResult.stdout.toString());
    
    if (prepareResult.exitCode !== 0) {
      const errorOutput = prepareResult.stderr.toString();
      console.error("Prepare step failed:", errorOutput);
      return {
        success: false,
        error: errorOutput || "Prepare step failed",
      };
    }

    // Check if trigger was found by examining output
    const output = prepareResult.stdout.toString();
    if (output.includes("No trigger found")) {
      console.log("No trigger found, exiting...");
      return {
        success: false,
        error: "No trigger found",
      };
    }

    // Extract comment ID from environment (set by prepare.ts)
    const commentId = process.env.CLAUDE_COMMENT_ID ? parseInt(process.env.CLAUDE_COMMENT_ID) : undefined;

    return {
      success: true,
      commentId,
    };
  } catch (error) {
    console.error("Error in prepare phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runExecutePhase(prepareResult: PhaseResult): Promise<PhaseResult> {
  try {
    console.log("=========================================");
    console.log("Phase 2: Installing Claude Code...");
    console.log("=========================================");
    
    // Install Claude Code globally
    const installResult = await $`bun install -g @anthropic-ai/claude-code@1.0.60`;
    console.log(installResult.stdout.toString());
    
    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install Claude Code: ${installResult.stderr.toString()}`);
    }

    console.log("=========================================");
    console.log("Phase 3: Installing base-action dependencies...");
    console.log("=========================================");
    
    // Install base-action dependencies
    const baseActionPath = path.join(path.dirname(__dirname), "..", "base-action");
    const depsResult = await $`cd ${baseActionPath} && bun install`;
    console.log(depsResult.stdout.toString());
    
    if (depsResult.exitCode !== 0) {
      throw new Error(`Failed to install base-action dependencies: ${depsResult.stderr.toString()}`);
    }

    console.log("=========================================");
    console.log("Phase 4: Running Claude Code...");
    console.log("=========================================");

    // Set up environment for base-action
    const env = {
      ...process.env,
      CLAUDE_CODE_ACTION: "1",
      INPUT_PROMPT_FILE: "/tmp/claude-prompts/claude-prompt.txt",
      INPUT_TIMEOUT_MINUTES: "30",
      INPUT_MCP_CONFIG: "",
      INPUT_SETTINGS: "",
      INPUT_SYSTEM_PROMPT: "",
      INPUT_APPEND_SYSTEM_PROMPT: "",
      INPUT_ALLOWED_TOOLS: process.env.ALLOWED_TOOLS || "",
      INPUT_DISALLOWED_TOOLS: process.env.DISALLOWED_TOOLS || "",
      INPUT_MAX_TURNS: process.env.MAX_TURNS || "",
      INPUT_CLAUDE_ENV: process.env.CLAUDE_ENV || "",
      INPUT_FALLBACK_MODEL: process.env.FALLBACK_MODEL || "",
      ANTHROPIC_MODEL: process.env.CLAUDE_MODEL || "sonnet",
      DETAILED_PERMISSION_MESSAGES: "1",
    };

    // Run the base-action
    const baseActionScript = path.join(baseActionPath, "src", "index.ts");
    const executeResult = await $`bun run ${baseActionScript}`.env(env).quiet();
    
    // Print output regardless of exit code
    console.log(executeResult.stdout.toString());
    if (executeResult.stderr.toString()) {
      console.error(executeResult.stderr.toString());
    }

    const outputFile = "/tmp/claude-output.json";
    
    return {
      success: executeResult.exitCode === 0,
      error: executeResult.exitCode !== 0 ? "Claude execution failed" : undefined,
      commentId: prepareResult.commentId,
      outputFile,
    };
  } catch (error) {
    console.error("Error in execute phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      commentId: prepareResult.commentId,
    };
  }
}

async function runUpdatePhase(prepareResult: PhaseResult, executeResult: PhaseResult): Promise<PhaseResult> {
  try {
    // Only update if we have a comment ID
    if (!prepareResult.commentId) {
      console.log("No comment ID available, skipping update phase");
      return { success: true };
    }

    console.log("=========================================");
    console.log("Phase 5: Updating comment with results...");
    console.log("=========================================");

    // Set up environment for update script
    const env = {
      ...process.env,
      CLAUDE_COMMENT_ID: prepareResult.commentId.toString(),
      CLAUDE_SUCCESS: executeResult.success ? "true" : "false",
      PREPARE_SUCCESS: prepareResult.success ? "true" : "false",
      OUTPUT_FILE: executeResult.outputFile || getClaudeExecutionOutputPath(),
    };

    // If we're in issue context, ensure CI_ISSUE_IID is set
    if (process.env.CLAUDE_RESOURCE_TYPE === "issue" && process.env.CLAUDE_RESOURCE_ID) {
      env.CI_ISSUE_IID = process.env.CLAUDE_RESOURCE_ID;
    }

    // Run update script
    const updateScript = path.join(__dirname, "update-comment-gitlab.ts");
    const updateResult = await $`bun run ${updateScript}`.env(env).quiet();
    
    console.log(updateResult.stdout.toString());
    
    if (updateResult.exitCode !== 0) {
      console.error("Failed to update comment:", updateResult.stderr.toString());
      return {
        success: false,
        error: "Failed to update comment",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in update phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  let exitCode = 0;
  let prepareResult: PhaseResult = { success: false };
  let executeResult: PhaseResult = { success: false };

  try {
    // Phase 1: Prepare
    prepareResult = await runPreparePhase();
    
    if (!prepareResult.success) {
      // Exit early if prepare failed (no trigger found is not an error)
      if (prepareResult.error === "No trigger found") {
        console.log("✅ No Claude trigger found in the request");
        process.exit(0);
      }
      throw new Error(`Prepare phase failed: ${prepareResult.error}`);
    }

    // Phase 2: Execute
    executeResult = await runExecutePhase(prepareResult);
    
    if (!executeResult.success) {
      exitCode = 1;
      console.error(`Execute phase failed: ${executeResult.error}`);
    }

  } catch (error) {
    exitCode = 1;
    console.error("Fatal error:", error);
  } finally {
    // Phase 3: Update (always run if we have a comment)
    if (prepareResult.commentId) {
      const updateResult = await runUpdatePhase(prepareResult, executeResult);
      if (!updateResult.success) {
        console.error("Warning: Failed to update comment");
      }
    }
  }

  // Exit with appropriate code
  process.exit(exitCode);
}

// Run the main function
if (import.meta.main) {
  main();
}