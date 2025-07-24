# Dependencies stage - install all dependencies
FROM oven/bun:1-alpine AS dependencies

WORKDIR /app

# Copy all package files
COPY package.json bun.lockb* ./
COPY client/package.json ./client/

# Install root dependencies
RUN bun install --frozen-lockfile

# Install client dependencies  
WORKDIR /app/client
RUN bun install --frozen-lockfile

# Build stage
FROM oven/bun:1-alpine AS build

WORKDIR /app

# Copy source code and dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/client/node_modules ./client/node_modules
COPY . .

# Build client only (server runs directly from TypeScript)
RUN bun run build

# Create client/dist directory if it doesn't exist (for when client build is skipped)
RUN mkdir -p /app/client/dist

# Production stage - using Bun runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Install system dependencies (if needed)
RUN apk add --no-cache dumb-init

# Copy built client and source code
COPY --from=build /app/client/dist ./client/dist
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./

# Create necessary directories
RUN mkdir -p logs data && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Health check (using Bun)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "const res = await fetch('http://localhost:3000/health'); process.exit(res.ok ? 0 : 1);"

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application with Bun
CMD ["bun", "run", "server/hono-server.ts"]