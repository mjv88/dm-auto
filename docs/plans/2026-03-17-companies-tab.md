# Companies Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-step setup wizard with a dedicated "Companies" tab in the admin portal, where a super_admin can create companies and assign at least one admin (not themselves), then share an invite link. PBX systems are added afterwards via the existing PBX tab.

**Architecture:** Two new API endpoints (`GET /admin/tenants` listing all tenants, `POST /admin/tenants` creating one) gated to `super_admin`. The PWA adds a Companies tab (visible to super_admin only), a list page, and an "Add Company" modal. The setup wizard pages are removed (redirected to `/admin`). No DB migration needed — `entraTenantId` is seeded with a generated UUID placeholder that the company admin replaces later via Settings.

**Tech Stack:** Fastify 4, Drizzle ORM, Zod, Next.js 14 App Router, Zustand, Tailwind CSS

---

## Chunk 1: API — list + create tenants

### Task 1: Add Zod schemas for tenant creation

**Files:**
- Modify: `api/src/utils/validate.ts`

- [ ] **Step 1: Add `createTenantSchema` and extend `updateTenantSchema`**

Open `api/src/utils/validate.ts` and make two changes:

After the existing `updateTenantSchema` block (line 120–123), replace it with:

```typescript
/** PUT /admin/tenants/me */
export const updateTenantSchema = z.object({
  name:          z.string().min(1).max(255).optional(),
  entraGroupId:  z.string().uuid().optional(),
  entraTenantId: z.string().uuid('Must be a valid UUID').optional(),
});

/** POST /admin/tenants (super_admin creates a company) */
export const createTenantSchema = z.object({
  name:          z.string().min(1).max(255),
  adminEmails:   z
    .array(z.string().email('Each entry must be a valid email'))
    .min(1, 'At least one admin email is required'),
  entraTenantId: z.string().uuid('Must be a valid UUID').optional(),
});
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/utils/validate.ts
git commit -m "feat(api): add createTenantSchema and allow entraTenantId in updateTenantSchema"
```

---

### Task 2: Add GET /admin/tenants and POST /admin/tenants endpoints

**Files:**
- Modify: `api/src/routes/admin/tenants.ts`

- [ ] **Step 1: Replace the file content**

The existing file only has `GET /admin/tenants/me` and `PUT /admin/tenants/me`. Add two new routes at the top of the plugin function, **before** the existing `/me` routes:

```typescript
/**
 * src/routes/admin/tenants.ts
 *
 * GET  /admin/tenants      — list all tenants (super_admin only)
 * POST /admin/tenants      — create a new tenant (super_admin only)
 * GET  /admin/tenants/me   — get current tenant config (auto-creates on first login)
 * PUT  /admin/tenants/me   — update tenant (name, entraGroupId, entraTenantId)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql, ilike, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { tenants } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { createSessionToken } from '../../middleware/session.js';
import type { UnifiedSession } from '../../middleware/session.js';
import { updateTenantSchema, createTenantSchema } from '../../utils/validate.js';

export async function adminTenantRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/tenants ─────────────────────────────────────────────────────
  // Lists all tenants. Super_admin only.
  // Query: ?search=name&page=1&limit=25

  fastify.get('/admin/tenants', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { search, page: pageStr, limit: limitStr } = request.query as {
      search?: string;
      page?: string;
      limit?: string;
    };

    const db = getDb();
    const page = Math.max(1, parseInt(pageStr ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '25', 10)));
    const offset = (page - 1) * limit;

    const whereClause = search
      ? ilike(tenants.name, `%${search}%`)
      : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(tenants)
        .where(whereClause)
        .orderBy(tenants.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(tenants)
        .where(whereClause),
    ]);

    return reply.send({
      tenants: rows,
      total: Number(total),
      page,
      pages: Math.ceil(Number(total) / limit),
    });
  });

  // ── POST /admin/tenants ────────────────────────────────────────────────────
  // Creates a new tenant. Super_admin only.
  // Body: { name, adminEmails: string[], entraTenantId?: string }
  // Returns: { tenant, inviteBase } — frontend builds invite URLs

  fastify.post('/admin/tenants', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const session = request.session!;

    const parseResult = createTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.errors.map((e) => e.message).join('; '),
      });
    }

    const { name, adminEmails, entraTenantId } = parseResult.data;

    // Reject if super_admin is trying to add themselves as admin —
    // they already have global access.
    const myEmail = session.entraEmail ?? session.email;
    if (adminEmails.some((e) => e.toLowerCase() === myEmail.toLowerCase())) {
      return reply.code(400).send({
        error: 'SELF_ASSIGN_NOT_ALLOWED',
        message: 'You cannot assign yourself as a company admin. Add a different email.',
      });
    }

    const db = getDb();

    // Use provided Entra tenant ID or a placeholder UUID (admin fills in later via Settings).
    const resolvedEntraTenantId = entraTenantId ?? randomUUID();

    const [tenant] = await db
      .insert(tenants)
      .values({
        entraTenantId: resolvedEntraTenantId,
        name,
        entraGroupId: '',
        adminEmails,
        isActive: true,
      })
      .returning();

    return reply.code(201).send({ tenant });
  });

  // ── GET /admin/tenants/me ──────────────────────────────────────────────────
  // (existing code unchanged — keep as-is)
  fastify.get('/admin/tenants/me', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const db = getDb();

    let tenantRow: typeof tenants.$inferSelect | undefined;

    if (tenantId) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      tenantRow = rows[0];
    } else if (session.tid) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.entraTenantId, session.tid))
        .limit(1);
      tenantRow = rows[0];

      if (!tenantRow) {
        const created = await db
          .insert(tenants)
          .values({
            entraTenantId: session.tid,
            name: `Tenant ${session.tid}`,
            entraGroupId: '',
            adminEmails: [session.entraEmail ?? session.email],
            isActive: true,
          })
          .returning();
        tenantRow = created[0];
      }
    }

    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    const newSession: UnifiedSession = {
      type: 'session',
      userId: session.userId ?? '',
      email: session.entraEmail ?? session.email,
      role: session.role,
      tenantId: tenantRow.id,
      runnerId: null,
      emailVerified: true,
      pbxFqdn: null,
      extensionNumber: null,
      entraEmail: session.entraEmail,
      tid: session.tid || tenantRow.entraTenantId,
      oid: session.oid,
    };
    const sessionToken = createSessionToken(newSession);

    return reply.send({ tenant: tenantRow, sessionToken });
  });

  // ── PUT /admin/tenants/me ──────────────────────────────────────────────────

  fastify.put('/admin/tenants/me', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const parseResult = updateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.message,
      });
    }
    const updates = parseResult.data;

    const db = getDb();

    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId!))
      .limit(1);

    const tenantRow = rows[0];
    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    const updated = await db
      .update(tenants)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.entraGroupId !== undefined && { entraGroupId: updates.entraGroupId }),
        ...(updates.entraTenantId !== undefined && { entraTenantId: updates.entraTenantId }),
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, tenantId!))
      .returning();

    return reply.send({ tenant: updated[0] });
  });
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/admin/tenants.ts
git commit -m "feat(api): add GET /admin/tenants and POST /admin/tenants for super_admin"
```

---

## Chunk 2: PWA — Companies tab, list page, modal

### Task 3: Add "Companies" tab to AdminNav (super_admin only)

**Files:**
- Modify: `pwa/components/admin/AdminNav.tsx`

- [ ] **Step 1: Update AdminNav to conditionally include Companies tab**

Replace the entire file:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';

const BASE_LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/pbx', label: 'PBX' },
  { href: '/admin/runners', label: 'Runners' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/settings', label: 'Settings' },
];

const SUPER_ADMIN_LINKS = [
  { href: '/admin/companies', label: 'Companies' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const role = useRunnerStore((s) => s.role);

  const links = role === 'super_admin'
    ? [...SUPER_ADMIN_LINKS, ...BASE_LINKS]
    : BASE_LINKS;

  return (
    <nav className="bg-white border-b">
      <div className="max-w-5xl mx-auto flex overflow-x-auto">
        {links.map(({ href, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/AdminNav.tsx
git commit -m "feat(pwa): add Companies tab to AdminNav for super_admin"
```

---

### Task 4: Update CompanySwitcher to use GET /admin/tenants

**Files:**
- Modify: `pwa/components/admin/CompanySwitcher.tsx`

The current component hits `/admin/tenants/me` for super_admin and expects a shape that doesn't exist yet. Fix it to use the new `GET /admin/tenants` endpoint.

- [ ] **Step 1: Update CompanySwitcher**

Replace the entire file:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRunnerStore } from '@/lib/store';
import { adminGet } from '@/lib/adminApi';

interface TenantOption {
  id: string;
  name: string;
}

export default function CompanySwitcher() {
  const role = useRunnerStore((s) => s.role);
  const selectedAdminTenantId = useRunnerStore((s) => s.selectedAdminTenantId);
  const setSelectedAdminTenantId = useRunnerStore((s) => s.setSelectedAdminTenantId);

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTenants() {
      try {
        if (role === 'super_admin') {
          const data = await adminGet<{ tenants: TenantOption[] }>('/admin/tenants?limit=100');
          setTenants(data.tenants);
        } else {
          const data = await adminGet<{ tenant: TenantOption }>('/admin/tenants/me');
          if (data.tenant) {
            setTenants([data.tenant]);
            if (!selectedAdminTenantId) {
              setSelectedAdminTenantId(data.tenant.id);
            }
          }
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-gray-400"><span>Loading companies...</span></div>;
  }

  if (tenants.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="company-switcher" className="text-sm font-medium text-gray-600">
        Company:
      </label>
      <select
        id="company-switcher"
        value={selectedAdminTenantId ?? ''}
        onChange={(e) => setSelectedAdminTenantId(e.target.value || null)}
        className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {role === 'super_admin' && <option value="">All Companies</option>}
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/CompanySwitcher.tsx
git commit -m "fix(pwa): CompanySwitcher uses GET /admin/tenants for super_admin"
```

---

### Task 5: Create AddCompanyModal component

**Files:**
- Create: `pwa/components/admin/AddCompanyModal.tsx`

This modal collects company name + admin emails. Validates client-side that:
1. Name is non-empty
2. At least one admin email is provided
3. No email matches the current user's email

On submit it calls `POST /admin/tenants`, then displays the invite link for each admin email so the super_admin can share them.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import { adminPost } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';

interface Tenant {
  id: string;
  name: string;
  adminEmails: string[];
  entraTenantId: string;
  entraGroupId: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  onClose: () => void;
  onSuccess: (tenant: Tenant) => void;
}

const API_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export default function AddCompanyModal({ onClose, onSuccess }: Props) {
  const myEmail = useRunnerStore((s) => s.runnerProfile?.entraEmail ?? '');

  const [name, setName] = useState('');
  const [adminEmails, setAdminEmails] = useState<string[]>(['']);
  const [entraTenantId, setEntraTenantId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Created state — show invite links
  const [created, setCreated] = useState<Tenant | null>(null);

  function addEmailRow() {
    setAdminEmails((prev) => [...prev, '']);
  }

  function updateEmail(index: number, value: string) {
    setAdminEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  }

  function removeEmail(index: number) {
    setAdminEmails((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (!name.trim()) return 'Company name is required.';
    const filled = adminEmails.map((e) => e.trim()).filter(Boolean);
    if (filled.length === 0) return 'Add at least one admin email.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const e of filled) {
      if (!emailRegex.test(e)) return `"${e}" is not a valid email.`;
      if (e.toLowerCase() === myEmail.toLowerCase()) {
        return 'You cannot assign yourself as a company admin. Use a different email.';
      }
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (entraTenantId && !uuidRegex.test(entraTenantId)) {
      return 'Entra Tenant ID must be a valid UUID (or leave blank).';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        adminEmails: adminEmails.map((e) => e.trim()).filter(Boolean),
      };
      if (entraTenantId.trim()) body.entraTenantId = entraTenantId.trim();

      const result = await adminPost<{ tenant: Tenant }>('/admin/tenants', body);
      setCreated(result.tenant);
      onSuccess(result.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company.');
    } finally {
      setSaving(false);
    }
  }

  function inviteLink(tenantId: string) {
    return `${API_URL}/register?company=${tenantId}`;
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
        {!created ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Add Company</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Admin Emails */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Admin(s) <span className="text-red-500">*</span>
                  <span className="ml-1 text-xs font-normal text-gray-400">— at least one, not yourself</span>
                </label>
                <div className="space-y-2">
                  {adminEmails.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => updateEmail(i, e.target.value)}
                        placeholder="admin@company.com"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      {adminEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEmail(i)}
                          className="text-sm text-red-500 hover:text-red-700 px-2"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addEmailRow}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  + Add another admin
                </button>
              </div>

              {/* Entra Tenant ID (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entra Tenant ID
                  <span className="ml-1 text-xs font-normal text-gray-400">— optional, can be set later in Settings</span>
                </label>
                <input
                  type="text"
                  value={entraTenantId}
                  onChange={(e) => setEntraTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create Company'}
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Success state — show invite links */
          <>
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-xl">✓</span>
              <h2 className="text-lg font-semibold text-gray-900">
                {created.name} created
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              Share the invite link(s) below. Each admin uses the link to register and will automatically be assigned to this company.
            </p>

            <div className="space-y-3">
              {created.adminEmails.map((email) => (
                <div key={email} className="border border-gray-200 rounded-md p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">{email}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-50 border rounded px-2 py-1 truncate font-mono">
                      {inviteLink(created.id)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(inviteLink(created.id))}
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              The admin can add their PBX systems and runners after logging in.
            </p>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/AddCompanyModal.tsx
git commit -m "feat(pwa): AddCompanyModal with name, admin emails, optional Entra tenant ID"
```

---

### Task 6: Create /admin/companies page

**Files:**
- Create: `pwa/app/admin/companies/page.tsx`

Lists all tenants with search + pagination. "Add Company" button opens AddCompanyModal. Each row links to the company's Settings via the company switcher.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminGet } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';
import DataTable from '@/components/admin/DataTable';
import AddCompanyModal from '@/components/admin/AddCompanyModal';

interface TenantRow {
  id: string;
  name: string;
  entraTenantId: string;
  entraGroupId: string;
  adminEmails: string[];
  isActive: boolean;
  createdAt: string;
}

interface TenantsResponse {
  tenants: TenantRow[];
  total: number;
  page: number;
  pages: number;
}

export default function CompaniesPage() {
  const role = useRunnerStore((s) => s.role);
  const setSelectedAdminTenantId = useRunnerStore((s) => s.setSelectedAdminTenantId);
  const router = useRouter();

  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Gate: only super_admin can access this page
  useEffect(() => {
    if (role !== 'super_admin') {
      router.replace('/admin');
    }
  }, [role, router]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      if (search) params.set('search', search);
      const result = await adminGet<TenantsResponse>(`/admin/tenants?${params.toString()}`);
      setData(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const columns = [
    {
      key: 'name',
      header: 'Company',
      render: (row: TenantRow) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'adminEmails',
      header: 'Admins',
      render: (row: TenantRow) => (
        <span className="text-sm text-gray-600">
          {row.adminEmails.length > 0
            ? row.adminEmails.join(', ')
            : <span className="text-gray-400 italic">None assigned</span>}
        </span>
      ),
    },
    {
      key: 'entraGroupId',
      header: 'Entra Configured',
      render: (row: TenantRow) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          row.entraGroupId
            ? 'bg-green-100 text-green-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {row.entraGroupId ? 'Yes' : 'Pending'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: TenantRow) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: TenantRow) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  if (role !== 'super_admin') return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Companies</h2>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Add Company
        </button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search by company name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : data ? (
        <>
          <DataTable
            columns={columns}
            data={data.tenants}
            rowKey={(row) => row.id}
            actions={(row) => (
              <button
                onClick={() => {
                  setSelectedAdminTenantId(row.id);
                  router.push('/admin/settings');
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Settings
              </button>
            )}
          />

          {data.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-500">
                Page {data.page} of {data.pages} ({data.total} companies)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">No companies found.</p>
      )}

      {showModal && (
        <AddCompanyModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchTenants();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add app/admin/companies/page.tsx
git commit -m "feat(pwa): /admin/companies page with list, search, and Add Company modal"
```

---

## Chunk 3: Remove setup wizard pages

### Task 7: Remove setup wizard pages

**Files:**
- Delete: `pwa/app/setup/company/page.tsx`
- Delete: `pwa/app/setup/pbx/page.tsx`
- Delete: `pwa/app/setup/runners/page.tsx`
- Delete: `pwa/app/setup/invite/page.tsx`
- Modify: `pwa/app/setup/page.tsx` — redirect to `/admin`
- Modify: `pwa/app/setup/layout.tsx` — simplify (no wizard steps UI needed)

The API setup routes (`/setup/*`) are left in place — they're harmless and removing backend routes that may have been called externally is riskier than keeping them. They simply won't be reachable from the UI.

- [ ] **Step 1: Replace setup/page.tsx with a redirect**

Replace the content of `pwa/app/setup/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function SetupPage() {
  redirect('/admin');
}
```

- [ ] **Step 2: Delete the wizard step pages**

```bash
cd C:/Projects/dm/dm-auto/pwa
rm app/setup/company/page.tsx
rm app/setup/pbx/page.tsx
rm app/setup/runners/page.tsx
rm app/setup/invite/page.tsx
```

Also remove the now-empty directories:

```bash
rmdir app/setup/company app/setup/pbx app/setup/runners app/setup/invite
```

- [ ] **Step 3: Simplify setup/layout.tsx**

The layout had a step progress indicator that referenced the 4 wizard steps. Since `/setup` now just redirects, the layout will only render briefly. Replace it with a passthrough:

```tsx
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 4: Build to verify no broken imports**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0. If any import errors appear, remove the offending import.

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add app/setup/
git commit -m "feat(pwa): retire setup wizard — redirect /setup to /admin"
```

---

## Chunk 4: runnerProfile entraEmail wiring

### Task 8: Ensure myEmail is available in AddCompanyModal

**Context:** `AddCompanyModal` reads `runnerProfile?.entraEmail` from the store to block self-assignment. Verify `runnerProfile` is populated for super_admin sessions (it should be set in the auth flow, but confirm).

**Files:**
- Read: `pwa/lib/api.ts` or `pwa/app/page.tsx` — the auth flow that sets `runnerProfile`

- [ ] **Step 1: Check how runnerProfile is set**

```bash
grep -n "setRunnerProfile\|runnerProfile" C:/Projects/dm/dm-auto/pwa/lib/api.ts C:/Projects/dm/dm-auto/pwa/app/page.tsx
```

- [ ] **Step 2: If runnerProfile.entraEmail is not reliably set for super_admin**

In `AddCompanyModal.tsx`, fall back to reading the email from the JWT in sessionStorage:

Replace the `myEmail` line with:

```typescript
const sessionToken = useRunnerStore((s) => s.sessionToken);
const myEmail = (() => {
  try {
    if (!sessionToken) return '';
    const payload = JSON.parse(atob(sessionToken.split('.')[1]));
    return payload.email ?? payload.entraEmail ?? '';
  } catch {
    return '';
  }
})();
```

- [ ] **Step 3: Commit if changed**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/AddCompanyModal.tsx
git commit -m "fix(pwa): fall back to JWT payload for myEmail in AddCompanyModal"
```

---

## Verification

- [ ] `npm run build` passes in both `api/` and `pwa/`
- [ ] Navigating to `/setup` redirects to `/admin`
- [ ] As super_admin, Companies tab appears in nav; as admin/manager it does not
- [ ] "Add Company" form blocks empty name, zero admin emails, self-assignment
- [ ] On successful creation, invite links are shown and copyable
- [ ] Created company appears in the Companies list
- [ ] CompanySwitcher dropdown includes the new company for super_admin
- [ ] Settings action on a company row switches to that company's Settings page
