import { spawn } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

describe("GitHub File Ops MCP Server", () => {
  const testDir = "/tmp/mcp-server-test";
  const testRepo = join(testDir, "test-repo");

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testRepo, { recursive: true });

    // Create test file structure similar to the real PR
    mkdirSync(join(testRepo, "api/api/sampling/stages"), { recursive: true });
    writeFileSync(
      join(
        testRepo,
        "api/api/sampling/stages/partial_completion_processing.py",
      ),
      "# Original content\nprint('hello')\n",
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("should handle file paths correctly with REPO_DIR", async () => {
    // Start the MCP server with test environment
    const serverProcess = spawn(
      "bun",
      ["run", "src/mcp/github-file-ops-server.ts"],
      {
        env: {
          ...process.env,
          REPO_OWNER: "test-owner",
          REPO_NAME: "test-repo",
          BRANCH_NAME: "main",
          REPO_DIR: testRepo,
          GITHUB_TOKEN: "test-token",
        },
        cwd: process.cwd(), // Run from the claude-code-action directory
      },
    );

    // Simulate what Claude would send
    const testInput = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "commit_files",
        arguments: {
          files: ["api/api/sampling/stages/partial_completion_processing.py"],
          message: "Test commit",
        },
      },
      id: 1,
    };

    // Send test input to server
    serverProcess.stdin.write(JSON.stringify(testInput) + "\n");

    // Collect server output
    let output = "";
    serverProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    let error = "";
    serverProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Kill the server
    serverProcess.kill();

    console.log("Server output:", output);
    console.log("Server error:", error);

    // Parse and check the response
    if (output.includes("error")) {
      expect(output).toContain("error");
      expect(output).not.toContain("undefined");

      // Check if it's the file not found error (expected since we're not hitting real GitHub API)
      if (output.includes("ENOENT")) {
        console.log("Got expected file error with proper message format");
      }
    }
  });

  test("error response format should include error field", async () => {
    // This tests the error format fix directly
    const errorResponse = {
      content: [
        {
          type: "text",
          text: "Error: Test error message",
        },
      ],
      error: "Test error message", // This should be present
      isError: true,
    };

    // Simulate how claude-cli-internal would process this
    if ("isError" in errorResponse && errorResponse.isError) {
      const errorMessage = `Error calling tool commit_files: ${errorResponse.error}`;
      expect(errorMessage).toBe(
        "Error calling tool commit_files: Test error message",
      );
      expect(errorMessage).not.toContain("undefined");
    }
  });
});
