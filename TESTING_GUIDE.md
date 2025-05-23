# Testing the MCP Server Fix

## Changes Made

The following files were modified to fix the "undefined" error issue:

1. `src/mcp/github-file-ops-server.ts`

   - Added `error` field to error responses
   - Added `REPO_DIR` environment variable support
   - Fixed file path resolution

2. `src/mcp/install-mcp-server.ts`
   - Added `REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd()` to MCP server config

## Testing Instructions

### Step 1: Fork and Push Changes

```bash
# 1. Fork the claude-code-action repo on GitHub (use the web UI)

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/claude-code-action.git
cd claude-code-action

# 3. Copy the modified files from this directory
cp /Users/lina/code/public1/claude-code-action/src/mcp/github-file-ops-server.ts src/mcp/
cp /Users/lina/code/public1/claude-code-action/src/mcp/install-mcp-server.ts src/mcp/

# 4. Commit and push
git checkout -b fix-mcp-undefined-error
git add src/mcp/github-file-ops-server.ts src/mcp/install-mcp-server.ts
git commit -m "Fix MCP server undefined error and file path resolution"
git push origin fix-mcp-undefined-error
```

### Step 2: Create Test Repository

Create a new repository on GitHub called `claude-action-test` with this structure:

```
claude-action-test/
├── .github/
│   └── workflows/
│       └── claude.yml
├── api/
│   └── api/
│       └── sampling/
│           └── stages/
│               └── partial_completion_processing.py
└── README.md
```

### Step 3: Set Up the Test Workflow

Create `.github/workflows/claude.yml`:

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: YOUR_USERNAME/claude-code-action@fix-mcp-undefined-error
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 4: Add Test Files

Create `api/api/sampling/stages/partial_completion_processing.py`:

```python
# Test file for Claude to modify
def hello():
    print("Original content")
```

### Step 5: Configure and Test

1. Add your Anthropic API key to the repository secrets:

   - Go to Settings > Secrets and variables > Actions
   - Add `ANTHROPIC_API_KEY`

2. Create a pull request in the test repository

3. Comment on the PR:
   ```
   @claude please add error handling to the hello function in api/api/sampling/stages/partial_completion_processing.py
   ```

### Expected Results

- **Before Fix**: "Error calling tool commit_files: undefined"
- **After Fix**: Should either succeed or show a proper error message like "Error calling tool commit_files: ENOENT: no such file or directory..."

## Debugging

Check the GitHub Actions logs:

1. Go to Actions tab
2. Click on the workflow run
3. Look for the error messages in the logs

The fix ensures that:

1. Error messages are properly formatted (no more "undefined")
2. Files are read from the correct directory (GITHUB_WORKSPACE)
