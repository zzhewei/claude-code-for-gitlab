# Simulate GitHub Actions environment
FROM node:18

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Set up working directory structure like GitHub Actions
RUN mkdir -p /home/runner/work/test-repo/test-repo
RUN mkdir -p /home/runner/work/_actions/anthropics/claude-code-action/main

# Copy the action code
WORKDIR /home/runner/work/_actions/anthropics/claude-code-action/main
COPY . .

# Install dependencies
RUN bun install

# Set up test repository
WORKDIR /home/runner/work/test-repo/test-repo
RUN mkdir -p api/api/sampling/stages
RUN echo "# Test file" > api/api/sampling/stages/partial_completion_processing.py

# Set GitHub Actions environment variables
ENV GITHUB_WORKSPACE=/home/runner/work/test-repo/test-repo
ENV GITHUB_ACTION_PATH=/home/runner/work/_actions/anthropics/claude-code-action/main

# Create test script
RUN cat > /test-mcp.sh << 'EOF'
#!/bin/bash
echo "=== Testing MCP Server ==="
echo "GITHUB_WORKSPACE: $GITHUB_WORKSPACE"
echo "Current directory: $(pwd)"
echo "Files in repo:"
find . -name "*.py" | head -5

# Run the MCP server test
cd $GITHUB_ACTION_PATH
bun test test/mcp-server-integration.test.ts
EOF

RUN chmod +x /test-mcp.sh

CMD ["/test-mcp.sh"]