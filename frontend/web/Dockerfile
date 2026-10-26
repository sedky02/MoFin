# syntax=docker/dockerfile:1

# MoFin web image: Next.js standalone output (output: "standalone" in
# next.config.ts) served by its minimal server.js on Node 22 LTS.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencies ------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build -------------------------------------------------------------------
FROM base AS build
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they are build args, not runtime env.
ARG NEXT_PUBLIC_MCP_URL=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_MCP_URL=${NEXT_PUBLIC_MCP_URL}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# server.js and the traced node_modules; static assets and public/ are not
# part of the standalone output and are copied next to it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# The official image ships an unprivileged `node` user.
USER node
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
