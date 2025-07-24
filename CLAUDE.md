# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains the **claude-code-action** project - a GitHub Action for integrating Claude AI with GitHub repositories and pull requests.

## Common Development Commands

### Setup and Installation
```bash
# Install dependencies
bun install

# Install git pre-push hooks
bun run install-hooks
```

### Core Development Tasks
```bash
# Run tests
bun test

# Type checking
bun run typecheck

# Format code
bun run format

# Check formatting (no changes)
bun run format:check
```

### Development Workflow
After making changes, the pre-push hook automatically runs:
1. Format check (auto-formats if needed)
2. TypeScript type checking  
3. Test suite

To run these checks manually before pushing:
```bash
bun run format:check && bun run typecheck && bun test
```

## Architecture

### Technology Stack
- **Runtime**: Bun (v1.2.11+)
- **Language**: TypeScript (strict mode)
- **Key Libraries**:
  - @modelcontextprotocol/sdk (MCP support)
  - @octokit/* (GitHub API)
  - zod (schema validation)

### Project Structure
```
├── src/
│   ├── entrypoints/      # Main entry points
│   ├── github/           # GitHub-specific logic
│   ├── providers/        # AI provider abstraction
│   ├── mcp/             # MCP server integration
│   ├── create-prompt/    # Prompt generation
│   └── utils/           # Shared utilities
├── test/                # Test files
├── examples/            # Example workflows
└── action.yml          # GitHub Action metadata
```

### Key Components
- **Trigger Detection**: Responds to comments with trigger phrase (default: `@claude`)
- **Context Gathering**: Fetches PR data and formats for AI processing
- **Provider Support**: Direct Anthropic API, AWS Bedrock, Google Vertex AI
- **MCP Integration**: Extensible tool support via Model Context Protocol
- **Progress Tracking**: Dynamic comment updates with checkboxes

## Important Implementation Notes

- Runs TypeScript directly with Bun (no build step)
- All commits are automatically signed
- OIDC authentication used for cloud providers (Bedrock/Vertex)
- Supports CI/CD log access with proper permissions