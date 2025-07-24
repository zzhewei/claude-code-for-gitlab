# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that integrates Claude into GitHub workflows, forked with the intention of adding GitLab support. The action enables Claude to respond to comments, review code, implement changes, and interact with PRs/issues.

## Development Environment

- **Runtime**: Bun 1.2.11
- **Language**: TypeScript with strict type checking
- **Package Manager**: Bun

## Development Commands

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

### Two-Layer Structure

1. **Main Action Layer** (`/src/`): GitHub-specific integrations, triggers, and orchestration
2. **Base Action Layer** (`/base-action/`): Core Claude Code execution logic

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
- **Trigger System** (`src/check-trigger.ts`): Detects `@claude` mentions in comments/issues
- **Context Gathering** (`src/github/github-data-fetcher.ts`): Fetches PR/issue data, comments, files
- **Branch Management** (`src/github/branch-manager.ts`): Creates and manages branches for Claude's work
- **Progress Tracking** (`src/update-comment-with-link.ts`): Updates single comment with checkboxes
- **MCP Integration** (`src/mcp/`): Extends Claude's capabilities with GitHub-specific tools

### Authentication Flow

1. GitHub App or Personal Access Token authentication
2. OIDC token exchange for secure GitHub interactions
3. Token passed to MCP servers for API access

## GitLab Support Considerations

The codebase is currently GitHub-specific. To add GitLab support:

1. **Abstract VCS Layer**: Create interfaces in a new `/src/vcs/` directory for common operations
2. **Implement GitLab Providers**: Mirror `/src/github/` structure in `/src/gitlab/`
3. **Adapt Authentication**: GitLab uses different auth mechanisms (personal/project/group tokens)
4. **Update MCP Servers**: Make VCS-agnostic or create GitLab-specific versions
5. **Modify Entry Points**: Add VCS detection in `/src/entrypoints/`

### Key Files for GitLab Integration

- `/src/github/` → Need parallel `/src/gitlab/` implementation
- `/src/check-trigger.ts` → Make VCS-agnostic
- `/src/entrypoints/prepare.ts` → Add VCS detection logic
- `/src/mcp/install-mcp-servers.ts` → Support GitLab MCP servers
- `action.yml` → Create `.gitlab-ci.yml` equivalent

## Testing

Tests use Bun's built-in test runner. Test files are in `/test/` directory.

```bash
# Run all tests
bun test

# Run specific test file
bun test test/github-data-formatter.test.ts
```

## Important Implementation Notes

- Runs TypeScript directly with Bun (no build step)
- All commits are automatically signed
- OIDC authentication used for cloud providers (Bedrock/Vertex)
- Supports CI/CD log access with proper permissions
- The action creates a single comment that it updates with progress checkboxes
- Branch names follow patterns: `claude/issue-{number}` or `claude/pr-{number}-{timestamp}`
- All GitHub API calls use Octokit clients with proper error handling
- The action supports multiple Claude providers (Anthropic API, AWS Bedrock, Google Vertex AI)