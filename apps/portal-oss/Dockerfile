# syntax=docker/dockerfile:1
#
# Astro Portal — container image of the open-source composition
# (docs/SELF_HOSTING.md, « Docker »). Built from the repository's root:
#
#   docker build -f apps/portal-oss/Dockerfile -t astro-portal .
#   docker run -p 8787:8787 -v astro-portal-data:/data \
#     -e ASTRO_PORTAL_AUTH_MODE=password \
#     -e ASTRO_PORTAL_SIGN_IN_KEY="$(openssl rand -base64 32)" \
#     -e ASTRO_PORTAL_BOOTSTRAP_SECRET="$(openssl rand -base64 24)" \
#     astro-portal
#
# The service keeps everything it writes under /data (a volume): its SQLite
# database, its runtime files, the images and captures, its backups. The
# custom server (apps/portal-oss/server.mjs) starts Next.js itself and
# imports the compiled workspace packages, so the image ships the installed
# production dependencies, the compiled packages, the built application,
# the Stellarium assets (public/) and the demonstration catalogue
# (examples/). No native build tooling is needed.
#
# The runtime image is distroless: no shell, no package manager; the
# service runs as an unprivileged user.

ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/cc-debian12

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY . .
RUN npm ci \
    && npm run build:oss \
    && npm prune --omit=dev \
    && rm -rf apps/portal-oss/.next/cache \
    && find apps/portal-oss/.next -type f -name '*.map' -delete

FROM ${NODE_IMAGE} AS identity
RUN groupadd --gid 1001 astro \
    && useradd --uid 1001 --gid astro --home-dir /app --shell /usr/sbin/nologin astro \
    && mkdir -p /data

FROM ${RUNTIME_IMAGE} AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    ASTRO_PORTAL_DATABASE_PATH=/data/astro-portal.sqlite \
    ASTRO_PORTAL_RUNTIME_DIR=/data/runtime \
    ASTRO_PORTAL_IMAGES_DIR=/data/images \
    ASTRO_PORTAL_METADATA_DIR=/data/catalog \
    ASTRO_PORTAL_BACKUP_DIR=/data/backups
COPY --from=identity /etc/passwd /etc/group /etc/
COPY --from=identity /usr/local/bin/node /usr/local/bin/node
COPY --from=identity --chown=1001:1001 /data /data
COPY --from=builder --chown=1001:1001 /app /app
# The commit the image is built from, shown in the footer (`sha-<short>`):
# the build context has no .git, so the builder of the image passes it
# (deploy/install.sh through compose.yaml). Empty: the footer shows the
# version alone.
ARG ASTRO_PORTAL_BUILD_ID=
ENV ASTRO_PORTAL_BUILD_ID=${ASTRO_PORTAL_BUILD_ID}
WORKDIR /app
USER 1001:1001
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/service').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["/usr/local/bin/node", "apps/portal-oss/server.mjs"]
