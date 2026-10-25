# syntax=docker/dockerfile:1

# MoFin API image: NestJS + Prisma on Node 22 LTS.
# Debian slim rather than Alpine: Prisma's schema engine and bcrypt's prebuilt
# binary both target glibc, and Prisma needs OpenSSL at runtime.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- All dependencies, for compiling -----------------------------------------
FROM base AS deps
# prisma.config.ts reads DATABASE_URL; `prisma generate` (run by postinstall)
# never connects, so a placeholder is enough at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# --- Compile -----------------------------------------------------------------
FROM deps AS build
COPY . .
# nest build compiles everything tsconfig.build.json includes: src/ lands in
# dist/src, and prisma/seed.ts (when present) in dist/prisma.
RUN npm run build

# --- Production dependencies only --------------------------------------------
FROM base AS prod-deps
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, so the client is generated here too.
RUN npm ci --omit=dev && npm cache clean --force

# --- Runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts docker-entrypoint.sh ./
COPY --chown=node:node prisma ./prisma

# The official image ships an unprivileged `node` user (uid 1000).
USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
