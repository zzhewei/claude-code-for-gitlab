# Multi-stage build for smaller production image
FROM node:22-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev) for potential build steps
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Copy test directory if it exists
COPY test* ./test/

# Run tests in build stage if test directory exists
RUN if [ -d "./test" ]; then npm test || true; fi

# Production stage
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
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force && \
    npm audit fix --audit-level=moderate || true

# Copy source code from builder
COPY --from=builder /app/src ./src/

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
LABEL maintainer="imWildCat Inc" \
      version="1.0.0" \
      description="Claude Code GitLab Webhook Service" \
      org.opencontainers.image.source="https://github.com/RealMikeChong/claude-code-for-gitlab" \
      org.opencontainers.image.vendor="imWildCat Inc" \
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

# Start the application
CMD ["node", "src/server.js"]