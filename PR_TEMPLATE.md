# Fix MCP server undefined error and file path resolution

## Problem

The `mcp__github_file_ops__commit_files` tool was failing with "Error calling tool commit_files: undefined" when Claude tried to commit files through the GitHub Action.

## Root Causes

1. **Error format mismatch**: The MCP server returned errors with the message in a `content` field, but the claude-cli-internal client expected it in an `error` field
2. **Working directory mismatch**: The MCP server couldn't find repository files because it was looking in the wrong directory

## Solution

1. Added `error` field to error responses in both `commit_files` and `delete_files` tools
2. Added `REPO_DIR` environment variable support to the MCP server
3. Updated file reading to use `REPO_DIR` for correct path resolution
4. Pass `GITHUB_WORKSPACE` to the MCP server configuration

## Changes

### `src/mcp/github-file-ops-server.ts`

- Added `error` field to error response objects
- Added `REPO_DIR` environment variable (defaults to `process.cwd()`)
- Updated file reading to construct full paths using `REPO_DIR`
- Simplified path processing logic

### `src/mcp/install-mcp-server.ts`

- Added `REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd()` to MCP server environment

## Testing

- Created local tests to verify error format fix
- Confirmed that "undefined" errors are now replaced with actual error messages
- Verified that the MCP server can handle both relative and absolute file paths

## Impact

- Fixes the immediate "undefined" error issue
- Enables proper file path resolution in GitHub Actions environment
- Provides clearer error messages for debugging

Fixes #[issue-number-if-applicable]
