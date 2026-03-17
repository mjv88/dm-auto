import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// tenants
// ============================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  adminEmails: text('admin_emails').array().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// users
// ============================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    verifyToken: text('verify_token'),
    verifyTokenExpiresAt: timestamp('verify_token_expires_at', { withTimezone: true }),
    resetToken: text('reset_token'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    role: text('role').notNull().default('runner'),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_users_reset_token').on(t.resetToken),
    index('idx_users_verify_token').on(t.verifyToken),
    index('idx_users_tenant_id').on(t.tenantId),
  ],
);

// ============================================================
// pbx_credentials
// ============================================================
export const pbxCredentials = pgTable(
  'pbx_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    pbxFqdn: text('pbx_fqdn').notNull().unique(),
    pbxName: text('pbx_name').notNull(),
    authMode: text('auth_mode').notNull(),
    xapiClientId: text('xapi_client_id'),
    xapiSecret: text('xapi_secret'),
    xapiToken: text('xapi_token'),
    xapiTokenExpiresAt: timestamp('xapi_token_expires_at', { withTimezone: true }),
    provisionApiKeyHash: text('provision_api_key_hash'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_pbx_credentials_tenant_id').on(t.tenantId),
  ],
);

// ============================================================
// pbx_extensions (with provisioning fields)
// ============================================================
export const pbxExtensions = pgTable(
  'pbx_extensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pbxCredentialId: uuid('pbx_credential_id').notNull().references(() => pbxCredentials.id, { onDelete: 'cascade' }),
    extensionNumber: text('extension_number').notNull(),
    displayName: text('display_name'),
    email: text('email'),
    pbxUserId: integer('pbx_user_id'),
    provLinkExternal: text('prov_link_external'),  // encrypted
    provConfigXml: text('prov_config_xml'),  // encrypted full provisioning XML
    provLinkFetchedAt: timestamp('prov_link_fetched_at', { withTimezone: true }),
    provisioningStatus: text('provisioning_status').notNull().default('pending'),
    provisioningError: text('provisioning_error'),
    configVersion: text('config_version'),
    deviceId: text('device_id'),
    deviceName: text('device_name'),
    lastAckedAt: timestamp('last_acked_at', { withTimezone: true }),
    isSelected: boolean('is_selected').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idx_pbx_ext_unique').on(t.pbxCredentialId, t.extensionNumber),
    index('idx_pbx_ext_cred_id').on(t.pbxCredentialId),
    index('idx_pbx_ext_email').on(t.email),
  ],
);

// ============================================================
// audit_log
// ============================================================
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userEmail: text('user_email').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: text('details'), // JSON string
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_created').on(t.createdAt),
  ],
);

// ============================================================
// Relations
// ============================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  pbxCredentials: many(pbxCredentials),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));

export const pbxCredentialsRelations = relations(pbxCredentials, ({ one, many }) => ({
  tenant: one(tenants, { fields: [pbxCredentials.tenantId], references: [tenants.id] }),
  extensions: many(pbxExtensions),
}));

export const pbxExtensionsRelations = relations(pbxExtensions, ({ one }) => ({
  pbxCredential: one(pbxCredentials, { fields: [pbxExtensions.pbxCredentialId], references: [pbxCredentials.id] }),
}));
