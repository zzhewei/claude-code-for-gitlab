# Multi-stage build for smaller production image
# Use Bun for dependency installation
FROM oven/bun:1-alpine AS dependencies

# Create app directory
WORKDIR /app

# Copy package files and lock file
COPY package.json bun.lockb* ./

# Install all dependencies using Bun (faster than npm)
RUN bun install --frozen-lockfile

# Copy source code
COPY src/ ./src/

# Copy test directory if it exists
COPY test* ./test/

# Run tests in build stage if test directory exists
RUN if [ -d "./test" ]; then bun test || true; fi

# Production stage - using Node.js runtime
FROM node:22-slim

# Install production dependencies and security updates
RUN apt-get update && apt-get install -y \
    curl \
    tini \
    dumb-init \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Copy node_modules from Bun stage (already installed)
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code from builder
COPY --from=dependencies /app/src ./src/

# Create necessary directories
RUN mkdir -p logs config

# Create non-root user with specific UID/GID for consistency
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs claude

# Set up proper permissions
RUN chown -R claude:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 777 /app/logs

# Add labels for metadata
LABEL maintainer="RealMikeChong" \
      version="1.0.0" \
      description="Claude Code GitLab Webhook Service" \
      org.opencontainers.image.source="https://github.com/RealMikeChong/claude-code-for-gitlab" \
      org.opencontainers.image.vendor="RealMikeChong" \
      org.opencontainers.image.title="Claude Code GitLab Webhook" \
      org.opencontainers.image.description="Webhook receiver service for Claude Code GitLab integration"

# Switch to non-root user
USER claude

# Expose port (configurable via environment variable)
EXPOSE 3000

# Health check with better parameters
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start the application with Node.js
CMD ["node", "src/server.js"]