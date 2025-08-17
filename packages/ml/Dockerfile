# Multi-stage build for ML service
FROM node:18-alpine AS base

# Install Python and ML dependencies
FROM base AS deps
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    build-base \
    libc6-compat \
    libffi-dev

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/ml/package*.json ./packages/ml/
COPY packages/shared/package*.json ./packages/shared/

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Install Python dependencies
COPY packages/ml/requirements.txt ./packages/ml/
RUN pip3 install --no-cache-dir -r packages/ml/requirements.txt

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build shared package first
RUN npm run build --workspace=packages/shared

# Build ML package
RUN npm run build --workspace=packages/ml

# Production image
FROM base AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    libc6-compat

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mluser

# Copy built application
COPY --from=builder --chown=mluser:nodejs /app/packages/ml/dist ./dist
COPY --from=builder --chown=mluser:nodejs /app/packages/shared/dist ./shared/dist
COPY --from=deps --chown=mluser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mluser:nodejs /app/packages/ml/package.json ./package.json

# Copy Python dependencies
COPY --from=deps /usr/lib/python3.*/site-packages /usr/lib/python3.11/site-packages

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHONPATH=/usr/lib/python3.11/site-packages

# Expose port
EXPOSE 3001

# Switch to non-root user
USER mluser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]