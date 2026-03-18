# OutboundCallerID per Runner/Department Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins configure an outbound caller ID per runner (default) and per department (override); the correct value is auto-applied in the 3CX xAPI PATCH call when a runner switches department.

**Architecture:** Two new nullable columns (`outbound_caller_id text`, `dept_caller_ids jsonb`) on the `runners` table. The switch route resolves the caller ID server-side (dept override → runner default → null) and passes it to `patchUserGroup`. Admins configure both values in the redesigned RunnerModal.

**Tech Stack:** Fastify 4, Drizzle ORM, Zod, Next.js 14 App Router, Tailwind CSS, Jest + nock

**Spec:** `docs/superpowers/specs/2026-03-18-outbound-caller-id-design.md`

---

## Chunk 1: API + xAPI layer

### Task 1: Extend schema + generate migration

**Files:**
- Modify: `api/src/db/schema.ts` (runners table, lines 103–125)
- Generate: `api/src/db/migrations/` (new file via drizzle-kit)

- [ ] **Step 1: Add `jsonb` to the drizzle-orm/pg-core import**

In `api/src/db/schema.ts`, the first import line currently reads:
```typescript
import {
  pgTable, uuid, text, boolean, timestamp, integer, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
```

Add `jsonb` to that list:
```typescript
import {
  pgTable, uuid, text, boolean, timestamp, integer, uniqueIndex, index, jsonb,
} from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Add two columns to the runners table in schema.ts**

In `api/src/db/schema.ts`, inside the `runners` pgTable definition, add these two lines after the `updatedAt` line (before the closing `},`):

```typescript
outboundCallerId: text('outbound_caller_id'),
deptCallerIds:    jsonb('dept_caller_ids').$type<Record<string, string>>(),
```

- [ ] **Step 3: Generate the migration**

```bash
cd C:/Projects/dm/dm-auto/api
DATABASE_URL=postgresql://runner:RunnerDb2026Secure@localhost:5432/runner npx drizzle-kit generate
```

If the local DB isn't running, use `--config drizzle.config.ts` and accept the dry-run output. A new `.sql` file appears in `src/db/migrations/` containing:

```sql
ALTER TABLE "runners" ADD COLUMN "outbound_caller_id" text;
ALTER TABLE "runners" ADD COLUMN "dept_caller_ids" jsonb;
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(api): add outboundCallerId + deptCallerIds columns to runners table"
```

---

### Task 2: Extend Zod validation schemas

**Files:**
- Modify: `api/src/utils/validate.ts` (createRunnerSchema ~line 102, updateRunnerSchema ~line 110)

- [ ] **Step 1: Add caller ID fields to both runner schemas**

The caller ID regex must be defined once and reused. In `api/src/utils/validate.ts`, find the runner schemas section (`// ── Admin runner schemas`) and make these changes:

```typescript
// ── Admin runner schemas ───────────────────────────────────────────────────────

/** Shared: valid caller ID — optional + prefix then 1–20 digits */
const callerIdSchema = z.string().regex(/^\+?\d{1,20}$/, 'Caller ID must be digits, optionally prefixed with +');

/** POST /admin/runners */
export const createRunnerSchema = z.object({
  email:           z.string().email(),
  extension:       z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric'),
  pbxId:           z.string().uuid(),
  allowedDeptIds:  z.array(z.string()).default([]),
  outboundCallerId: callerIdSchema.optional(),
  deptCallerIds:   z.record(z.string(), callerIdSchema).optional(),
});

/** PUT /admin/runners/:id */
export const updateRunnerSchema = z.object({
  email:           z.string().email().optional(),
  extension:       z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric').optional(),
  allowedDeptIds:  z.array(z.string()).optional(),
  isActive:        z.boolean().optional(),
  outboundCallerId: callerIdSchema.optional(),
  deptCallerIds:   z.record(z.string(), callerIdSchema).optional(),
});
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/utils/validate.ts
git commit -m "feat(api): add outboundCallerId + deptCallerIds to runner Zod schemas"
```

---

### Task 3: Persist new fields in runner routes (GET + POST + PUT)

**Files:**
- Modify: `api/src/routes/admin/runners.ts`

- [ ] **Step 1: Add new fields to the GET select list**

In the `GET /admin/runners` handler, the `.select({...})` block (around line 63) currently enumerates columns. Add the two new columns:

```typescript
const rows = await db
  .select({
    id:               runners.id,
    entraEmail:       runners.entraEmail,
    extensionNumber:  runners.extensionNumber,
    allowedDeptIds:   runners.allowedDeptIds,
    outboundCallerId: runners.outboundCallerId,   // ← add
    deptCallerIds:    runners.deptCallerIds,       // ← add
    isActive:         runners.isActive,
    pbxFqdn:          pbxCredentials.pbxFqdn,
    pbxName:          pbxCredentials.pbxName,
    pbxCredentialId:  runners.pbxCredentialId,
    createdAt:        runners.createdAt,
  })
  ...
```

- [ ] **Step 2: Add new fields to the POST insert**

In the `POST /admin/runners` handler, destructure the new fields from the parsed body:

```typescript
const { email, extension, pbxId, allowedDeptIds, outboundCallerId, deptCallerIds } = parseResult.data;
```

Then add them to the `.insert().values({...})` call:

```typescript
const created = await db
  .insert(runners)
  .values({
    tenantId,
    pbxCredentialId:  pbxId,
    entraEmail:       email,
    extensionNumber:  extension,
    allowedDeptIds,
    outboundCallerId: outboundCallerId ?? null,   // ← add
    deptCallerIds:    deptCallerIds ?? null,       // ← add
    isActive:         true,
    createdBy:        session.email,
    userId,
  })
  .returning();
```

- [ ] **Step 3: Add new fields to the PUT setValues block**

In the `PUT /admin/runners/:id` handler, after the existing `if (updates.isActive !== undefined)` line (~line 205), add:

```typescript
if (updates.outboundCallerId !== undefined) setValues.outboundCallerId = updates.outboundCallerId;
if (updates.deptCallerIds    !== undefined) setValues.deptCallerIds    = updates.deptCallerIds as Record<string, string>;
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/admin/runners.ts
git commit -m "feat(api): persist and return outboundCallerId + deptCallerIds in runner routes"
```

---

### Task 4: Extend xAPI client — patchUserGroup with optional caller ID

**Files:**
- Modify: `api/src/xapi/client.ts` (patchUserGroup method, ~line 221)
- Modify: `api/tests/xapi/client.test.ts` (patchUserGroup describe block, ~line 123)

- [ ] **Step 1: Write the two new failing tests**

In `api/tests/xapi/client.test.ts`, inside the `describe('patchUserGroup', ...)` block, add after the existing test:

```typescript
it('includes OutboundCallerID in the body when provided', async () => {
  nock(`https://${TEST_FQDN}`)
    .patch('/xapi/v1/Users(42)', {
      Groups: [{ GroupId: 35, Rights: { RoleName: 'users' } }],
      Id: 42,
      OutboundCallerID: '+49111222333',
    })
    .reply(204);

  const client = makeClient();
  await expect(client.patchUserGroup(42, 35, '+49111222333')).resolves.toBeUndefined();
  expect(nock.isDone()).toBe(true);
});

it('omits OutboundCallerID from the body when null is passed', async () => {
  nock(`https://${TEST_FQDN}`)
    .patch('/xapi/v1/Users(42)', {
      Groups: [{ GroupId: 35, Rights: { RoleName: 'users' } }],
      Id: 42,
      // OutboundCallerID must NOT be present
    })
    .reply(204);

  const client = makeClient();
  await expect(client.patchUserGroup(42, 35, null)).resolves.toBeUndefined();
  expect(nock.isDone()).toBe(true);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: the two new tests FAIL (signature mismatch or body mismatch).

- [ ] **Step 3: Update patchUserGroup implementation**

In `api/src/xapi/client.ts`, replace the `patchUserGroup` method body:

```typescript
async patchUserGroup(
  userId: number,
  targetGroupId: number,
  outboundCallerId?: string | null,
): Promise<void> {
  await this.patch(`/Users(${userId})`, {
    Groups: [{ GroupId: targetGroupId, Rights: { RoleName: 'users' } }],
    Id:     userId,
    ...(outboundCallerId ? { OutboundCallerID: outboundCallerId } : {}),
  });
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: all tests in `client.test.ts` PASS (including the original test that has no caller ID).

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/xapi/client.ts tests/xapi/client.test.ts
git commit -m "feat(api): patchUserGroup accepts optional OutboundCallerID; add tests"
```

---

### Task 5: Resolve caller ID in switch route

**Files:**
- Modify: `api/src/routes/switch.ts` (after runner load, ~line 62)

- [ ] **Step 1: Add caller ID resolution after loading runner from DB**

In `api/src/routes/switch.ts`, after `const runner = runnerRows[0];` (line 62) and before the `allowedDeptIds` check (line 65), add:

```typescript
// Resolve caller ID: dept override → runner default → null (3CX keeps existing)
const callerIdOverride =
  (runner.deptCallerIds as Record<string, string> | null)?.[String(targetDeptId)] ??
  runner.outboundCallerId ??
  null;
```

Then, on the `patchUserGroup` call (~line 128), pass the resolved value:

```typescript
await xapiClient.patchUserGroup(userId, targetDeptId, callerIdOverride);
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Run full test suite**

```bash
cd C:/Projects/dm/dm-auto/api && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/switch.ts
git commit -m "feat(api): apply outbound caller ID in switch route (dept override → runner default)"
```

---

## Chunk 2: PWA — RunnerModal redesign

### Task 6: Extend RunnerModal with caller ID fields

**Files:**
- Modify: `pwa/components/admin/RunnerModal.tsx` (full file replacement)

**Context:** The current modal (268 lines) already has a PBX user picker (live-fetches extensions from the PBX on PBX change — added in a previous session). This replacement **keeps** the picker and adds the caller ID functionality on top. Key changes vs current file:
- `RunnerForm` gains `outboundCallerId: string` and `deptCallerIds: Record<string, string>`
- `RunnerData` gains `outboundCallerId?: string | null` and `deptCallerIds?: Record<string, string> | null`
- Pre-fill effect populates both new fields in edit mode
- New `sanitizeCallerId` helper and `isValidCallerId` regex
- `handleSubmit` validates and strips empty caller IDs before calling `onSave`
- Department checkboxes now render an inline caller ID input when checked
- Helper `setDeptCallerId` updates the `deptCallerIds` map

- [ ] **Step 1: Replace the full RunnerModal.tsx**

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PBXCredential } from '@/types/auth';
import { adminGet } from '@/lib/adminApi';

// ── Caller ID helpers ─────────────────────────────────────────────────────────

/** Strips any character that is not + or a digit; + is only kept at index 0. */
function sanitizeCallerId(raw: string): string {
  const first = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/\D/g, '');
  return first + digits;
}

const CALLER_ID_REGEX = /^\+?\d{1,20}$/;

function isValidCallerId(v: string): boolean {
  return v === '' || CALLER_ID_REGEX.test(v);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PbxExtension {
  extensionNumber: string;
  email: string | null;
  displayName: string | null;
  currentGroupName: string | null;
}

interface RunnerForm {
  email: string;
  extension: string;
  pbxId: string;
  allowedDeptIds: number[];
  outboundCallerId: string;
  deptCallerIds: Record<string, string>;
}

interface RunnerData {
  id: string;
  entraEmail: string;
  extensionNumber: string;
  pbxFqdn: string;
  pbxCredentialId?: string;
  allowedDeptIds: number[];
  outboundCallerId?: string | null;
  deptCallerIds?: Record<string, string> | null;
  isActive: boolean;
}

interface Department {
  id: number;
  name: string;
}

interface RunnerModalProps {
  runner?: RunnerData | null;
  pbxList: PBXCredential[];
  departments: Department[];
  onSave: (data: RunnerForm) => Promise<void>;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RunnerModal({ runner, pbxList, departments, onSave, onClose }: RunnerModalProps) {
  const [form, setForm] = useState<RunnerForm>({
    email: '',
    extension: '',
    pbxId: pbxList[0]?.id ?? '',
    allowedDeptIds: [],
    outboundCallerId: '',
    deptCallerIds: {},
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PBX extension picker state (add mode only)
  const [extensions, setExtensions] = useState<PbxExtension[]>([]);
  const [extSearch, setExtSearch] = useState('');
  const [extLoading, setExtLoading] = useState(false);

  // Pre-fill in edit mode
  useEffect(() => {
    if (runner) {
      setForm({
        email:            runner.entraEmail,
        extension:        runner.extensionNumber,
        pbxId:            runner.pbxCredentialId ?? pbxList.find((p) => p.pbxFqdn === runner.pbxFqdn)?.id ?? '',
        allowedDeptIds:   runner.allowedDeptIds,
        outboundCallerId: runner.outboundCallerId ?? '',
        deptCallerIds:    runner.deptCallerIds ?? {},
      });
    }
  }, [runner, pbxList]);

  // Live-fetch PBX users whenever the selected PBX changes (add mode only)
  useEffect(() => {
    if (runner || !form.pbxId) return;
    let cancelled = false;
    setExtLoading(true);
    setExtensions([]);
    setExtSearch('');
    adminGet<{ users: PbxExtension[] }>(`/admin/pbx/${form.pbxId}/users`)
      .then(data => { if (!cancelled) setExtensions(data.users); })
      .catch(() => { /* silently fail — user can still type manually */ })
      .finally(() => { if (!cancelled) setExtLoading(false); });
    return () => { cancelled = true; };
  }, [form.pbxId, runner]);

  const filteredExtensions = useMemo(() => {
    if (!extSearch.trim()) return extensions;
    const q = extSearch.toLowerCase();
    return extensions.filter(e =>
      e.extensionNumber.includes(q) ||
      e.displayName?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q),
    );
  }, [extensions, extSearch]);

  function pickExtension(ext: PbxExtension) {
    setForm(prev => ({
      ...prev,
      email: ext.email ?? prev.email,
      extension: ext.extensionNumber,
    }));
    setExtSearch('');
  }

  function toggleDept(id: number) {
    setForm((prev) => ({
      ...prev,
      allowedDeptIds: prev.allowedDeptIds.includes(id)
        ? prev.allowedDeptIds.filter((d) => d !== id)
        : [...prev.allowedDeptIds, id],
    }));
  }

  function setDeptCallerId(deptId: number, value: string) {
    const sanitized = sanitizeCallerId(value);
    setForm((prev) => ({
      ...prev,
      deptCallerIds: { ...prev.deptCallerIds, [String(deptId)]: sanitized },
    }));
  }

  function validate(): string | null {
    if (form.outboundCallerId && !isValidCallerId(form.outboundCallerId)) {
      return 'Default Caller ID must be digits, optionally starting with +';
    }
    for (const [deptId, callerId] of Object.entries(form.deptCallerIds)) {
      if (callerId && !isValidCallerId(callerId)) {
        const dept = departments.find((d) => String(d.id) === deptId);
        return `Caller ID for "${dept?.name ?? deptId}" must be digits, optionally starting with +`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError(null);

    // Strip empty-string values before sending to API
    const payload: RunnerForm = {
      ...form,
      outboundCallerId: form.outboundCallerId.trim(),
      deptCallerIds: Object.fromEntries(
        Object.entries(form.deptCallerIds).filter(([, v]) => v.trim() !== ''),
      ),
    };

    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const checkedDepts = useMemo(
    () => departments.filter((d) => form.allowedDeptIds.includes(d.id)),
    [departments, form.allowedDeptIds],
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {runner ? 'Edit Runner' : 'Add Runner'}
        </h2>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* PBX — first, drives the extension list */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PBX</label>
            <select
              value={form.pbxId}
              onChange={(e) => setForm({ ...form, pbxId: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {pbxList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pbxName} ({p.pbxFqdn})
                </option>
              ))}
            </select>
          </div>

          {/* Extension picker (add mode only) */}
          {!runner && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pick from PBX users
                <span className="ml-1 text-xs font-normal text-gray-400">— or fill in manually below</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={extSearch}
                  onChange={e => setExtSearch(e.target.value)}
                  placeholder={
                    extLoading
                      ? 'Fetching users from PBX…'
                      : extensions.length === 0
                        ? 'PBX unavailable — fill in manually below'
                        : `Search from ${extensions.length} users…`
                  }
                  disabled={extLoading}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                {extLoading && (
                  <svg className="absolute right-3 top-2.5 animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
              </div>
              {extSearch && filteredExtensions.length > 0 && (
                <ul className="mt-1 border border-gray-200 rounded-md max-h-44 overflow-y-auto bg-white shadow-sm">
                  {filteredExtensions.slice(0, 50).map(ext => (
                    <li key={ext.extensionNumber}>
                      <button
                        type="button"
                        onClick={() => pickExtension(ext)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span>
                          <span className="font-medium">{ext.displayName ?? ext.email ?? ext.extensionNumber}</span>
                          {ext.email && ext.displayName && (
                            <span className="ml-1 text-gray-400 text-xs">{ext.email}</span>
                          )}
                        </span>
                        <span className="text-gray-400 text-xs ml-2">ext {ext.extensionNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {extSearch && filteredExtensions.length === 0 && extensions.length > 0 && (
                <p className="mt-1 text-xs text-gray-400 px-1">No matches — fill in manually below.</p>
              )}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="runner@org.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Extension */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
            <input
              type="text"
              value={form.extension}
              onChange={(e) => setForm({ ...form, extension: e.target.value })}
              placeholder="1001"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Default Caller ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Caller ID
              <span className="ml-1 text-xs font-normal text-gray-400">— optional · + and digits only</span>
            </label>
            <input
              type="text"
              value={form.outboundCallerId}
              onChange={(e) => setForm({ ...form, outboundCallerId: sanitizeCallerId(e.target.value) })}
              placeholder="+49123456789"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Departments with inline per-dept Caller ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departments</label>
            <div className="border border-gray-300 rounded-md p-2 max-h-52 overflow-y-auto space-y-1">
              {departments.length === 0 && (
                <p className="text-xs text-gray-400">No departments available</p>
              )}
              {departments.map((dept) => {
                const checked = form.allowedDeptIds.includes(dept.id);
                return (
                  <div key={dept.id}>
                    <label className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDept(dept.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1">{dept.name}</span>
                    </label>
                    {checked && (
                      <div className="ml-6 mt-0.5 mb-1">
                        <input
                          type="text"
                          value={form.deptCallerIds[String(dept.id)] ?? ''}
                          onChange={(e) => setDeptCallerId(dept.id, e.target.value)}
                          placeholder={form.outboundCallerId || 'Caller ID (uses default if empty)'}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {checkedDepts.length > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                Per-dept caller ID overrides the default. Leave blank to use the default.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#0078D4' }}
            >
              {saving ? 'Saving...' : runner ? 'Update' : 'Add Runner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build PWA to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0. TypeScript errors here likely mean the runners page `handleSave` type needs updating (Task 7).

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/RunnerModal.tsx
git commit -m "feat(pwa): RunnerModal — add default + per-dept caller ID fields (keep PBX picker)"
```

---

### Task 7: Wire caller ID fields in the Runners admin page

**Files:**
- Modify: `pwa/app/admin/runners/page.tsx`

**Context:** The runners page (`page.tsx`) has:
- `interface Runner { ... }` (lines ~11–19) — the row shape returned by `GET /admin/runners`
- `handleSave(data: { email, extension, pbxId, allowedDeptIds })` (line ~71) — called by `RunnerModal.onSave`
- `adminPost('/admin/runners', data)` and `adminPut('/admin/runners/:id', data)` in that handler

Three changes needed:
1. `Runner` interface: add `outboundCallerId` and `deptCallerIds` so edit pre-fill works
2. `handleSave` parameter type: extend to accept the two new `RunnerForm` fields
3. `adminPost`/`adminPut` body: pass the new fields (strip empties)

- [ ] **Step 1: Add new fields to the `Runner` interface**

Find `interface Runner {` and add:
```typescript
outboundCallerId?: string | null;
deptCallerIds?: Record<string, string> | null;
```

- [ ] **Step 2: Update `handleSave` parameter type and body**

Find `async function handleSave(data: {` and update the parameter type to include the new fields:

```typescript
async function handleSave(data: {
  email: string;
  extension: string;
  pbxId: string;
  allowedDeptIds: number[];
  outboundCallerId: string;
  deptCallerIds: Record<string, string>;
}) {
```

Then in the body, add the new fields to the `adminPut` / `adminPost` call. The body object should spread `data` directly (it already contains all the right fields after Task 6's `handleSubmit` strips empties):

```typescript
// In the PUT branch:
await adminPut(`/admin/runners/${modalRunner.id}`, data);

// In the POST branch:
await adminPost('/admin/runners', data);
```

No extra spreading needed — `data` from `RunnerForm` contains exactly what the API expects (empty strings and empty objects were stripped in `handleSubmit`).

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add app/admin/runners/page.tsx
git commit -m "feat(pwa): wire outboundCallerId + deptCallerIds through runners admin page"
```

---

## Chunk 3: Deploy

### Task 8: Push and redeploy

- [ ] **Step 1: Final build check for both projects**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build && npm test
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: all exit 0, all tests pass.

- [ ] **Step 2: Push**

```bash
cd C:/Projects/dm/dm-auto && git push origin main
```

- [ ] **Step 3: Trigger Coolify redeploy (API first — runs DB migration on startup)**

```bash
curl -s -X POST -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/applications/v11gk4n5aa8jt3a7nsb7kgi5/restart"
```

Wait ~60s for the API to finish (migration runs at startup), then:

```bash
curl -s -X POST -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/applications/ks21626vpo6js88uktyqnqcj/restart"
```

- [ ] **Step 4: Verify migration ran**

Poll the API deployment status until `status: finished`:

```bash
curl -s -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/deployments/<deployment_uuid>" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status'))"
```

- [ ] **Step 5: Smoke test**

Open `runner.tcx-hub.com/admin/runners`, click "Edit" on any runner — verify:
- Modal shows PBX at top, then Email, Extension, Default Caller ID, Departments
- Checked department shows caller ID input beneath it
- Saving a runner with a caller ID returns 200 and the value persists on re-open
