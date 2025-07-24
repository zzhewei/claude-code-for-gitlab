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

# Build both server and client
RUN bun run build

# Production stage - using Node.js runtime
FROM node:22-slim

WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install system dependencies
RUN apt-get update && apt-get install -y \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies from previous stages
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Create necessary directories
RUN mkdir -p logs data && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); });"

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server/dist/server.js"]