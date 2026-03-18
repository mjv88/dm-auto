# Per-Department Ring Group Configuration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to explicitly choose which ring groups a runner is in for each department; the stored config overrides PBX-auto on switch, with backward-compatible fallback.

**Architecture:** New `dept_ring_groups jsonb` column on `runners` stores `Record<deptId, ringGroupId[]>`. Switch route prefers stored config over PBX-auto when present. RunnerModal gains per-dept ring group selectors: pre-populated from PBX on first check, removable badges + dropdown for admin control.

**Tech Stack:** Fastify 4, Drizzle ORM, Zod, Next.js 14 App Router, Tailwind CSS

---

## Chunk 1: API — schema, validation, routes, switch

### Task 1: Add dept_ring_groups column to schema + migration

**Files:**
- Modify: `api/src/db/schema.ts`
- Generate: `api/src/db/migrations/` (new file)

- [ ] **Step 1: Add column to runners table in schema.ts**

In `api/src/db/schema.ts`, inside the `runners` pgTable definition, add after the `deptCallerIds` line:

```typescript
deptRingGroups: jsonb('dept_ring_groups').$type<Record<string, number[]>>(),
```

(`jsonb` is already imported from Step 1 of the OutboundCallerID feature.)

- [ ] **Step 2: Generate migration**

```bash
cd C:/Projects/dm/dm-auto/api && npx drizzle-kit generate
```

New `.sql` file should contain:
```sql
ALTER TABLE "runners" ADD COLUMN "dept_ring_groups" jsonb;
```

- [ ] **Step 3: Build**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(api): add dept_ring_groups column to runners table"
```

---

### Task 2: Extend Zod runner schemas

**Files:**
- Modify: `api/src/utils/validate.ts`

- [ ] **Step 1: Add deptRingGroups to both runner schemas**

In `api/src/utils/validate.ts`, in the `createRunnerSchema` and `updateRunnerSchema` objects, add after the existing `deptCallerIds` line in each:

```typescript
deptRingGroups: z.record(z.string(), z.array(z.number().int().positive())).optional(),
```

- [ ] **Step 2: Build**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/utils/validate.ts
git commit -m "feat(api): add deptRingGroups to runner Zod schemas"
```

---

### Task 3: Persist and return deptRingGroups in runner routes

**Files:**
- Modify: `api/src/routes/admin/runners.ts`

Three changes — same pattern as `deptCallerIds` which was added earlier:

- [ ] **Step 1: Add deptRingGroups to the GET select list**

In the `.select({...})` block of `GET /admin/runners` (~line 63), add:
```typescript
deptRingGroups: runners.deptRingGroups,
```

- [ ] **Step 2: Add deptRingGroups to the POST insert**

In `POST /admin/runners`, extend the destructure:
```typescript
const { email, extension, pbxId, allowedDeptIds, outboundCallerId, deptCallerIds, deptRingGroups } = parseResult.data;
```

Add to `.insert().values({...})`:
```typescript
deptRingGroups: deptRingGroups ?? null,
```

- [ ] **Step 3: Add deptRingGroups to the PUT setValues**

After the existing `deptCallerIds` if-guard, add:
```typescript
if (updates.deptRingGroups !== undefined) setValues.deptRingGroups = updates.deptRingGroups as Record<string, number[]>;
```

- [ ] **Step 4: Build**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/admin/runners.ts
git commit -m "feat(api): persist and return deptRingGroups in runner routes"
```

---

### Task 4: Use stored ring group config in switch route

**Files:**
- Modify: `api/src/routes/switch.ts`

**Context:** The ring group block (step 9) currently computes `toLeave`/`toJoin` purely from PBX data. This task makes it prefer `runner.deptRingGroups` when available.

`runner` is already in scope from the DB query at the top of the route handler. `currentGroupId` and `targetDeptId` are also in scope.

- [ ] **Step 1: Replace the toLeave/toJoin lines in the ring group block**

Find the ring group block (~line 156). Replace:

```typescript
        // Ring groups for old dept and new dept
        const toLeave = ringGroups.filter(rg => rg.groupIds.includes(currentGroupId));
        const toJoin  = ringGroups.filter(rg => rg.groupIds.includes(targetDeptId));
```

With:

```typescript
        // Ring groups for old dept and new dept.
        // Prefer admin-stored config; fall back to PBX-auto.
        const storedConfig = runner.deptRingGroups as Record<string, number[]> | null;

        // Keys in storedConfig are String(deptId) — same representation as
        // String(targetDeptId) and String(currentGroupId) since both are numeric
        // integer dept/group IDs from the PBX (e.g. "33", "28").
        const targetKey  = String(targetDeptId);
        const currentKey = String(currentGroupId);

        const toJoin = storedConfig?.[targetKey] !== undefined
          ? ringGroups.filter(rg => storedConfig![targetKey].includes(rg.id))
          : ringGroups.filter(rg => rg.groupIds.includes(targetDeptId));

        const toLeave = storedConfig?.[currentKey] !== undefined
          ? ringGroups.filter(rg => storedConfig![currentKey].includes(rg.id))
          : ringGroups.filter(rg => rg.groupIds.includes(currentGroupId));
```

The rest of the ring group block (set-difference, actuallyLeaving/Joining, PATCH calls) is unchanged.

- [ ] **Step 2: Build**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Run tests**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=switch
```

Expected: all 18 tests pass (new code is in the non-fatal ring group try/catch, so existing tests are unaffected).

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/switch.ts
git commit -m "feat(api): use stored deptRingGroups config on switch, fall back to PBX-auto"
```

---

## Chunk 2: PWA — RunnerModal ring group selector

### Task 5: Add deptRingGroups to RunnerForm + state + pre-population

**Files:**
- Modify: `pwa/components/admin/RunnerModal.tsx`

This task adds the data layer — no new UI yet, just wiring state correctly.

- [ ] **Step 1: Add deptRingGroups to RunnerForm and RunnerData interfaces**

In `RunnerForm`:
```typescript
deptRingGroups: Record<string, number[]>;
```

In `RunnerData`:
```typescript
deptRingGroups?: Record<string, number[]> | null;
```

- [ ] **Step 2: Add deptRingGroups to initial form state**

```typescript
const [form, setForm] = useState<RunnerForm>({
  email: '',
  extension: '',
  pbxId: pbxList[0]?.id ?? '',
  allowedDeptIds: [],
  outboundCallerId: '',
  deptCallerIds: {},
  deptRingGroups: {},    // ← add
});
```

- [ ] **Step 3: Add deptRingGroups to edit pre-fill effect**

In the `useEffect` that runs when `runner` changes:
```typescript
deptRingGroups: runner.deptRingGroups ?? {},
```

- [ ] **Step 4: Auto-populate when a dept is first checked**

Replace the existing `toggleDept` function:

```typescript
function toggleDept(id: number) {
  setForm((prev) => {
    const nowChecked = !prev.allowedDeptIds.includes(id);
    const newAllowed = nowChecked
      ? [...prev.allowedDeptIds, id]
      : prev.allowedDeptIds.filter((d) => d !== id);

    // When checking a dept for the first time (no stored config), pre-populate
    // with the PBX-driven ring groups for that dept
    let newDeptRingGroups = prev.deptRingGroups;
    if (nowChecked && prev.deptRingGroups[String(id)] === undefined) {
      const pbxDriven = pbxRingGroups
        .filter(rg => rg.groupIds.includes(id))
        .map(rg => rg.id);
      newDeptRingGroups = { ...prev.deptRingGroups, [String(id)]: pbxDriven };
    }

    return { ...prev, allowedDeptIds: newAllowed, deptRingGroups: newDeptRingGroups };
  });
}
```

- [ ] **Step 5: Add helpers for adding/removing ring groups per dept**

After `toggleDept`:

```typescript
function addRingGroupToDept(deptId: number, ringGroupId: number) {
  setForm(prev => ({
    ...prev,
    deptRingGroups: {
      ...prev.deptRingGroups,
      [String(deptId)]: [...(prev.deptRingGroups[String(deptId)] ?? []), ringGroupId],
    },
  }));
}

function removeRingGroupFromDept(deptId: number, ringGroupId: number) {
  setForm(prev => ({
    ...prev,
    deptRingGroups: {
      ...prev.deptRingGroups,
      [String(deptId)]: (prev.deptRingGroups[String(deptId)] ?? []).filter(id => id !== ringGroupId),
    },
  }));
}
```

- [ ] **Step 6: Include deptRingGroups in handleSubmit payload**

In `handleSubmit`, the payload spread already includes all form fields. Just ensure empty arrays are not stripped (unlike caller IDs, ring group arrays can legitimately be empty — meaning "no ring groups for this dept"):

```typescript
const payload: RunnerForm = {
  ...form,
  outboundCallerId: form.outboundCallerId.trim(),
  deptCallerIds: Object.fromEntries(
    Object.entries(form.deptCallerIds).filter(([, v]) => v.trim() !== ''),
  ),
  // Keep deptRingGroups as-is. Note: unchecking a dept does NOT wipe its entry
  // from deptRingGroups — this is intentional so the config is preserved if
  // the admin re-checks the dept later. On switch, only the targetDept and
  // currentGroupId keys are ever read, so orphaned entries are harmless.
  deptRingGroups: form.deptRingGroups,
};
```

- [ ] **Step 7: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0. If TypeScript flags `handleSave` in `page.tsx`, do NOT fix it here — Task 7 owns that file.

- [ ] **Step 8: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/RunnerModal.tsx
git commit -m "feat(pwa): deptRingGroups state, pre-population, and form wiring in RunnerModal"
```

---

### Task 6: Per-dept ring group selector UI

**Files:**
- Modify: `pwa/components/admin/RunnerModal.tsx` (dept row section only)

This task replaces the current read-only badge display with an interactive ring group selector. The dept row now shows: selected ring groups as removable badges + a `+ Add` dropdown for the rest.

- [ ] **Step 1: Replace the ring group display block per checked department**

Find and replace the existing `{checked && pbxRingGroups.length > 0 && (() => { ... })()}` block with:

```tsx
{checked && (
  <div className="ml-5 mb-1 flex flex-wrap gap-1 items-center">
    {/* Selected ring groups — removable */}
    {(form.deptRingGroups[String(dept.id)] ?? []).map(rgId => {
      const rg = pbxRingGroups.find(r => r.id === rgId);
      if (!rg) return null;
      return (
        <span
          key={rgId}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200"
        >
          {rg.name}
          <button
            type="button"
            onClick={() => removeRingGroupFromDept(dept.id, rgId)}
            className="hover:text-blue-900 leading-none"
          >
            ×
          </button>
        </span>
      );
    })}

    {/* Add ring group dropdown */}
    {(() => {
      const selected = form.deptRingGroups[String(dept.id)] ?? [];
      const available = pbxRingGroups.filter(rg => !selected.includes(rg.id));
      if (available.length === 0) return null;
      return (
        <select
          value=""
          onChange={e => {
            const id = Number(e.target.value);
            if (id) addRingGroupToDept(dept.id, id);
          }}
          className="text-xs border border-dashed border-blue-300 rounded px-1.5 py-0.5 text-blue-500 bg-white focus:outline-none cursor-pointer"
        >
          <option value="">+ Add ring group</option>
          {available.map(rg => (
            <option key={rg.id} value={rg.id}>{rg.name}</option>
          ))}
        </select>
      );
    })()}

    {/* Show message if no ring groups loaded yet */}
    {pbxRingGroups.length === 0 && (
      <span className="text-xs text-gray-300 italic">Loading ring groups…</span>
    )}
  </div>
)}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add components/admin/RunnerModal.tsx
git commit -m "feat(pwa): per-dept ring group selector with removable badges and add dropdown"
```

---

### Task 7: Wire deptRingGroups through runners admin page

**Files:**
- Modify: `pwa/app/admin/runners/page.tsx`

- [ ] **Step 1: Add deptRingGroups to Runner interface**

```typescript
deptRingGroups?: Record<string, number[]> | null;
```

- [ ] **Step 2: Add deptRingGroups to handleSave parameter type**

```typescript
deptRingGroups: Record<string, number[]>;
```

- [ ] **Step 3: Pass deptRingGroups in apiBody**

In the `apiBody` construction, `deptRingGroups` from `data` is already included via spread (`...data`). No extra work needed since `data` is typed as `RunnerForm` which now includes it. Verify the spread covers it.

- [ ] **Step 4: Build**

```bash
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/dm/dm-auto/pwa
git add app/admin/runners/page.tsx
git commit -m "feat(pwa): wire deptRingGroups through runners admin page"
```

---

## Chunk 3: Deploy

### Task 8: Push and redeploy

- [ ] **Step 1: Final build + test**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build && npm test -- --testPathPattern=switch
cd C:/Projects/dm/dm-auto/pwa && npm run build
```

Expected: all exit 0, 18 switch tests pass.

- [ ] **Step 2: Push**

```bash
cd C:/Projects/dm/dm-auto && git push origin main
```

- [ ] **Step 3: Redeploy API first (runs migration)**

```bash
curl -s -X POST -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/applications/v11gk4n5aa8jt3a7nsb7kgi5/restart"
```

Wait ~90s for migration, then redeploy PWA:

```bash
curl -s -X POST -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/applications/ks21626vpo6js88uktyqnqcj/restart"
```

- [ ] **Step 4: Smoke test**

Open RunnerModal for any runner:
1. Check a department → ring groups pre-populated from PBX (blue badges)
2. Click `+ Add ring group` → dropdown shows non-selected ring groups
3. Select one → badge added
4. Click `×` on a badge → removed
5. Save and re-open → selections persisted
6. Switch departments in the runner app → verify ring group assignments match stored config
