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

# Build Next.js (skip portal pages that require full setup)
RUN rm -rf apps/gateway/src/app/\(portal\) && pnpm --filter @apps/gateway build

# Stage 2: Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy standalone output
COPY --from=builder /app/apps/gateway/.next/standalone ./
COPY --from=builder /app/apps/gateway/.next/static ./apps/gateway/.next/static
RUN mkdir -p ./apps/gateway/public

# Copy Prisma generated client (needed at runtime by DAL)
COPY --from=builder /app/packages/database/generated ./packages/database/generated

# Copy server.js from standalone
# Next.js standalone outputs server.js at the root
EXPOSE 8080

# Find and run the standalone server entrypoint
CMD ["sh", "-c", "exec node $(find . -name server.js -path '*/apps/gateway/*' | head -1)"]
