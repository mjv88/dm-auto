# Deployment Guide — tcx-runner-api

## Overview

`tcx-runner-api` is a Fastify microservice that runs inside a Docker container, managed by **Coolify** on a **Hetzner** dedicated instance. It connects to a PostgreSQL 16 database and exposes a REST API on port 3001.

---

## Coolify Setup

### 1. Create a new Resource

1. In Coolify, go to **Resources → New Resource → Docker Image / Dockerfile**.
2. Connect your GitHub repository (`tcx-runner-api`).
3. Set **Build Pack** to `Dockerfile`.
4. Set **Port** to `3001`.
5. Set **Health Check Path** to `/health`.

### 2. Configure the Database

1. In Coolify, create a **PostgreSQL 16** service (or connect an existing one).
2. Note the internal connection string — it will look like:
   ```
   postgresql://runner:password@postgres:5432/runner_app
   ```
3. Set `DATABASE_URL` in the environment variables (see below).

### 3. Set Environment Variables

In Coolify → Resource → Environment Variables, set **all** of the following:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `ENCRYPTION_KEY` | **Yes** | 64-char hex string (AES-256 key for xAPI credential storage). Generate with: `openssl rand -hex 32` |
| `ENTRA_CLIENT_ID` | **Yes** | Azure App Registration client ID |
| `ENTRA_CLIENT_SECRET` | **Yes** | Azure App Registration secret |
| `JWT_SECRET` | **Yes** | 64-char random string for session tokens. Generate with: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | **Yes** | URL of the Runner PWA (e.g. `https://runner.customer.com`). Used for CORS. |
| `NODE_ENV` | **Yes** | Set to `production` |
| `JWT_EXPIRES_IN` | No | Session duration (default: `8h`) |
| `PORT` | No | HTTP port (default: `3001`) |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |
| `RATE_LIMIT_MAX` | No | Max switches per window per extension (default: `10`, recommended: `25` in prod) |
| `RATE_LIMIT_WINDOW` | No | Rate limit window in ms (default: `3600000` = 1 hour) |
| `COOLIFY_URL` | No | Coolify base URL for system management (e.g. `https://coolify.tcx-hub.com`) |
| `COOLIFY_API_TOKEN` | No | Coolify API token — required if `COOLIFY_URL` is set |
| `SERVER_SSH_HOST` | No | Server IP address for Docker prune via SSH (used by `POST /admin/system/docker-prune`) |
| `SERVER_SSH_KEY` | No | PEM private key string for SSH access — store the full key content as an env var |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |
| `ENTRA_TENANT_ID` | No | Legacy single-tenant var (multi-tenant setup uses DB) |
| `ENTRA_RUNNERS_GROUP_ID` | No | Legacy single-tenant var (multi-tenant setup uses DB) |

### 4. Configure Deployment Triggers

1. Enable **Auto Deploy on Push** for the `main` branch.
2. Optionally set a **Webhook** from GitHub Actions for CD via GitHub Actions.

---

## First-Run Migration

After the container starts for the first time, run the database migrations:

```bash
# Option A: run inside the running container
docker exec -it <container-name> node dist/db/migrate.js

# Option B: use Coolify's "Execute Command" feature
node dist/db/migrate.js
```

Or set Coolify to run the migration as a **pre-deploy command**:
```
node dist/db/migrate.js
```

The migration runner (`src/db/migrate.ts`) applies all pending SQL files from `src/db/migrations/` in order and is idempotent — safe to run on every deploy.

---

## Smoke Test Checklist

After deploying, verify the service is healthy:

- [ ] **Health check passes**
  ```bash
  curl https://runner-api.customer.com/health
  # Expected: {"status":"ok","version":"1.0.0","db":"connected","uptime":<n>}
  ```

- [ ] **DB is connected** — `db` field in health response is `"connected"` (not `"disconnected"`)

- [ ] **CORS headers present** — send a request with `Origin: https://runner.customer.com` and verify `Access-Control-Allow-Origin` is echoed back

- [ ] **Security headers present** — confirm response includes:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'self'; ...`

- [ ] **Auth rejects bad tokens**
  ```bash
  curl -X POST https://runner-api.customer.com/runner/auth \
    -H "Content-Type: application/json" \
    -d '{"idToken":"invalid"}'
  # Expected: 400 VALIDATION_ERROR (token too short)
  ```

- [ ] **Rate limiting active** — `x-ratelimit-limit` header is present on responses

- [ ] **Non-root user** — verify container runs as UID 1001 (fastify):
  ```bash
  docker exec <container-name> id
  # Expected: uid=1001(fastify) gid=1001(nodejs)
  ```

---

## Rolling Updates

Coolify handles zero-downtime rolling updates automatically when configured with:
- **Replicas**: 2+ for zero downtime
- **Health Check**: `/health` with a 10-second start period

Migrations run before the new container serves traffic — ensure the migration SQL is always backward-compatible with the previous container version.

---

## Logs

View logs in Coolify → Resource → Logs, or via Docker:

```bash
docker logs <container-name> --follow
```

Structured JSON logs (pino) are written to stdout. In production, pipe to your log aggregator.

---

## Environment Variable Checklist (quick reference)

```bash
# Copy and fill in before first deploy:
DATABASE_URL=postgresql://runner:password@postgres:5432/runner_app
ENCRYPTION_KEY=<openssl rand -hex 32>
ENTRA_CLIENT_ID=<from Azure App Registration>
ENTRA_CLIENT_SECRET=<from Azure App Registration>
JWT_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://runner.<customer-domain>.com
NODE_ENV=production

# Recommended for production:
RATE_LIMIT_MAX=25

# Optional — system management (admin System tab):
COOLIFY_URL=https://coolify.tcx-hub.com
COOLIFY_API_TOKEN=<from Coolify profile>
SERVER_SSH_HOST=<server IP>
SERVER_SSH_KEY=<PEM private key string>
```
