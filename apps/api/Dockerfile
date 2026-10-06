# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.2-alpine AS dependencies
WORKDIR /opt/app

COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.2-alpine AS runtime
WORKDIR /opt/app

ARG RELEASE_VERSION=unversioned
ARG RELEASE_REVISION=unknown
ARG RELEASE_SOURCE=local

LABEL org.opencontainers.image.title="SSC QR Attendance API" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.revision="${RELEASE_REVISION}" \
      org.opencontainers.image.source="${RELEASE_SOURCE}"

ENV APP_ENV=production \
    NODE_ENV=production \
    AUTO_MIGRATE=false \
    LISTEN_HOST=0.0.0.0 \
    PORT=8080 \
    RELEASE_VERSION=${RELEASE_VERSION} \
    RELEASE_REVISION=${RELEASE_REVISION}

COPY --from=dependencies --chown=bun:bun /opt/app/node_modules ./node_modules
COPY --chown=bun:bun apps/api/package.json apps/api/bun.lock ./
COPY --chown=bun:bun apps/api/src ./src
COPY --chown=bun:bun apps/api/scripts/migrate.ts ./scripts/migrate.ts
COPY --chown=bun:bun apps/api/public ./public

USER bun
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "const port = process.env.PORT ?? '8080'; const response = await fetch('http://127.0.0.1:' + port + '/api/v2/health'); if (!response.ok) process.exit(1);"]

CMD ["bun", "run", "start"]
