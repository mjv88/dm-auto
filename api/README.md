# tcx-runner-api

Fastify microservice that powers the 3CX Runner App — allowing designated runners to self-reassign their extension to a different department without admin panel access.

## Stack

- **Runtime:** Node.js 20 / TypeScript 5 (strict)
- **Framework:** Fastify 4
- **Database:** PostgreSQL 16 via Drizzle ORM
- **Auth:** Microsoft Entra ID (MSAL) + internal JWT sessions
- **Deploy:** Docker → Coolify on Hetzner

## Prerequisites

- Node.js ≥ 20
- PostgreSQL 16 (or Docker)
- Azure App Registration (see §7 of RUNNER_APP_SPEC.md)
- Entra "3CX Runners" security group

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/{org}/tcx-runner-api
cd tcx-runner-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in all required values
```

Required vars:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 64-char hex — AES-256 key for xAPI credential storage. Generate: `openssl rand -hex 32` |
| `ENTRA_CLIENT_ID` | Azure App Registration client ID (multi-tenant) |
| `ENTRA_CLIENT_SECRET` | Azure App Registration secret |
| `JWT_SECRET` | 64-char random string for session tokens. Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Runner PWA URL — used for CORS (e.g. `https://runner.customer.com`) |

Optional vars (system management):

| Variable | Description |
|---|---|
| `COOLIFY_URL` | Coolify base URL for system management (e.g. `https://coolify.tcx-hub.com`) |
| `COOLIFY_API_TOKEN` | Coolify API token |
| `SERVER_SSH_HOST` | Server IP address for Docker prune via SSH |
| `SERVER_SSH_KEY` | PEM private key string for SSH access (stored as env var) |
| `RATE_LIMIT_MAX` | Max switches per window per extension (default: `10`, set to `25` in prod) |

> **Multi-tenant:** `ENTRA_TENANT_ID` and `ENTRA_RUNNERS_GROUP_ID` are stored per-tenant in the database (not required at server level). See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full reference.

### 3. Start local dev with Docker

```bash
docker compose up
```

This starts:
- `postgres` on port 5432
- `api` on port 3001 (hot-reload via tsx)

### 4. Or run directly against an existing PostgreSQL

```bash
# Run migrations
npm run migrate

# Start dev server
npm run dev
```

## API Endpoints

### Runner (authenticated users)

| Method | Path | Description |
|---|---|---|
| `POST` | `/runner/auth` | Resolve runner identity from SSO token |
| `POST` | `/runner/switch` | Switch to a new department |
| `GET` | `/runner/departments` | Get current state + allowed departments |
| `GET` | `/health` | Health check |

### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/tenants` | List all tenants |
| `POST` | `/admin/tenants` | Create a new tenant |
| `DELETE` | `/admin/tenants/:id` | Delete a tenant |
| `GET` | `/admin/tenants/:id/admins` | List admins for a tenant |
| `POST` | `/admin/tenants/:id/admins/reassign` | Reassign tenant admin |
| `PUT` | `/admin/users/:id/company` | Update a user's company assignment |
| `GET` | `/admin/pbx/:id/users` | List users on a PBX |
| `GET` | `/admin/pbx/:id/ring-groups` | List ring groups on a PBX |
| `GET` | `/admin/system` | Server metrics and system status |
| `POST` | `/admin/system/vacuum` | Run PostgreSQL VACUUM |
| `POST` | `/admin/system/docker-prune` | Prune unused Docker resources via SSH |

> **Setup wizard retired:** The `/setup` route has been removed. Requests to `/setup` redirect to `/admin`.

Full contract in [RUNNER_APP_SPEC.md](./RUNNER_APP_SPEC.md) §5.

## Development

```bash
npm run dev      # Start with hot-reload
npm run build    # Compile TypeScript → dist/
npm test         # Run Jest tests
npm run migrate  # Apply database migrations
```

## Build & Deploy

The Dockerfile uses a 3-stage build:
1. **deps** — production dependencies only
2. **builder** — compiles TypeScript
3. **runner** — minimal production image (node:20-alpine, non-root user `fastify`)

Coolify auto-deploys from `main` branch on push.

For full Coolify setup instructions, environment variable checklist, first-run migration command, and smoke test checklist, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Database Schema Notes

The `runners` table includes additional columns beyond the basic profile:

| Column | Description |
|---|---|
| `outbound_caller_id` | Default outbound caller ID for the runner's extension |
| `dept_caller_ids` | JSON map of department → caller ID overrides |
| `dept_ring_groups` | JSON map of department → ring group assignments |

## Rate Limiting

Switches are rate-limited per extension per hour. The limit defaults to `10` and is configured via the `RATE_LIMIT_MAX` env var. Production deployments should set this to `25`.

## Project Structure

```
src/
├── index.ts          Fastify server entry point
├── config.ts         Zod env validation
├── db/
│   ├── schema.ts     Drizzle ORM schema
│   ├── migrate.ts    Migration runner
│   └── migrations/   SQL migrations (generated by drizzle-kit)
├── routes/
│   ├── auth.ts       POST /runner/auth
│   ├── switch.ts     POST /runner/switch
│   ├── departments.ts GET /runner/departments
│   ├── health.ts     GET /health
│   └── admin/        Admin route handlers
├── middleware/
│   ├── authenticate.ts JWT validation
│   ├── audit.ts      Audit log writer
│   └── rateLimit.ts  Per-extension rate limiting
├── xapi/
│   ├── client.ts     3CX xAPI HTTP client
│   ├── extensions.ts Extension (user) operations
│   └── departments.ts Department (group) operations
├── entra/
│   └── groupCheck.ts  Entra ID group membership check
└── utils/
    ├── errors.ts     Error types + codes
    └── logger.ts     Pino logger + Sentry
```

## Environment Variables

See `.env.example` and [RUNNER_APP_SPEC.md](./RUNNER_APP_SPEC.md) §17 for the full reference.
