# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

ARG DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/worldpay
ENV DATABASE_URL=$DATABASE_URL

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root files
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json package.json tsconfig.json ./

# Copy workspace packages
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY packages/database ./packages/database
COPY packages/dal ./packages/dal
COPY packages/ui ./packages/ui
COPY packages/gateway-core ./packages/gateway-core
COPY packages/validators ./packages/validators
COPY packages/worldpay-client ./packages/worldpay-client

# Copy app
COPY apps/gateway ./apps/gateway

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @repo/database db:generate

# Build Next.js
RUN pnpm --filter @apps/gateway build

# Stage 2: Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy standalone output
COPY --from=builder /app/apps/gateway/.next/standalone ./

# Turbopack standalone doesn't include static assets — copy them into the .next dir
COPY --from=builder /app/apps/gateway/.next/static /tmp/next-static
RUN mkdir -p apps/gateway/.next && cp -r /tmp/next-static apps/gateway/.next/static && \
    (for dir in projects/*/apps/gateway/.next; do cp -r /tmp/next-static "$dir/static"; done) || true

# Copy public directory
RUN mkdir -p ./apps/gateway/public

# Copy Prisma generated client (needed at runtime by DAL)
COPY --from=builder /app/packages/database/generated ./packages/database/generated
# Copy prisma schema for db push
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

# Install prisma CLI for db push on startup
RUN npm install -g prisma@7

# Copy server.js from standalone
# Next.js standalone outputs server.js at the root
EXPOSE 8080

# Find and run the standalone server entrypoint
# Run prisma db push (schema migration), then start server
CMD ["sh", "-c", "cd packages/database && prisma db push --accept-data-loss --skip-generate && cd /app && exec node apps/gateway/server.js"]
