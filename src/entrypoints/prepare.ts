#!/usr/bin/env bun

/**
 * Prepare the Claude action by checking trigger conditions, verifying human actor,
 * and creating the initial tracking comment
 */

import * as core from "@actions/core";
import { setupGitHubToken } from "../github/token";
import { checkHumanActor } from "../github/validation/actor";
import { checkWritePermissions } from "../github/validation/permissions";
import { createInitialComment } from "../github/operations/comments/create-initial";
import { setupBranch } from "../github/operations/branch";
import { configureGitAuth } from "../github/operations/git-config";
import { prepareMcpConfig } from "../mcp/install-mcp-server";
import { createOctokit } from "../github/api/client";
import { fetchGitHubData } from "../github/data/fetcher";
import { parseGitHubContext } from "../github/context";
import { getMode } from "../modes/registry";
import { createPrompt } from "../create-prompt";
import {
  createProvider,
  getToken,
  detectPlatform,
} from "../providers/provider-factory";
import type { SCMProvider } from "../providers/scm-provider";
import { $ } from "bun";

async function run() {
  const platform = detectPlatform();
  core.setOutput("platform", platform);

  // Use platform-specific logic
  if (platform === "gitlab") {
    await runGitLab();
  } else {
    await runGitHub();
  }
}

async function runGitHub() {
  try {
    // Step 1: Setup GitHub token
    const githubToken = await setupGitHubToken();
    const octokit = createOctokit(githubToken);

    // Step 2: Parse GitHub context (once for all operations)
    const context = parseGitHubContext();

    // Step 3: Check write permissions
    const hasWritePermissions = await checkWritePermissions(
      octokit.rest,
      context,
    );
    if (!hasWritePermissions) {
      throw new Error(
        "Actor does not have write permissions to the repository",
      );
    }

    // Step 4: Get mode and check trigger conditions
    const mode = getMode(context.inputs.mode);
    const containsTrigger = mode.shouldTrigger(context);

    // Set output for action.yml to check
    core.setOutput("contains_trigger", containsTrigger.toString());

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 5: Check if actor is human
    await checkHumanActor(octokit.rest, context);

    // Step 6: Create initial tracking comment (mode-aware)
    // Some modes (e.g., future review/freeform modes) may not need tracking comments
    let commentId: number | undefined;
    let commentData:
      | Awaited<ReturnType<typeof createInitialComment>>
      | undefined;
    if (mode.shouldCreateTrackingComment()) {
      commentData = await createInitialComment(octokit.rest, context);
      commentId = commentData.id;
    }

    // Step 7: Fetch GitHub data (once for both branch setup and prompt creation)
    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
      triggerUsername: context.actor,
    });

    // Step 8: Setup branch
    const branchInfo = await setupBranch(octokit, githubData, context);

    // Step 9: Configure git authentication if not using commit signing
    if (!context.inputs.useCommitSigning) {
      try {
        await configureGitAuth(githubToken, context, commentData?.user || null);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        throw error;
      }
    }

    // Step 10: Create prompt file
    const modeContext = mode.prepareContext(context, {
      commentId,
      baseBranch: branchInfo.baseBranch,
      claudeBranch: branchInfo.claudeBranch,
    });

    await createPrompt(mode, modeContext, githubData, context);

    // Step 11: Get MCP configuration
    const additionalMcpConfig = process.env.MCP_CONFIG || "";
    const mcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.claudeBranch || branchInfo.currentBranch,
      baseBranch: branchInfo.baseBranch,
      additionalMcpConfig,
      claudeCommentId: commentId?.toString() || "",
      allowedTools: context.inputs.allowedTools,
      context,
    });
    core.setOutput("mcp_config", mcpConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);

    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);

    process.exit(1);
  }
}

async function runGitLab() {
  let provider: SCMProvider | null = null;

  try {
    console.log("Running in GitLab mode");

    // Step 1: Get appropriate token
    const token = getToken();

    // Step 2: Get trigger configuration
    const triggerPhrase =
      core.getInput("trigger_phrase") ||
      process.env.TRIGGER_PHRASE ||
      "@claude";
    const directPrompt =
      core.getInput("direct_prompt") || process.env.DIRECT_PROMPT || "";

    // Step 3: Create provider instance
    provider = createProvider({
      platform: "gitlab",
      token,
      triggerPhrase,
      directPrompt,
    });

    // Step 4: Check write permissions
    const context = provider.getContext();
    const hasWritePermissions = await provider.hasWritePermission(
      context.actor,
    );

    if (!hasWritePermissions) {
      throw new Error(
        "Actor does not have write permissions to the repository",
      );
    }

    // Step 5: Check trigger conditions
    const containsTrigger = await provider.checkTrigger(
      triggerPhrase,
      directPrompt,
    );

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 6: Check if actor is human (skip for direct prompts)
    if (!directPrompt) {
      const isHuman = await provider.isHumanActor(context.actor);
      if (!isHuman) {
        throw new Error("Actor is not a human user");
      }
    }

    // Step 7: Create initial tracking comment
    const jobUrl = provider.getJobUrl();
    const commentBody = `🤖 Claude is working on this...

[View job details](${jobUrl})

---
- [ ] Setting up workspace
- [ ] Analyzing request  
- [ ] Implementing changes
- [ ] Running tests`;

    const commentId = await provider.createComment(commentBody);
    console.log(`Created comment with ID: ${commentId}`);

    // Output comment ID for later use
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import("fs");
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `claude_comment_id=${commentId}\n`,
      );
    }

    // Also set as environment variable for GitLab
    process.env.CLAUDE_COMMENT_ID = commentId.toString();

    // Step 8: GitLab-specific setup
    console.log("GitLab mode - creating prompt for Claude");

    // Configure git for GitLab
    await provider.setupGitAuth(token);

    // Fetch context data
    const contextData = await provider.fetchContextData();

    // Create prompt directory
    const promptDir = "/tmp/claude-prompts";
    await $`mkdir -p ${promptDir}`.quiet();

    // Generate prompt based on context
    let prompt = "";

    if (context.isPR && contextData.iid) {
      // Merge request context
      prompt = `You are Claude, an AI assistant helping with GitLab merge requests.

## Merge Request Context

**Title:** ${contextData.title}
**Description:** ${contextData.description || "No description provided"}
**Source Branch:** ${contextData.sourceBranch} → **Target Branch:** ${contextData.targetBranch}
**State:** ${contextData.state}
**Author:** ${contextData.author.name} (@${contextData.author.username})
**Web URL:** ${contextData.webUrl}

## Code Changes

${
  contextData.changes
    ?.map(
      (change: any) => `
### ${change.new_file ? "📄 New File" : change.deleted_file ? "🗑️ Deleted File" : change.renamed_file ? "📝 Renamed File" : "✏️ Modified File"}: \`${change.new_path}\`

\`\`\`diff
${change.diff}
\`\`\`
`,
    )
    .join("\n") || "No changes available"
}

## Existing Comments/Discussions

${
  contextData.discussions?.length > 0
    ? contextData.discussions
        .map((discussion: any) =>
          discussion.notes
            .map(
              (note: any) => `
**${note.author.name}** (${note.created_at}):
${note.body}
`,
            )
            .join("\n"),
        )
        .join("\n---\n")
    : "No existing comments"
}

## Your Task

${directPrompt || "Please analyze this merge request and provide feedback on code quality, potential issues, and suggestions for improvement."}

When providing feedback, be specific and reference exact line numbers and file paths.`;
    } else {
      // Issue or manual trigger context
      prompt = `You are Claude, an AI assistant helping with GitLab projects.

## Project Context

**Project ID:** ${contextData.projectId}
**Host:** ${contextData.host}
**User:** ${contextData.userName}

## Your Task

${directPrompt || "Please help with the requested task."}`;
    }

    // Write prompt file
    const fs = await import("fs");
    await fs.promises.writeFile(`${promptDir}/claude-prompt.txt`, prompt);
    console.log("✅ Created prompt file for Claude");

    // GitLab doesn't need MCP config for now
    core.setOutput("mcp_config", "");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);

    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);

    // Try to update comment with error if we have a provider and comment ID
    if (provider && process.env.CLAUDE_COMMENT_ID) {
      try {
        await provider.updateComment(
          parseInt(process.env.CLAUDE_COMMENT_ID),
          `❌ Failed to prepare: ${errorMessage}`,
        );
      } catch (updateError) {
        console.error("Failed to update comment with error:", updateError);
      }
    }

    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
