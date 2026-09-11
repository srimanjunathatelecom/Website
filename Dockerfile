# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Production image for SMS Stores.
#
#   docker build -t sms-stores .
#   docker run --env-file .env -p 3000:3000 sms-stores
#
# Three stages: install deps with the lockfile, build, then a minimal runner
# that contains only the standalone server output — no dev dependencies, no
# source tree, running as a non-root user.
#
# Migrations run automatically at container start (scripts/migrate.mjs is
# idempotent: applied files are recorded in schema_migrations, so a restart
# is a no-op and an interrupted deploy resumes where it stopped).
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build needs no real secrets: every page is server-rendered on demand,
# so nothing connects to the database at build time.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Non-root user; the app writes nothing to disk.
RUN addgroup -S app && adduser -S app -G app

# The standalone output ships its own trimmed node_modules (pg included, which
# is all scripts/migrate.mjs needs). Static assets and /public are served by
# the same server and just need to sit in the expected folders.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=app:app /app/migrations ./migrations

USER app
EXPOSE 3000

# /api/health returns non-200 when required configuration is missing or the
# database is unreachable, so the container reports unhealthy instead of
# sitting in a restart loop that looks alive from the outside.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
