# RUNNER_APP_SPEC.md
## 3CX Runner App — Full Build Specification
**Version:** 1.0.0  
**Status:** Ready for Claude Code Sub-Agent Build  
**Customer:** Enterprise (dedicated infrastructure)  
**Stack:** Next.js · Fastify · PostgreSQL · Hetzner · Coolify · GitHub Actions  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Infrastructure — Dedicated Hetzner Instance](#2-infrastructure--dedicated-hetzner-instance)
3. [GitHub Repository Structure](#3-github-repository-structure)
4. [Database Schema](#4-database-schema)
5. [Runner API — Fastify Microservice](#5-runner-api--fastify-microservice)
6. [Runner PWA — Next.js](#6-runner-pwa--nextjs)
7. [Authentication — Microsoft SSO + Entra ID](#7-authentication--microsoft-sso--entra-id)
8. [Multi-PBX Routing via FQDN](#8-multi-pbx-routing-via-fqdn)
9. [xAPI Integration — 3CX](#9-xapi-integration--3cx)
10. [TCX-Hub Admin Module — Runners](#10-tcx-hub-admin-module--runners)
11. [Intune MDM Deployment](#11-intune-mdm-deployment)
12. [CI/CD Pipeline — GitHub Actions + Coolify](#12-cicd-pipeline--github-actions--coolify)
13. [Error States Catalogue](#13-error-states-catalogue)
14. [Audit Logging](#14-audit-logging)
15. [Security Requirements](#15-security-requirements)
16. [Sub-Agent Build Plan](#16-sub-agent-build-plan)
17. [Environment Variables Reference](#17-environment-variables-reference)

---

## 1. Project Overview

### What This Builds

A mobile-first Progressive Web App (PWA) that allows designated 3CX users ("Runners") to self-reassign their own extension to a different department — without access to the 3CX admin panel.

Identity is resolved automatically via Microsoft SSO. The app supports 93 PBX instances, ~60,000 users, and Runners who may be active across multiple PBXs simultaneously.

### The Single Core Operation

```
PATCH https://{pbx_fqdn}/xapi/v1/Users({userId})
Body: { "Groups": [{ "GroupId": {targetGroupId}, "Rights": { "RoleName": "users" } }], "Id": {userId} }
```

> **3CX v20 xAPI naming:** The 3CX admin UI says "Extensions" and "Departments", but the xAPI
> calls them **Users** and **Groups** respectively. This document uses xAPI naming throughout.

Everything in this spec exists to safely route, authenticate, and audit that one call.

### User Flow (Happy Path)

```
Runner opens PWA on Android (Intune-managed device)
  → Silent MS SSO via Microsoft Authenticator (zero taps)
  → API resolves: email → PBX FQDN → extension → allowed departments
  → App renders department switcher
  → Runner taps target department
  → Confirmation (1 tap)
  → xAPI PATCH called on correct PBX
  → New department shown immediately
  → Audit log written
```

### Scope Boundaries (Out of Scope)

- No call history or CDR access
- No voicemail management
- No admin functions beyond department switching
- No iOS-specific native features (PWA handles both platforms)
- No direct 3CX admin panel access

---

## 2. Infrastructure — Dedicated Hetzner Instance

### Why Dedicated

This is a white-label enterprise deployment. Dedicated infrastructure provides:
- Clean billing separation from TCX-Hub
- No blast radius to TCX-Hub on failure
- Customer-specific SLA control
- Independent scaling
- Audit isolation

### Server Specification

```
Provider:     Hetzner Cloud
Type:         CX22 (2 vCPU, 4GB RAM, 40GB NVMe)
Location:     Nuremberg (nbg1) or Helsinki (hel1) — match customer region
OS:           Ubuntu 24.04 LTS
Network:      Public IPv4 + Private VNET
Firewall:     Hetzner Cloud Firewall (rules below)
```

**Scale trigger:** Upgrade to CX32 (4 vCPU, 8GB) if >500 concurrent runners or >50 req/sec sustained.

### Services on This Instance

```
Port   Service                  Managed By
─────────────────────────────────────────────
443    Coolify Reverse Proxy    Traefik (via Coolify)
3001   Runner API (Fastify)     Coolify Docker service
3002   Runner PWA (Next.js)     Coolify Docker service
5432   PostgreSQL               Coolify managed DB
─────────────────────────────────────────────
22     SSH                      Hetzner (key-only)
80     HTTP → HTTPS redirect    Traefik
```

### Hetzner Firewall Rules

```
Inbound:
  TCP 22    → Your IP only (SSH)
  TCP 80    → 0.0.0.0/0 (HTTP redirect)
  TCP 443   → 0.0.0.0/0 (HTTPS)
  TCP 5432  → Private VNET only (PostgreSQL)

Outbound:
  All traffic allowed
  (xAPI calls to 93 PBX FQDNs require unrestricted outbound HTTPS)
```

### DNS Configuration

```
runner-api.{customer-domain}.com   → Hetzner server IP
runner.{customer-domain}.com       → Hetzner server IP (PWA)

Alternative — Cloudflare Pages for PWA (recommended):
  runner.{customer-domain}.com     → Cloudflare Pages (zero cold start, global CDN)
  runner-api.{customer-domain}.com → Hetzner server IP (API only)
```

### Private VNET (Optional — if TCX-Hub admin module needs DB access)

```
Hetzner Private Network: 10.0.0.0/24
  10.0.0.1  → TCX-Hub CX42 (existing)
  10.0.0.2  → CTI Router CX22 (existing)
  10.0.0.3  → Runner App CX22 (new, this instance)
```

PostgreSQL on Runner instance is NOT shared with TCX-Hub. Separate DB, separate credentials.

### Coolify Setup on New Instance

```bash
# Bootstrap Coolify on fresh Ubuntu 24.04
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Then in Coolify UI:
# 1. Add new Server → SSH into 10.0.0.3
# 2. Create new Project: "runner-app-{customer}"
# 3. Add PostgreSQL service
# 4. Add Runner API service (Docker/GitHub)
# 5. Add Runner PWA service (Docker/GitHub)
# 6. Configure domains + SSL (Let's Encrypt auto)
```

---

## 3. GitHub Repository Structure

### Two Repositories

```
github.com/{org}/tcx-runner-api     Fastify microservice
github.com/{org}/tcx-runner-pwa     Next.js PWA
```

TCX-Hub admin module additions live in the existing `tcx-hub` repo as a new module.

### tcx-runner-api Structure

```
tcx-runner-api/
├── src/
│   ├── index.ts                  Entry point, Fastify server
│   ├── config.ts                 Env var validation (zod)
│   ├── db/
│   │   ├── schema.ts             Drizzle schema
│   │   ├── migrate.ts            Migration runner
│   │   └── migrations/           SQL migration files
│   ├── routes/
│   │   ├── auth.ts               POST /runner/auth
│   │   ├── switch.ts             POST /runner/switch
│   │   ├── departments.ts        GET  /runner/departments
│   │   └── health.ts             GET  /health
│   ├── middleware/
│   │   ├── authenticate.ts       JWT validation
│   │   ├── audit.ts              Audit log writer
│   │   └── rateLimit.ts          Per-extension rate limiting
│   ├── xapi/
│   │   ├── client.ts             xAPI HTTP client
│   │   ├── extensions.ts         Extension operations
│   │   └── departments.ts        Department operations
│   ├── entra/
│   │   └── groupCheck.ts         Entra ID group membership check
│   └── utils/
│       ├── errors.ts             Error types + codes
│       └── logger.ts             Pino logger + Sentry
├── tests/
│   ├── routes/                   Route unit tests
│   ├── xapi/                     xAPI client mocks
│   └── integration/              End-to-end API tests
├── Dockerfile
├── docker-compose.yml            Local dev
├── .env.example
├── drizzle.config.ts
├── tsconfig.json
└── package.json
```

### tcx-runner-pwa Structure

```
tcx-runner-pwa/
├── app/
│   ├── layout.tsx                Root layout + PWA meta
│   ├── page.tsx                  Entry → redirect to /departments or /select-pbx
│   ├── (auth)/
│   │   ├── login/page.tsx        MS SSO trigger
│   │   └── callback/page.tsx     Auth callback handler
│   ├── departments/
│   │   └── page.tsx              Main dept switcher UI
│   ├── select-pbx/
│   │   └── page.tsx              PBX selector (multi-PBX runners)
│   └── error/
│       └── page.tsx              Error states (not-a-runner, PBX down, etc.)
├── components/
│   ├── DeptSwitcher.tsx          Department list + tap handler
│   ├── DeptCard.tsx              Single department card
│   ├── PBXSelector.tsx           PBX selection screen
│   ├── RunnerHeader.tsx          Name + PBX + extension display
│   ├── ConfirmSheet.tsx          Bottom sheet confirmation
│   ├── StatusBadge.tsx           Current dept indicator
│   └── ErrorScreen.tsx           Error state display
├── lib/
│   ├── auth.ts                   MSAL config + silent SSO
│   ├── api.ts                    Runner API client
│   └── store.ts                  Zustand state (runner context)
├── public/
│   ├── manifest.json             PWA manifest
│   ├── sw.js                     Service worker
│   └── icons/                    192px, 512px, maskable
├── next.config.js                next-pwa config
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 4. Database Schema

### Complete Schema (PostgreSQL via Drizzle ORM)

```sql
-- ============================================================
-- runners table
-- Core identity: one row per (email, pbx_fqdn) combination
-- ============================================================
CREATE TABLE runners (
  id                SERIAL PRIMARY KEY,
  entra_email       VARCHAR(255) NOT NULL,
  pbx_fqdn          VARCHAR(255) NOT NULL,       -- "kunde-gmbh.3cx.eu"
  extension_number  VARCHAR(20)  NOT NULL,        -- "101"
  extension_id      INTEGER,                      -- 3CX internal ID (cached from xAPI)
  display_name      VARCHAR(255),                 -- Cached from Entra/3CX
  allowed_dept_ids  INTEGER[]    NOT NULL DEFAULT '{}',
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  notes             TEXT,                         -- Admin notes
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by        VARCHAR(255),                 -- Admin email who created

  CONSTRAINT runners_email_pbx_unique UNIQUE (entra_email, pbx_fqdn)
);

CREATE INDEX idx_runners_email    ON runners (entra_email);
CREATE INDEX idx_runners_pbx_fqdn ON runners (pbx_fqdn);
CREATE INDEX idx_runners_active   ON runners (is_active);

-- ============================================================
-- pbx_credentials table
-- xAPI credentials per PBX FQDN (encrypted at rest)
-- ============================================================
CREATE TABLE pbx_credentials (
  id              SERIAL PRIMARY KEY,
  pbx_fqdn        VARCHAR(255) NOT NULL UNIQUE,
  pbx_name        VARCHAR(255),                   -- "Kunde GmbH"
  xapi_client_id  TEXT         NOT NULL,          -- encrypted
  xapi_secret     TEXT         NOT NULL,          -- encrypted
  xapi_token      TEXT,                           -- cached OAuth token
  token_expires   TIMESTAMPTZ,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- audit_log table
-- Immutable record of every department switch attempt
-- ============================================================
CREATE TABLE audit_log (
  id              BIGSERIAL    PRIMARY KEY,
  runner_id       INTEGER      REFERENCES runners(id),
  entra_email     VARCHAR(255) NOT NULL,          -- denormalized for immutability
  pbx_fqdn        VARCHAR(255) NOT NULL,
  extension_number VARCHAR(20) NOT NULL,
  from_dept_id    INTEGER,
  from_dept_name  VARCHAR(255),
  to_dept_id      INTEGER      NOT NULL,
  to_dept_name    VARCHAR(255),
  status          VARCHAR(20)  NOT NULL,          -- 'success' | 'failed' | 'denied'
  error_code      VARCHAR(50),
  error_message   TEXT,
  ip_address      INET,
  user_agent      TEXT,
  device_id       VARCHAR(255),                   -- Intune device ID if present
  duration_ms     INTEGER,                        -- xAPI call duration
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_runner_id  ON audit_log (runner_id);
CREATE INDEX idx_audit_email      ON audit_log (entra_email);
CREATE INDEX idx_audit_pbx        ON audit_log (pbx_fqdn);
CREATE INDEX idx_audit_created    ON audit_log (created_at DESC);

-- ============================================================
-- dept_cache table
-- Cached department lists per PBX (refreshed periodically)
-- ============================================================
CREATE TABLE dept_cache (
  id           SERIAL PRIMARY KEY,
  pbx_fqdn     VARCHAR(255) NOT NULL,
  dept_id      INTEGER      NOT NULL,
  dept_name    VARCHAR(255) NOT NULL,
  cached_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT dept_cache_unique UNIQUE (pbx_fqdn, dept_id)
);
```

### Drizzle Schema (TypeScript)

```typescript
// src/db/schema.ts
import { pgTable, serial, varchar, integer, boolean,
         text, timestamp, inet, bigserial } from 'drizzle-orm/pg-core';

export const runners = pgTable('runners', {
  id:              serial('id').primaryKey(),
  entraEmail:      varchar('entra_email', { length: 255 }).notNull(),
  pbxFqdn:         varchar('pbx_fqdn', { length: 255 }).notNull(),
  extensionNumber: varchar('extension_number', { length: 20 }).notNull(),
  extensionId:     integer('extension_id'),
  displayName:     varchar('display_name', { length: 255 }),
  allowedDeptIds:  integer('allowed_dept_ids').array().notNull().default([]),
  isActive:        boolean('is_active').notNull().default(true),
  notes:           text('notes'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
  createdBy:       varchar('created_by', { length: 255 }),
});

export const pbxCredentials = pgTable('pbx_credentials', {
  id:            serial('id').primaryKey(),
  pbxFqdn:       varchar('pbx_fqdn', { length: 255 }).notNull().unique(),
  pbxName:       varchar('pbx_name', { length: 255 }),
  xapiClientId:  text('xapi_client_id').notNull(),
  xapiSecret:    text('xapi_secret').notNull(),
  xapiToken:     text('xapi_token'),
  tokenExpires:  timestamp('token_expires', { withTimezone: true }),
  isActive:      boolean('is_active').notNull().default(true),
});

export const auditLog = pgTable('audit_log', {
  id:              bigserial('id', { mode: 'number' }).primaryKey(),
  runnerId:        integer('runner_id').references(() => runners.id),
  entraEmail:      varchar('entra_email', { length: 255 }).notNull(),
  pbxFqdn:         varchar('pbx_fqdn', { length: 255 }).notNull(),
  extensionNumber: varchar('extension_number', { length: 20 }).notNull(),
  fromDeptId:      integer('from_dept_id'),
  fromDeptName:    varchar('from_dept_name', { length: 255 }),
  toDeptId:        integer('to_dept_id').notNull(),
  toDeptName:      varchar('to_dept_name', { length: 255 }),
  status:          varchar('status', { length: 20 }).notNull(),
  errorCode:       varchar('error_code', { length: 50 }),
  errorMessage:    text('error_message'),
  ipAddress:       inet('ip_address'),
  userAgent:       text('user_agent'),
  deviceId:        varchar('device_id', { length: 255 }),
  durationMs:      integer('duration_ms'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

---

## 5. Runner API — Fastify Microservice

### Endpoints

#### `POST /runner/auth`
Resolves runner identity from SSO token. Called on every app open.

**Request:**
```json
{
  "idToken": "eyJ...",          // Microsoft ID token
  "pbxFqdn": "kunde-gmbh.3cx.eu" // Optional — from Intune URL param
}
```

**Response (single PBX):**
```json
{
  "mode": "direct",
  "runner": {
    "displayName": "Maria K.",
    "extensionNumber": "101",
    "pbxFqdn": "kunde-gmbh.3cx.eu",
    "pbxName": "Kunde GmbH",
    "currentDeptId": 3,
    "currentDeptName": "Sales",
    "allowedDepts": [
      { "id": 3, "name": "Sales" },
      { "id": 7, "name": "Support" },
      { "id": 12, "name": "Reception" }
    ]
  },
  "sessionToken": "eyJ..."       // Short-lived JWT for subsequent calls
}
```

**Response (multi-PBX, no FQDN param):**
```json
{
  "mode": "select",
  "options": [
    { "pbxFqdn": "kunde-gmbh.3cx.eu", "pbxName": "Kunde GmbH", "extensionNumber": "101" },
    { "pbxFqdn": "andere-ag.3cx.eu",  "pbxName": "Andere AG",  "extensionNumber": "205" }
  ]
}
```

---

#### `POST /runner/switch`
Switches runner to a new department.

**Headers:** `Authorization: Bearer {sessionToken}`

**Request:**
```json
{
  "targetDeptId": 7
}
```

**Response:**
```json
{
  "success": true,
  "previousDept": { "id": 3, "name": "Sales" },
  "currentDept":  { "id": 7, "name": "Support" },
  "switchedAt": "2026-03-12T10:30:00Z"
}
```

---

#### `GET /runner/departments`
Returns current state + allowed departments. Used to refresh UI.

**Headers:** `Authorization: Bearer {sessionToken}`

**Response:**
```json
{
  "currentDeptId": 7,
  "currentDeptName": "Support",
  "allowedDepts": [
    { "id": 3,  "name": "Sales" },
    { "id": 7,  "name": "Support" },
    { "id": 12, "name": "Reception" }
  ]
}
```

---

#### `GET /health`
Health check for Coolify monitoring.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "db": "connected",
  "uptime": 3600
}
```

---

### Core Business Logic — resolveRunnerContext

```typescript
async function resolveRunnerContext(
  email: string,
  pbxFqdn?: string
): Promise<RunnerContext> {

  // 1. Check Entra "3CX Runners" group
  const isRunner = await checkEntraGroup(email, process.env.ENTRA_RUNNERS_GROUP_ID);
  if (!isRunner) throw new RunnerError('NOT_A_RUNNER', 403);

  // 2. Query runner rows for this email
  const rows = await db
    .select()
    .from(runners)
    .where(and(eq(runners.entraEmail, email), eq(runners.isActive, true)));

  if (rows.length === 0) throw new RunnerError('RUNNER_NOT_CONFIGURED', 403);

  // 3. FQDN provided (Intune URL) → use directly
  if (pbxFqdn) {
    const runner = rows.find(r => r.pbxFqdn === pbxFqdn);
    if (!runner) throw new RunnerError('PBX_NOT_AUTHORIZED', 403);
    return { mode: 'direct', runner };
  }

  // 4. Single PBX → auto-resolve
  if (rows.length === 1) {
    return { mode: 'direct', runner: rows[0] };
  }

  // 5. Multiple PBXs → return options for selector
  return { mode: 'select', options: rows };
}
```

### Rate Limiting

```typescript
// Per extension: max 10 department switches per hour
// Prevents accidental spam / automation abuse
await fastify.register(import('@fastify/rate-limit'), {
  max: 10,
  timeWindow: '1 hour',
  keyGenerator: (req) => req.runnerContext?.extensionNumber ?? req.ip,
  errorResponseBuilder: () => ({
    error: 'RATE_LIMITED',
    message: 'Too many department switches. Try again later.'
  })
});
```

---

## 6. Runner PWA — Next.js

### PWA Manifest

```json
// public/manifest.json
{
  "name": "Runner Hub",
  "short_name": "Runner",
  "description": "Switch your 3CX department",
  "start_url": "/?source=pwa",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0078D4",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### next.config.js

```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/runner-api\./,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 300 } }
    }
  ]
});

module.exports = withPWA({
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ENTRA_CLIENT_ID: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID,
    NEXT_PUBLIC_ENTRA_TENANT_ID: process.env.NEXT_PUBLIC_ENTRA_TENANT_ID,
  }
});
```

### Department Switcher UI — Component Spec

```
┌─────────────────────────────────┐
│  Runner Hub               🔄    │  ← refresh icon
├─────────────────────────────────┤
│  Maria K.                       │
│  Ext. 101 · Kunde GmbH          │
├─────────────────────────────────┤
│  Currently in:                  │
│  ● Sales                        │  ← green dot, greyed/disabled card
├─────────────────────────────────┤
│  Switch to:                     │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Support                │   │  ← tappable
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  Reception              │   │  ← tappable
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘

On tap → bottom sheet confirmation:
┌─────────────────────────────────┐
│  Switch department?             │
│                                 │
│  Sales  →  Support              │
│                                 │
│  [Cancel]        [Confirm]      │
└─────────────────────────────────┘

On confirm → loading spinner → success state:
┌─────────────────────────────────┐
│  ✅ Switched to Support         │
│  Ext. 101 · Kunde GmbH         │
└─────────────────────────────────┘
```

### PBX Selector UI — Component Spec (multi-PBX runners only)

```
┌─────────────────────────────────┐
│  Runner Hub                     │
├─────────────────────────────────┤
│  Welcome, Maria K.              │
│  Select your PBX:               │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │  Kunde GmbH             │   │
│  │  kunde-gmbh.3cx.eu      │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  Andere AG              │   │
│  │  andere-ag.3cx.eu       │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

---

## 7. Authentication — Microsoft SSO + Entra ID

### Setup Requirements

```
Azure App Registration (new — dedicated to Runner App):
  Name:          "3CX Runner App"
  Platform:      Single-page application (SPA)
  Redirect URI:  https://runner.{customer-domain}.com/auth/callback
  Scopes:        openid, profile, email, User.Read
  Group claims:  Enable "Groups" claim in token config
  Tenant:        Customer's M365 tenant
```

### Entra Security Group

```
Group name:  "3CX Runners"
Group type:  Security
Assigned to: All runner users (IT managed)
Group ID:    {ENTRA_RUNNERS_GROUP_ID} — stored in env var
```

### MSAL Silent SSO Flow (PWA)

```typescript
// lib/auth.ts
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_ENTRA_TENANT_ID}`,
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  },
  cache: { cacheLocation: 'sessionStorage' }  // No localStorage
};

export async function acquireTokenSilent(): Promise<AuthResult> {
  const pca = new PublicClientApplication(msalConfig);
  await pca.initialize();

  const accounts = pca.getAllAccounts();

  // Silent first (Intune Authenticator handles this — zero taps)
  try {
    const result = await pca.acquireTokenSilent({
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      account: accounts[0]
    });
    return { idToken: result.idToken, email: result.account.username };

  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Redirect to MS login (first-time only)
      await pca.acquireTokenRedirect({ scopes: ['openid', 'profile', 'email'] });
    }
    throw error;
  }
}
```

### Server-Side Token Validation (Fastify middleware)

```typescript
// middleware/authenticate.ts
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`
});

export async function validateMicrosoftToken(idToken: string): Promise<TokenPayload> {
  const decoded = jwt.decode(idToken, { complete: true });
  const key = await client.getSigningKey(decoded.header.kid);
  const verified = jwt.verify(idToken, key.getPublicKey(), {
    audience: process.env.ENTRA_CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`
  });
  return verified as TokenPayload;
}
```

### Entra Group Check

```typescript
// entra/groupCheck.ts
// Uses Microsoft Graph API to verify group membership
export async function checkEntraGroup(email: string, groupId: string): Promise<boolean> {
  const token = await getGraphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${email}/memberOf`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.value?.some((g: any) => g.id === groupId) ?? false;
}
```

---

## 8. Multi-PBX Routing via FQDN

### Resolution Decision Tree

```
POST /runner/auth { idToken, pbxFqdn? }
  │
  ├─ Validate idToken → extract email
  │
  ├─ Check Entra "3CX Runners" group
  │     FAIL → 403 NOT_A_RUNNER
  │
  ├─ SELECT * FROM runners WHERE entra_email = ? AND is_active = true
  │     0 rows → 403 RUNNER_NOT_CONFIGURED
  │
  ├─ pbxFqdn provided?
  │     YES → find matching row
  │           no match → 403 PBX_NOT_AUTHORIZED
  │           match    → continue with that row
  │     NO  →
  │           1 row  → use it directly
  │           N rows → return { mode: 'select', options }
  │
  └─ Resolve current department from xAPI
       PBX unreachable → 503 PBX_UNAVAILABLE (with cached dept if available)
       Success → return runner profile + dept list
```

### FQDN as xAPI Base URL

```typescript
// xapi/client.ts
export class XAPIClient {
  private baseUrl: string;

  constructor(pbxFqdn: string) {
    // FQDN is directly the xAPI base — no mapping needed
    this.baseUrl = `https://${pbxFqdn}/xapi/v1`;
  }

  // NOTE: 3CX xAPI calls "Extensions" → "Users" and "Departments" → "Groups"
  async getUserByNumber(extensionNumber: string) {
    return this.get(`/Users?$filter=Number eq '${extensionNumber}'&$expand=Groups&$select=Id,Number,FirstName,LastName,EmailAddress`);
  }

  async patchUserGroup(userId: number, targetGroupId: number) {
    // Send the complete target Groups array — replaces current group membership
    return this.patch(`/Users(${userId})`, {
      Groups: [{ GroupId: targetGroupId, Rights: { RoleName: 'users' } }],
      Id: userId,
    });
  }

  async getGroups() {
    return this.get('/Groups?$select=Id,Name&$orderby=Name');
  }
}
```

### FQDN Validation (Security)

```typescript
// Prevent FQDN injection — only allow FQDNs registered in pbx_credentials
async function validateFqdn(fqdn: string): Promise<boolean> {
  const cred = await db
    .select()
    .from(pbxCredentials)
    .where(and(eq(pbxCredentials.pbxFqdn, fqdn), eq(pbxCredentials.isActive, true)))
    .limit(1);
  return cred.length > 0;
}
```

---

## 9. xAPI Integration — 3CX

### Authentication (per PBX)

```
3CX xAPI uses OAuth 2.0 client credentials
Endpoint: https://{pbx_fqdn}/connect/token
Grant:    client_credentials
Scope:    SystemConfiguration (read + write extensions)
```

```typescript
async function getXAPIToken(pbxFqdn: string): Promise<string> {
  // Check cache first
  const cred = await db.select().from(pbxCredentials)
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn)).limit(1);

  if (cred[0].xapiToken && cred[0].tokenExpires > new Date()) {
    return decrypt(cred[0].xapiToken);
  }

  // Refresh token
  const res = await fetch(`https://${pbxFqdn}/connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: decrypt(cred[0].xapiClientId),
      client_secret: decrypt(cred[0].xapiSecret),
    })
  });

  const { access_token, expires_in } = await res.json();

  // Cache with 5-minute buffer before expiry
  await db.update(pbxCredentials)
    .set({
      xapiToken:    encrypt(access_token),
      tokenExpires: new Date(Date.now() + (expires_in - 300) * 1000)
    })
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn));

  return access_token;
}
```

### The Three xAPI Calls Used

> **Naming note:** 3CX xAPI v20 uses `Users` for what the admin UI calls "Extensions",
> and `Groups` for what the admin UI calls "Departments". The xAPI naming is used below.

**1. Find user by extension number**
```
GET /xapi/v1/Users?$filter=Number eq '101'
  &$expand=Groups
  &$select=Id,Number,FirstName,LastName,EmailAddress

Response (relevant fields):
{
  "value": [{
    "Id": 42,                  ← userId for PATCH
    "Number": "101",
    "EmailAddress": "maria@customer.de",
    "Groups": [{
      "GroupId": 28,           ← current department ID
      "Name": "DEFAULT",
      "Type": "Extension"
    }]
  }]
}
```

**2. Get all groups (departments)**
```
GET /xapi/v1/Groups?$select=Id,Name&$orderby=Name

Response:
{
  "value": [
    { "Id": 28, "Name": "DEFAULT" },
    { "Id": 35, "Name": "Sales" },
    { "Id": 41, "Name": "Support" }
  ]
}
```

**3. Switch department (the core operation)**
```
PATCH /xapi/v1/Users(42)
Content-Type: application/json
Authorization: Bearer {token}

{
  "Groups": [{ "GroupId": 35, "Rights": { "RoleName": "users" } }],
  "Id": 42
}

Expected: 204 No Content
```

> **Important:** The PATCH body sends the complete target Groups array. This ensures
> the user ends up in exactly the target department regardless of whether the PBX
> treats the PATCH as a full-replace or partial-merge.

### xAPI Version Compatibility

```
Minimum supported: 3CX v20 (xAPI not available in v18)
Recommended:       3CX v20 Update 3+

Endpoint correctness (validated against sales.on3cx.de):
  Users   → replaces legacy "Extensions" concept
  Groups  → replaces legacy "Departments" concept
  PATCH /Users({id}) with Groups array → switches department membership

Version detection: GET /xapi/v1/Defs?$select=Id returns X-3CX-Version header
Log xAPI version per PBX in pbx_credentials for debugging.
```

---

## 10. TCX-Hub Admin Module — Runners

### New Pages in TCX-Hub

```
/admin/runners              List all runners (filterable by PBX)
/admin/runners/new          Add new runner
/admin/runners/[id]         Edit runner (depts, active status)
/admin/runners/[id]/audit   Audit log for one runner
/admin/pbx-credentials      Manage xAPI credentials per PBX FQDN
```

### Runners List Page

```
Filters: [PBX FQDN ▼] [Active/Inactive] [Search email]

┌─────────────────────┬──────┬───────────────────────┬──────────┬────────┐
│ Email               │ Ext  │ PBX FQDN              │ Depts    │ Active │
├─────────────────────┼──────┼───────────────────────┼──────────┼────────┤
│ maria@reseller.de   │ 101  │ kunde-gmbh.3cx.eu     │ 2        │ ✅     │
│ maria@reseller.de   │ 205  │ andere-ag.3cx.eu      │ 1        │ ✅     │
│ thomas@company.de   │ 102  │ kunde-gmbh.3cx.eu     │ 3        │ ✅     │
└─────────────────────┴──────┴───────────────────────┴──────────┴────────┘

[+ Add Runner]                                    Showing 3 of 87 runners
```

### Add Runner Form

```
Email:          [maria@reseller.de              ]
PBX FQDN:       [kunde-gmbh.3cx.eu          ▼  ]  ← dropdown from pbx_credentials
Extension:      [101                            ]
Allowed Depts:  [x] Sales  [x] Support  [ ] Logistics  [ ] Reception
Notes:          [Optional admin notes           ]

[Cancel]                                    [Save Runner]
```

On save: validate extension exists on PBX via xAPI before saving.

### Intune URL Generator

Utility in admin panel that generates the correct Intune deployment URL:

```
PBX FQDN: [kunde-gmbh.3cx.eu]
Generated: https://runner.{customer-domain}.com?pbx=kunde-gmbh.3cx.eu

[Copy URL]  [Open QR Code]
```

---

## 11. Intune MDM Deployment

### App Configuration in Intune

```
Intune Admin Center → Apps → Android → Add
  App type:    Web link
  Name:        Runner Hub
  URL:         https://runner.{customer-domain}.com?pbx={fqdn}
  Logo:        /icons/icon-512.png (upload)
  Category:    Business
```

Create **one Intune app entry per PBX** — each with its specific `?pbx=` URL.

### Assignment Groups

```
Intune Group:   "Runners - Kunde GmbH"
  Members:      All runner users for that PBX
  App:          Runner Hub (Kunde GmbH URL)
  Install type: Required (auto-installs, can't be removed)
```

### App Protection Policy

```
Policy name: Runner Hub Protection

Android settings:
  ├─ Prevent screenshots:                  Yes
  ├─ Block copy/paste to unmanaged apps:   Yes
  ├─ Require device compliance:            Yes
  ├─ Minimum OS version:                   Android 10
  └─ Require Microsoft Authenticator:      Yes

Conditional Access:
  ├─ Require compliant device:             Yes
  ├─ Require approved client app:          Yes
  └─ Require app protection policy:        Yes
```

### Kiosk Mode (Shared Devices)

For shared company devices assigned to one runner at a time:

```
Configuration profile:
  Profile type:  Device Restrictions
  Kiosk mode:    Single-app kiosk
  App:           Microsoft Edge (PWA container)
  URL:           https://runner.{customer-domain}.com?pbx={fqdn}
```

### PWA Requirements Checklist

```
✅ HTTPS with valid certificate (Let's Encrypt via Coolify)
✅ manifest.json with all required fields
✅ Icons: 192x192, 512x512, 512x512 maskable
✅ display: "standalone" in manifest
✅ Service worker registered
✅ Offline shell (shows "No connection" gracefully)
✅ Responsive layout (tested 360px–430px width)
✅ No localStorage usage (use sessionStorage or memory only)
✅ Content Security Policy header set
✅ HSTS header set
```

---

## 12. CI/CD Pipeline — GitHub Actions + Coolify

### GitHub Actions — tcx-runner-api

```yaml
# .github/workflows/deploy.yml
name: Deploy Runner API

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_API }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

### GitHub Actions — tcx-runner-pwa

```yaml
name: Deploy Runner PWA

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build   # Validates PWA build
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_PWA }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

### Branch Strategy

```
main          → production (auto-deploy via Coolify)
develop       → staging (optional staging Coolify service)
feature/*     → PRs only, no auto-deploy
fix/*         → PRs only, no auto-deploy
```

### Coolify Service Configuration

```
Service: runner-api
  Source:       GitHub → tcx-runner-api → main
  Build:        Dockerfile
  Port:         3001
  Health check: GET /health
  Env vars:     See §17

Service: runner-pwa
  Source:       GitHub → tcx-runner-pwa → main
  Build:        Dockerfile (next build → standalone)
  Port:         3002
  Health check: GET /
  Env vars:     See §17

Service: postgresql
  Type:         Managed PostgreSQL (Coolify)
  Version:      16
  DB name:      runner_app
  Backups:      Daily, 7-day retention
```

---

## 13. Error States Catalogue

Every error state must show a clear screen in the PWA with a specific message and recovery action.

| Code | Trigger | UI Message | Recovery |
|------|---------|------------|----------|
| `NOT_A_RUNNER` | Email not in Entra group | "Your account isn't set up as a Runner. Contact IT." | None — dead end |
| `RUNNER_NOT_CONFIGURED` | In Entra group but no DB row | "Your account needs setup. Contact your administrator." | None — admin action required |
| `PBX_NOT_AUTHORIZED` | FQDN param doesn't match any runner row | "This link doesn't match your account." | Retry without ?pbx param |
| `PBX_UNAVAILABLE` | xAPI unreachable (timeout/5xx) | "Can't reach your phone system right now. Try again." | Retry button (exponential backoff) |
| `DEPT_NOT_ALLOWED` | targetDeptId not in allowedDeptIds | Silent — dept not shown in UI | N/A (UI prevents this) |
| `SAME_DEPT` | Switching to current dept | "You're already in this department." | No-op |
| `RATE_LIMITED` | >10 switches/hour | "Too many switches. Try again in an hour." | Wait |
| `TOKEN_EXPIRED` | Session JWT expired | Silent re-auth via MSAL | Auto-refresh |
| `XAPI_AUTH_FAILED` | 3CX token rejected | "Authentication error. Contact admin." | Admin updates credentials |
| `OFFLINE` | No network | "No internet connection." | Service worker shows cached UI |

---

## 14. Audit Logging

Every `/runner/switch` call — success or failure — writes to `audit_log`.

### What Gets Logged

```typescript
await db.insert(auditLog).values({
  runnerId:        runner.id,
  entraEmail:      runner.entraEmail,
  pbxFqdn:         runner.pbxFqdn,
  extensionNumber: runner.extensionNumber,
  fromDeptId:      currentDept.id,
  fromDeptName:    currentDept.name,
  toDeptId:        req.body.targetDeptId,
  toDeptName:      targetDept.name,
  status:          'success',             // or 'failed' or 'denied'
  errorCode:       null,
  ipAddress:       req.ip,
  userAgent:       req.headers['user-agent'],
  deviceId:        req.headers['x-intune-device-id'] ?? null,
  durationMs:      Date.now() - startTime,
});
```

### Audit Log Viewer (TCX-Hub)

```
/admin/runners/{id}/audit

┌──────────────────┬──────────────┬───────────┬────────────┬─────────┐
│ Timestamp        │ From         │ To        │ Status     │ Device  │
├──────────────────┼──────────────┼───────────┼────────────┼─────────┤
│ 2026-03-12 09:14 │ Sales        │ Support   │ ✅ Success │ Intune  │
│ 2026-03-11 16:30 │ Support      │ Reception │ ✅ Success │ Intune  │
│ 2026-03-11 08:02 │ —            │ Logistics │ ❌ Failed  │ BYOD    │
└──────────────────┴──────────────┴───────────┴────────────┴─────────┘
```

---

## 15. Security Requirements

### Credential Storage

```
xAPI client secrets:   AES-256 encrypted at rest (node-crypto)
Database passwords:    Hetzner encrypted volume
JWT signing key:       512-bit random, rotated monthly
All secrets:           Coolify environment variables (never in code)
```

### Transport Security

```
HTTPS:          Required everywhere (Let's Encrypt via Coolify)
HSTS:           max-age=31536000; includeSubDomains
CSP:            Restrictive — no inline scripts
CORS:           Only runner.{customer-domain}.com allowed
```

### Input Validation

```typescript
// All inputs validated with Zod before processing
const switchSchema = z.object({
  targetDeptId: z.number().int().positive().max(999999)
});

const authSchema = z.object({
  idToken: z.string().min(100).max(5000),
  pbxFqdn: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).optional()
});
```

### FQDN Injection Prevention

The `pbxFqdn` parameter — whether from URL or request body — is always validated against the `pbx_credentials` whitelist before any xAPI call is made. An unregistered FQDN never reaches the network.

---

## 16. Sub-Agent Build Plan

### Pre-Build (You + Claude — one session)

```
Output: .env.example files for both repos
Output: Drizzle schema finalized
Output: API contract doc (this spec is sufficient)
Output: Azure App Registration created
Output: Entra "3CX Runners" group created
Output: Hetzner CX22 provisioned
Output: Coolify installed on new instance
Output: GitHub repos created (empty)
```

### Day 1 — Agent: Infrastructure

```
Scope: scaffold both repos, CI/CD, Docker, Coolify config
Branch: main (initial commit)
Reads: This spec §2, §3, §12, §17
Delivers:
  - Both repo structures created
  - Dockerfiles (multi-stage, production-optimised)
  - docker-compose.yml for local dev
  - GitHub Actions workflows
  - .env.example files
  - Coolify service YAML configs
  - README.md per repo
```

### Days 2–4 — Three Parallel Agents

```
Agent A — Runner API
  Branch: feature/runner-api
  Reads: This spec §4, §5, §7, §8, §9, §13, §14, §15
  Delivers:
    - Drizzle schema + migrations
    - All four endpoints
    - xAPI client (auth + 3 calls)
    - Entra group check
    - JWT session tokens
    - Rate limiting
    - Audit logging
    - Error handling
    - Unit tests (Jest)
    - Sentry integration

Agent B — Runner PWA
  Branch: feature/runner-pwa
  Reads: This spec §6, §7, §8, §11, §13
  Delivers:
    - MSAL silent SSO
    - Department switcher UI
    - PBX selector screen
    - Confirmation bottom sheet
    - All error screens
    - PWA manifest + service worker
    - Mobile-first Tailwind styling
    - API client (calls runner-api)
    - Offline shell

Agent C — TCX-Hub Admin Module
  Branch: feature/runner-admin (in tcx-hub repo)
  Reads: This spec §10, §4
  Delivers:
    - /admin/runners list page
    - Add/edit runner forms
    - PBX credential management
    - Audit log viewer
    - Intune URL generator
    - xAPI validation on save
```

### Day 5 — Agent: Integration

```
Branch: feature/integration
Reads: All of the above
Delivers:
  - Merge all branches
  - Wire PWA → API URLs
  - Align all env vars
  - End-to-end smoke test script
  - Fix contract mismatches
```

### Days 6–7 — Agent: QA (Your Playwright Pipeline)

```
Scope: Full audit against this spec
Delivers: RUNNER_AUDIT_REPORT.md
Tests:
  - Auth: valid user, not-a-runner, not-configured
  - Single PBX: direct to dept switcher
  - Multi-PBX: selector shown, selection works
  - Dept switch: success path, audit log written
  - Rate limit: 11th switch blocked
  - PBX unreachable: error screen shown
  - All error codes from §13
  - Admin: add runner, edit, deactivate
  - PWA: manifest valid, offline shell works
```

### Days 8–9 — Agent: Hardening

```
Scope: edge cases, xAPI compatibility, security
Delivers:
  - xAPI retry logic (3 attempts, exponential backoff)
  - Token refresh race condition handling
  - FQDN injection tests passing
  - Old 3CX v18 compatibility tested
  - Missing email field on extension handled
  - All Zod schemas tightened
  - CSP + HSTS headers verified
```

### Days 10–12 — You: Intune Validation

```
Manual steps (no agent can do this):
  Day 10: Configure Intune app + protection policy
           Enroll 1 test Android device
           Verify silent SSO works end-to-end
  Day 11: Test multi-PBX flow on BYOD device
           Test kiosk mode on shared device
           Fix any Intune-specific issues
  Day 12: Pilot with 5 real runners on 1 PBX
           Collect feedback
           Document runbook
```

---

## 17. Environment Variables Reference

### tcx-runner-api

```bash
# Database
DATABASE_URL=postgresql://runner:password@localhost:5432/runner_app

# Encryption (AES-256 for xAPI credential storage)
ENCRYPTION_KEY=                    # 64-char hex string

# Microsoft Entra ID
ENTRA_TENANT_ID=                   # Customer's M365 tenant ID
ENTRA_CLIENT_ID=                   # App registration client ID
ENTRA_CLIENT_SECRET=               # App registration secret (for Graph API)
ENTRA_RUNNERS_GROUP_ID=            # Object ID of "3CX Runners" security group

# JWT Session Tokens
JWT_SECRET=                        # 64-char random string
JWT_EXPIRES_IN=8h                  # Session duration

# Sentry
SENTRY_DSN=

# Server
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW=3600000          # 1 hour in ms
```

### tcx-runner-pwa

```bash
# API
NEXT_PUBLIC_API_URL=https://runner-api.{customer-domain}.com

# Microsoft Entra ID (public — safe in browser)
NEXT_PUBLIC_ENTRA_CLIENT_ID=
NEXT_PUBLIC_ENTRA_TENANT_ID=
NEXT_PUBLIC_APP_URL=https://runner.{customer-domain}.com

# Sentry (public DSN)
NEXT_PUBLIC_SENTRY_DSN=
```

---

*End of RUNNER_APP_SPEC.md*  
*This document is the single source of truth for all sub-agent build tasks.*  
*All agents must read this spec before writing any code.*
