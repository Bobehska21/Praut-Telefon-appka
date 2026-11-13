# syntax=docker/dockerfile:1
# Build from repository root: docker build -f server/Dockerfile -t focus-server:<tag> .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --include=dev
COPY server/src ./src
COPY server/scripts ./scripts
RUN npm run build

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN groupadd --gid 10001 focus && useradd --uid 10001 --gid focus --no-create-home focus
COPY --from=dependencies --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --chown=10001:10001 server/package.json ./package.json
COPY --chown=10001:10001 server/migrations ./migrations
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
