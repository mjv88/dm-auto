# TCX Runner — Architecture Reference

## Overview

TCX Runner is a multi-tenant enterprise PWA that lets 3CX PBX users ("runners") self-reassign their department/group via the 3CX xAPI, without requiring 3CX admin access. Authentication is via Microsoft Entra ID SSO (silent/zero-tap on Intune-managed devices) or email/password.

---

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hetzner CX23                              │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────┐  │
│  │  runner-pwa     │    │   runner-api      │    │ PostgreSQL │  │
│  │  Next.js 15     │───▶│   Fastify 5       │───▶│    16      │  │
│  │  :3000          │    │   :3001           │    │  :5432     │  │
│  └─────────────────┘    └──────────────────┘    └────────────┘  │
│           │                      │                               │
│   Coolify (Traefik reverse proxy + HTTPS)                        │
└───────────┼──────────────────────┼───────────────────────────────┘
            │                      │
    runner.tcx-hub.com    runner-api.tcx-hub.com
            │                      │
            │              ┌───────┴──────────────────┐
            │              │                          │
            │    ┌─────────▼──────────┐   ┌──────────▼────────┐
            │    │  Microsoft Entra   │   │   3CX PBX(es)      │
            │    │  (multi-tenant)    │   │  xAPI v1           │
            │    │  JWKS validation   │   │  OAuth2 tokens     │
            └────│  Runners group     │   │  Users / Groups    │
                 └────────────────────┘   │  RingGroups        │
                                          └───────────────────-┘
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| PWA | Next.js 15 App Router, React 19, MSAL 5, Zustand, Tailwind CSS |
| API | Fastify 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL 16 |
| 3CX integration | xAPI v1 (`https://{pbx_fqdn}/xapi/v1`), OAuth2 client credentials |
| Auth (runners) | Microsoft Entra ID SSO (MSAL silent flow) or email/password |
| Auth (admins) | Session JWT (HS256, 8h) |
| Infrastructure | Hetzner Cloud CX23 (2 vCPU, 4 GB RAM, Nuremberg), Coolify v4 |
| Reverse proxy | Traefik (managed by Coolify), TLS via Let's Encrypt |
| DNS | Cloudflare (proxied) |
| Email | SendGrid SMTP, `noreply@tcx-hub.com` |

---

## Multi-Tenancy Model

Each **tenant** maps to one customer company:

- One or more PBX systems (`pbx_credentials`)
- Multiple runners (`runners`) — employees who switch departments
- One or more admin users (`manager_tenants` bridge)
- An Entra tenant ID and security group ID for SSO validation

**Role hierarchy** (numeric level):

| Role | Level |
|------|-------|
| `super_admin` (TCX Hub operator) | 4 |
| `admin` (company admin) | 3 |
| `manager` | 2 |
| `runner` | 1 |

All database queries are scoped by `tenantId` derived from the session. The super-admin manages all tenants; company admins manage only their own.

---

## Key Data Flows

### Runner Login + Department Switch (Entra SSO)

1. PWA calls `acquireTokenSilent` (MSAL) → Microsoft Entra returns an ID token.
2. PWA sends the ID token to `POST /runner/auth`.
3. API validates the token via JWKS, checks membership in the configured Runners security group via Microsoft Graph API.
4. API resolves the runner's email → PBX FQDN → extension → allowed departments.
5. API issues a session JWT (8 h) and returns it to the PWA.
6. Runner taps a department → PWA calls `POST /runner/switch`.
7. API calls `PATCH /Users({userId})` on the PBX xAPI with the new `GroupId`, `OutboundCallerID`, and role.
8. API updates ring group memberships: removes old department's ring groups, adds new department's ring groups.
9. An immutable audit log entry is written.

### xAPI Token Lifecycle

- Each PBX uses a 60-minute OAuth2 bearer token (client credentials flow).
- A background refresh service runs every 50 minutes, refreshing tokens before expiry.
- Tokens are cached in `pbx_credentials.xapi_token` encrypted with AES-256-GCM.
- One token is shared across all concurrent requests to the same PBX.

### Admin Company Provisioning

1. Super-admin creates a company record and assigns admin email(s).
2. Admin receives an invite link: `/register?company={tenantId}`.
3. Admin registers and is auto-linked to the tenant.
4. Admin connects PBX(es): extensions and departments are fetched live from the xAPI.
5. Admin adds runners and configures caller IDs and ring groups per department.

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Runner auth | Microsoft Entra ID token (JWKS-validated) or bcrypt email/password |
| Admin auth | Session JWT (HS256, 8 h) signed with `JWT_SECRET` |
| Tenant isolation | All DB queries scoped by `tenantId` from the session |
| Role enforcement | Numeric role level checked per route |
| PBX credentials | AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`) |
| Rate limiting | 25 department switches/hour per extension (`RATE_LIMIT_MAX`) |
| CORS | Requests accepted only from `NEXT_PUBLIC_APP_URL` |

---

## Database Schema

```
tenants           — one row per customer company
pbx_credentials   — one row per PBX; stores encrypted xAPI credentials and cached token
runners           — one row per (email, pbx) pair; stores allowedDeptIds, callerIDs, ring group config
users             — email/password accounts for admin and manager roles
manager_tenants   — bridge: which users manage which tenants
audit_log         — immutable record of every department switch attempt
dept_cache        — cached department list per PBX
pbx_extensions    — cached extension list per PBX (populated by setup wizard)
```

---

## Infrastructure

```
Hetzner CX23 — 46.224.229.119, region: nbg1 (Nuremberg)
├── Coolify v4 (:8000)     — container orchestration, auto-deploy on push
├── Traefik                — reverse proxy, TLS termination (Let's Encrypt)
├── runner-pwa (Next.js)   → runner.tcx-hub.com
├── runner-api (Fastify)   → runner-api.tcx-hub.com
└── runner-postgres (PG16) → internal Docker network only (not exposed)

DNS:   Cloudflare (free tier, proxied)
Email: SendGrid SMTP — tcx-hub.com SPF/DKIM verified
CI/CD: Push to main → manual Coolify redeploy trigger
```

---

## Further Reading

- `api/DEPLOYMENT.md` — API environment variables and deployment steps
- `pwa/DEPLOYMENT.md` — PWA environment variables and deployment steps
- `docs/RUNNER_APP_SPEC.md` — full product specification
- `docs/XAPI_TEST_GUIDE.md` — 3CX xAPI integration test guide
