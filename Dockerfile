# Multi-stage build for production deployment
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/ml/package*.json ./packages/ml/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build the application
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build shared package first
WORKDIR /app/packages/shared
RUN npm ci && npm run build

# Build API
WORKDIR /app/packages/api
RUN npm ci && npm run build

# Build ML package
WORKDIR /app/packages/ml
RUN npm ci

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/package*.json ./packages/api/
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=deps /app/node_modules ./node_modules

# Set correct permissions
USER nextjs

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "packages/api/dist/index.js"]