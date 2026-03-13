Read RUNNER_APP_SPEC.md section §4 (Database Schema) completely.
Read src/db/schema.ts (currently a stub).

Your task: Implement the complete Drizzle ORM schema and migrations.

IMPORTANT: This is a self-service multi-tenant app. Customer admins onboard themselves —
they configure their own Entra tenant, Entra group, PBX credentials, and runners via
an admin UI. There is NO manual setup by the platform team after initial deployment.

Required deliverables:
- src/db/schema.ts: complete Drizzle schema with these tables:

  tenants
  ├── id (uuid, pk)
  ├── entra_tenant_id (text, unique) — Customer's Azure AD tenant ID
  ├── name (text) — Display name e.g. "Kunde GmbH"
  ├── entra_group_id (text) — Their "3CX Runners" security group OID
  ├── admin_emails (text[]) — Emails allowed to access admin panel for this tenant
  ├── is_active (boolean, default true)
  ├── created_at (timestamp)
  └── updated_at (timestamp)

  pbx_credentials
  ├── id (uuid, pk)
  ├── tenant_id (uuid, fk → tenants.id)
  ├── pbx_fqdn (text, unique) — e.g. "kunde-gmbh.3cx.eu"
  ├── pbx_name (text) — Display name
  ├── auth_mode (text) — 'xapi' | 'user_credentials'
  ├── xapi_client_id (text, nullable) — AES-256 encrypted, used when auth_mode='xapi'
  ├── xapi_secret (text, nullable) — AES-256 encrypted
  ├── pbx_username (text, nullable) — AES-256 encrypted, used when auth_mode='user_credentials'
  ├── pbx_password (text, nullable) — AES-256 encrypted
  ├── xapi_token (text, nullable) — Cached OAuth token
  ├── xapi_token_expires_at (timestamp, nullable)
  ├── is_active (boolean, default true)
  ├── created_at (timestamp)
  └── updated_at (timestamp)

  runners
  ├── id (uuid, pk)
  ├── tenant_id (uuid, fk → tenants.id)
  ├── pbx_credential_id (uuid, fk → pbx_credentials.id)
  ├── entra_email (text) — Runner's Microsoft email
  ├── extension_number (text) — Extension on this PBX
  ├── allowed_dept_ids (text[]) — Department IDs user can switch to
  ├── is_active (boolean, default true)
  ├── created_by (text) — Admin email who created this runner
  ├── created_at (timestamp)
  └── updated_at (timestamp)
  UNIQUE(entra_email, pbx_credential_id)

  audit_log
  ├── id (uuid, pk)
  ├── runner_id (uuid, fk → runners.id)
  ├── entra_email (text) — Denormalized for immutability
  ├── pbx_fqdn (text) — Denormalized
  ├── extension_number (text) — Denormalized
  ├── from_dept_id (text, nullable)
  ├── to_dept_id (text)
  ├── status (text) — 'success' | 'failed' | 'denied'
  ├── error_message (text, nullable)
  ├── device_id (text, nullable) — Intune device ID
  ├── duration_ms (integer, nullable) — xAPI call timing
  └── created_at (timestamp)

  dept_cache
  ├── id (uuid, pk)
  ├── pbx_credential_id (uuid, fk → pbx_credentials.id)
  ├── dept_id (text)
  ├── dept_name (text)
  ├── cached_at (timestamp)
  └── UNIQUE(pbx_credential_id, dept_id)

  Indexes:
  - tenants: entra_tenant_id
  - pbx_credentials: tenant_id, pbx_fqdn
  - runners: tenant_id, entra_email, pbx_credential_id, is_active
  - audit_log: runner_id, entra_email, pbx_fqdn, created_at
  - dept_cache: pbx_credential_id

- src/db/encrypt.ts
  encryptField(plaintext: string): string — AES-256-GCM using ENCRYPTION_KEY env var
  decryptField(ciphertext: string): string
  Used for all credential fields in pbx_credentials

- src/db/migrations/0001_initial.sql: raw SQL migration
- src/db/migrate.ts: migration runner
- src/db/index.ts: db connection (postgres-js + drizzle)

Validation:
- Run: npx drizzle-kit generate (must succeed)
- Run: npx drizzle-kit check (must pass)
- Write a test: tests/db/schema.test.ts
  that verifies all tables can be created on a test DB
- Write a test: tests/db/encrypt.test.ts
  that verifies encrypt/decrypt roundtrip

Commit to branch feature/schema.
Open PR: "feat: database schema and migrations"
Update BUILD_STATE.json: schema.status = "complete"
