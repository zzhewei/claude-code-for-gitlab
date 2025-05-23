#!/bin/bash

# Script to create the PR with the fix

echo "=== Creating PR for MCP server fix ==="
echo ""
echo "1. First, make sure you've committed the changes:"
echo ""
echo "   git add src/mcp/github-file-ops-server.ts src/mcp/install-mcp-server.ts"
echo "   git commit -m 'Fix MCP server undefined error and file path resolution'"
echo ""
echo "2. Push to a new branch:"
echo ""
echo "   git checkout -b fix-mcp-undefined-error"
echo "   git push origin fix-mcp-undefined-error"
echo ""
echo "3. Create PR using GitHub CLI:"
echo ""
echo "   gh pr create \\"
echo "     --title 'Fix MCP server undefined error and file path resolution' \\"
echo "     --body-file PR_TEMPLATE.md \\"
echo "     --base main"
echo ""
echo "Or create it manually on GitHub with the content from PR_TEMPLATE.md"