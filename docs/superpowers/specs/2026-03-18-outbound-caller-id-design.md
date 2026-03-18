# OutboundCallerID per Runner/Department — Design Spec

## Goal

Allow admins to configure an outbound caller ID per runner (default) and optionally per department (override). The correct caller ID is automatically applied to the 3CX xAPI PATCH call whenever a runner switches department. Runners do not interact with this setting.

## Context

The existing department switch flow sends a single `PATCH /xapi/v1/Users({userId})` to the 3CX PBX. This spec extends that call to optionally include `OutboundCallerID` when a value is configured. Configuration is managed by admins in the existing Runners tab — no new pages or routes are needed.

---

## Data Model

Two new nullable columns added to the `runners` table via Drizzle migration:

| Column | Drizzle type | Purpose |
|--------|-------------|---------|
| `outbound_caller_id` | `text` (nullable) | Runner-level default caller ID. Applied when no department override exists. |
| `dept_caller_ids` | `jsonb` (nullable) | `Record<string, string>` — maps department ID (string) to caller ID string. Per-department override. |

**Resolution order at switch time:**
1. `deptCallerIds[String(targetDeptId)]` — department-specific override
2. `outboundCallerId` — runner default
3. `null` — send nothing; 3CX retains whatever value it already has

---

## Validation

Single regex applied both server-side (Zod) and client-side (onChange strip + submit check):

```
/^\+?\d{1,20}$/
```

- Optional `+` prefix (required by some carriers)
- 1–20 digits
- Empty string is valid (means "not configured")

---

## API Changes

### `src/utils/validate.ts`

`createRunnerSchema` and `updateRunnerSchema` gain two optional fields:

```typescript
outboundCallerId: z.string().regex(/^\+?\d{1,20}$/).optional(),
deptCallerIds: z.record(z.string(), z.string().regex(/^\+?\d{1,20}$/)).optional(),
```

### `src/routes/admin/runners.ts`

`POST /admin/runners` and `PUT /admin/runners/:id` persist the two new fields when provided.

### `src/routes/switch.ts`

After loading the runner from DB, resolve the caller ID before calling the xAPI:

```typescript
const callerId =
  runner.deptCallerIds?.[String(targetDeptId)] ??
  runner.outboundCallerId ??
  null;

await xapiClient.patchUserGroup(userId, targetDeptId, callerId);
```

No change to the request body schema — runner still sends only `targetDeptId`.

---

## xAPI Client Change

### `src/xapi/client.ts` — `patchUserGroup`

Signature extended with optional third parameter:

```typescript
async patchUserGroup(
  userId: number,
  targetGroupId: number,
  outboundCallerId?: string | null,
): Promise<void> {
  await this.patch(`/Users(${userId})`, {
    Groups: [{ GroupId: targetGroupId, Rights: { RoleName: 'users' } }],
    Id: userId,
    ...(outboundCallerId ? { OutboundCallerID: outboundCallerId } : {}),
  });
}
```

The `OutboundCallerID` field is omitted entirely when no value is configured, preserving existing 3CX behaviour.

---

## Database Migration

```sql
ALTER TABLE runners ADD COLUMN outbound_caller_id text;
ALTER TABLE runners ADD COLUMN dept_caller_ids jsonb;
```

Generated and applied via `drizzle-kit generate` + the existing migration runner.

---

## PWA Changes

### `src/db/schema.ts`

```typescript
outboundCallerId: text('outbound_caller_id'),
deptCallerIds:    jsonb('dept_caller_ids').$type<Record<string, string>>(),
```

### `pwa/components/admin/RunnerModal.tsx` — Redesigned layout

`RunnerForm` type gains:
```typescript
outboundCallerId: string
deptCallerIds: Record<string, string>
```

**New modal layout (add and edit mode):**

```
PBX               [dropdown            ]

Default Caller ID [+49...              ]
                  Optional · digits and + only

Departments
  [✓] Innendienst    Caller ID [+49111...]
  [✓] Schollmeier    Caller ID [        ]  ← empty = use default
  [ ] Extern Christopher
  [ ] testdepartment

[Cancel]  [Add Runner / Update]
```

**Behaviour rules:**
- Caller ID input only renders next to **checked** departments; unchecked rows are unaffected
- `onChange` strips any character that is not `+` or a digit; `+` is only accepted as the first character
- On submit: each non-empty caller ID validated against regex; inline error shown on failure
- On PBX change: dept caller ID inputs reset (dept list reloads)
- Edit mode: `outboundCallerId` and all `deptCallerIds` entries pre-filled from existing runner data

### `pwa/lib/adminApi.ts` (or runner page)

The existing `POST /admin/runners` and `PUT /admin/runners/:id` calls extended to include `outboundCallerId` and `deptCallerIds` in the request body.

---

## Out of Scope

- Runner-facing UI change — the departments page is unchanged; caller ID is applied silently
- Audit log change — caller ID is an implementation detail of the xAPI call, not logged separately
- Validation that the caller ID is reachable/valid with the carrier — treated as free-form config

---

## Files Changed

| File | Change |
|------|--------|
| `api/src/db/schema.ts` | Add `outboundCallerId`, `deptCallerIds` to runners table |
| `api/src/db/migrations/` | New migration file (generated) |
| `api/src/utils/validate.ts` | Extend runner schemas |
| `api/src/routes/admin/runners.ts` | Persist new fields |
| `api/src/routes/switch.ts` | Resolve and pass caller ID |
| `api/src/xapi/client.ts` | Extend `patchUserGroup` signature and body |
| `pwa/components/admin/RunnerModal.tsx` | Redesign with caller ID fields |
