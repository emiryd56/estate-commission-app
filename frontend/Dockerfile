# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────
# 1) deps: install all dependencies
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ──────────────────────────────────────────────────────────────
# 2) build: run Nuxt build → .output/
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────
# 3) runner: ship only the Nitro server bundle
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

RUN addgroup -S nodejs && adduser -S nuxt -G nodejs

# Nuxt's Nitro output is fully self-contained in .output/
COPY --chown=nuxt:nodejs --from=build /app/.output ./.output

USER nuxt
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
