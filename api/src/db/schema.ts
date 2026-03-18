import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// tenants
// One row per customer Azure AD tenant.
// Customer admins self-onboard: they supply their Entra tenant ID,
// security group OID, PBX credentials, and runner assignments
// via the admin UI — no manual platform setup required.
// ============================================================
export const tenants = pgTable(
  'tenants',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    entraTenantId: text('entra_tenant_id').notNull().unique(),
    name:          text('name').notNull(),
    entraGroupId:  text('entra_group_id').notNull(),
    adminEmails:   text('admin_emails').array().notNull().default([]),
    isActive:      boolean('is_active').notNull().default(true),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_tenants_entra_tenant_id').on(t.entraTenantId),
  ],
);

// ============================================================
// users
// Email/password authenticated users (parallel to Entra SSO).
// ============================================================
export const users = pgTable(
  'users',
  {
    id:                    uuid('id').primaryKey().defaultRandom(),
    email:                 text('email').notNull().unique(),
    passwordHash:          text('password_hash').notNull(),
    emailVerified:         boolean('email_verified').notNull().default(false),
    verifyToken:           text('verify_token'),
    verifyTokenExpiresAt:  timestamp('verify_token_expires_at', { withTimezone: true }),
    resetToken:            text('reset_token'),
    resetTokenExpiresAt:   timestamp('reset_token_expires_at', { withTimezone: true }),
    failedLoginAttempts:   integer('failed_login_attempts').notNull().default(0),
    lockedUntil:           timestamp('locked_until', { withTimezone: true }),
    tenantId:              uuid('tenant_id').references(() => tenants.id),
    createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    role:                  text('role').notNull().default('runner'),
    updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_users_reset_token').on(t.resetToken),
    index('idx_users_verify_token').on(t.verifyToken),
    index('idx_users_tenant_id').on(t.tenantId),
  ],
);

// ============================================================
// pbx_credentials
// xAPI / user credentials per PBX FQDN, scoped to a tenant.
// Credential fields are AES-256-GCM encrypted at rest.
// ============================================================
export const pbxCredentials = pgTable(
  'pbx_credentials',
  {
    id:                uuid('id').primaryKey().defaultRandom(),
    tenantId:          uuid('tenant_id').notNull().references(() => tenants.id),
    pbxFqdn:           text('pbx_fqdn').notNull().unique(),
    pbxName:           text('pbx_name').notNull(),
    authMode:          text('auth_mode').notNull(), // 'xapi' | 'user_credentials'
    // AES-256-GCM encrypted; present when authMode='xapi'
    xapiClientId:      text('xapi_client_id'),
    xapiSecret:        text('xapi_secret'),
    // AES-256-GCM encrypted; present when authMode='user_credentials'
    pbxUsername:       text('pbx_username'),
    pbxPassword:       text('pbx_password'),
    // Cached OAuth token (xAPI)
    xapiToken:         text('xapi_token'),
    xapiTokenExpiresAt: timestamp('xapi_token_expires_at', { withTimezone: true }),
    isActive:          boolean('is_active').notNull().default(true),
    createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_pbx_credentials_tenant_id').on(t.tenantId),
    index('idx_pbx_credentials_pbx_fqdn').on(t.pbxFqdn),
  ],
);

// ============================================================
// runners
// One row per (entra_email, pbx_credential_id) pair.
// A runner may be registered against multiple PBX instances.
// ============================================================
export const runners = pgTable(
  'runners',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    tenantId:         uuid('tenant_id').notNull().references(() => tenants.id),
    pbxCredentialId:  uuid('pbx_credential_id').notNull().references(() => pbxCredentials.id),
    userId:           uuid('user_id').references(() => users.id),
    entraEmail:       text('entra_email').notNull(),
    extensionNumber:  text('extension_number').notNull(),
    allowedDeptIds:   text('allowed_dept_ids').array().notNull().default([]),
    isActive:         boolean('is_active').notNull().default(true),
    createdBy:        text('created_by').notNull(),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    outboundCallerId: text('outbound_caller_id'),
    deptCallerIds:    jsonb('dept_caller_ids').$type<Record<string, string>>(),
    deptRingGroups:   jsonb('dept_ring_groups').$type<Record<string, number[]>>(),
  },
  (t) => [
    uniqueIndex('idx_runners_email_cred_unique').on(t.entraEmail, t.pbxCredentialId),
    index('idx_runners_tenant_id').on(t.tenantId),
    index('idx_runners_entra_email').on(t.entraEmail),
    index('idx_runners_pbx_credential_id').on(t.pbxCredentialId),
    index('idx_runners_is_active').on(t.isActive),
  ],
);

// ============================================================
// audit_log
// Immutable record of every department-switch attempt.
// Denormalised fields ensure historical accuracy even after
// runner/PBX records are modified or deleted.
// ============================================================
export const auditLog = pgTable(
  'audit_log',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    runnerId:        uuid('runner_id').notNull().references(() => runners.id),
    entraEmail:      text('entra_email').notNull(),
    pbxFqdn:         text('pbx_fqdn').notNull(),
    extensionNumber: text('extension_number').notNull(),
    fromDeptId:      text('from_dept_id'),
    fromDeptName:    text('from_dept_name'),
    toDeptId:        text('to_dept_id').notNull(),
    toDeptName:      text('to_dept_name'),
    status:          text('status').notNull(), // 'success' | 'failed' | 'denied'
    errorMessage:    text('error_message'),
    ipAddress:       text('ip_address'),
    userAgent:       text('user_agent'),
    deviceId:        text('device_id'),
    durationMs:      integer('duration_ms'),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_runner_id').on(t.runnerId),
    index('idx_audit_entra_email').on(t.entraEmail),
    index('idx_audit_pbx_fqdn').on(t.pbxFqdn),
    index('idx_audit_created_at').on(t.createdAt),
    index('idx_audit_created_status').on(t.createdAt, t.status),
  ],
);

// ============================================================
// dept_cache
// Cached department list per PBX, refreshed periodically.
// ============================================================
export const deptCache = pgTable(
  'dept_cache',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    pbxCredentialId:  uuid('pbx_credential_id').notNull().references(() => pbxCredentials.id),
    deptId:           text('dept_id').notNull(),
    deptName:         text('dept_name').notNull(),
    cachedAt:         timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_dept_cache_cred_dept_unique').on(t.pbxCredentialId, t.deptId),
    index('idx_dept_cache_pbx_credential_id').on(t.pbxCredentialId),
  ],
);

// ============================================================
// pbx_extensions
// Cached extension list per PBX, used during onboarding to
// let admins select which extensions become runners.
// ============================================================
export const pbxExtensions = pgTable(
  'pbx_extensions',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    pbxCredentialId:  uuid('pbx_credential_id').notNull().references(() => pbxCredentials.id),
    extensionNumber:  text('extension_number').notNull(),
    email:            text('email'),
    displayName:      text('display_name'),
    currentGroupId:   text('current_group_id'),
    currentGroupName: text('current_group_name'),
    fetchedAt:        timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_pbx_ext_unique').on(t.pbxCredentialId, t.extensionNumber),
    index('idx_pbx_ext_cred_id').on(t.pbxCredentialId),
  ],
);

// ============================================================
// manager_tenants
// Maps manager-role users to the tenants they can manage.
// ============================================================
export const managerTenants = pgTable(
  'manager_tenants',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId:   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').notNull().references(() => users.id),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_manager_tenants_unique').on(t.userId, t.tenantId),
    index('idx_manager_tenants_user_id').on(t.userId),
    index('idx_manager_tenants_tenant_id').on(t.tenantId),
  ],
);

// ============================================================
// Relations
// ============================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  pbxCredentials: many(pbxCredentials),
  runners:        many(runners),
}));

export const pbxCredentialsRelations = relations(pbxCredentials, ({ one, many }) => ({
  tenant:     one(tenants, { fields: [pbxCredentials.tenantId], references: [tenants.id] }),
  runners:    many(runners),
  deptCache:  many(deptCache),
  extensions: many(pbxExtensions),
}));

export const usersRelations = relations(users, ({ many }) => ({
  runners: many(runners),
  managedTenants: many(managerTenants),
}));

export const runnersRelations = relations(runners, ({ one, many }) => ({
  tenant:        one(tenants,        { fields: [runners.tenantId],        references: [tenants.id] }),
  pbxCredential: one(pbxCredentials, { fields: [runners.pbxCredentialId], references: [pbxCredentials.id] }),
  user:          one(users,          { fields: [runners.userId],          references: [users.id] }),
  auditLogs:     many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  runner: one(runners, { fields: [auditLog.runnerId], references: [runners.id] }),
}));

export const deptCacheRelations = relations(deptCache, ({ one }) => ({
  pbxCredential: one(pbxCredentials, { fields: [deptCache.pbxCredentialId], references: [pbxCredentials.id] }),
}));

export const pbxExtensionsRelations = relations(pbxExtensions, ({ one }) => ({
  pbxCredential: one(pbxCredentials, { fields: [pbxExtensions.pbxCredentialId], references: [pbxCredentials.id] }),
}));

export const managerTenantsRelations = relations(managerTenants, ({ one }) => ({
  user:       one(users,   { fields: [managerTenants.userId],   references: [users.id] }),
  tenant:     one(tenants,  { fields: [managerTenants.tenantId], references: [tenants.id] }),
  assignedByUser: one(users, { fields: [managerTenants.assignedBy], references: [users.id] }),
}));
