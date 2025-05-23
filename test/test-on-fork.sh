#!/bin/bash

# This script helps test the claude-code-action on a fork
# Usage: ./test-on-fork.sh <your-github-username>

USERNAME=${1:-your-username}

echo "=== Testing Claude Code Action on Fork ==="
echo ""
echo "1. First, fork the claude-code-action repo to your account"
echo "2. Push the changes to a branch in your fork:"
echo ""
echo "   git remote add fork https://github.com/$USERNAME/claude-code-action.git"
echo "   git push fork HEAD:test-mcp-fix"
echo ""
echo "3. Create a test repository with a workflow that uses your fork:"
echo ""
cat << 'EOF'
name: Test Claude Code Action

on:
  issue_comment:
    types: [created]

jobs:
  claude-test:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR-USERNAME/claude-code-action@test-mcp-fix
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
EOF
echo ""
echo "4. Create a test file in the repo:"
echo "   mkdir -p api/api/sampling/stages"
echo "   echo '# test' > api/api/sampling/stages/partial_completion_processing.py"
echo ""
echo "5. Create a PR and comment: @claude please update the test file"
echo ""
echo "This will test the actual GitHub Action with your fixes!"