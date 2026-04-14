# syntax=docker/dockerfile:1.7
# ---------- build: install workspace deps and compile every app
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.3.4
ENV CI=true
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY e2e/package.json ./e2e/package.json
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @openpax/dashboard build \
 && pnpm --filter @openpax/widget build \
 && pnpm --filter @openpax/server build

# ---------- runtime deps: only the server's production dependencies
FROM node:24-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@12.3.4
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/emails/package.json ./packages/emails/package.json
RUN pnpm install --frozen-lockfile --prod --filter @openpax/server... \
 && pnpm store prune

# ---------- runtime
FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MIGRATIONS_DIR=/app/migrations
ENV DASHBOARD_DIST=/app/public/dashboard
ENV WIDGET_DIST=/app/public/widget
WORKDIR /app
RUN groupadd -r openpax && useradd -r -g openpax -d /app openpax
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/packages/db/migrations ./migrations
COPY --from=build /app/apps/dashboard/dist ./public/dashboard
COPY --from=build /app/apps/widget/dist ./public/widget
USER openpax
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.mjs"]
