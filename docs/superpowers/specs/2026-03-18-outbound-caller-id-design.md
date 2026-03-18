# OutboundCallerID per Runner/Department — Design Spec

## Goal

Allow admins to configure an outbound caller ID per runner (default) and optionally per department (override). The correct caller ID is automatically applied to the 3CX xAPI PATCH call whenever a runner switches department. Runners do not interact with this setting.

## Context

The existing department switch flow sends a single `PATCH /xapi/v1/Users({userId})` to the 3CX PBX. This spec extends that call to optionally include `OutboundCallerID` when a value is configured. Configuration is managed by admins in the existing Runners tab — no new pages or routes are needed.

The field name `OutboundCallerID` is confirmed in the 3CX xAPI swagger spec (`scratchpad/swagger.yaml`, line ~36114) as a `string` field on the Users entity, accepted on PATCH.

---

## Data Model

Two new nullable columns added to the `runners` table via Drizzle migration:

| Column | Drizzle type | Purpose |
|--------|-------------|---------|
| `outbound_caller_id` | `text` (nullable) | Runner-level default caller ID. Applied when no department override exists. |
| `dept_caller_ids` | `jsonb` (nullable) | `Record<string, string>` — maps department ID (string) to caller ID string. Per-department override. |

**Key format note:** `deptCallerIds` keys must be string-coerced department IDs (e.g. `"123"`), matching the format used in `allowedDeptIds`. The resolution logic uses `String(targetDeptId)` consistently.

**Resolution order at switch time:**
1. `deptCallerIds[String(targetDeptId)]` — department-specific override
2. `outboundCallerId` — runner default
3. `null` — send nothing; 3CX retains whatever value it already has

**Orphaned entries:** If `deptCallerIds` contains a key for a dept no longer in `allowedDeptIds`, it is harmless — the switch route enforces `allowedDeptIds` at step 3, so the orphaned caller ID is never reachable. No cleanup is required on save.

---

## Validation

Single regex applied both server-side (Zod) and client-side (onChange strip + submit check):

```
/^\+?\d{1,20}$/
```

- Optional `+` prefix (required by some carriers)
- 1–20 digits
- Absence of the field (omitted or `undefined`) means "not configured" — the field should be omitted from the request entirely when cleared, not sent as `""`

**Zod definition (allows omission but rejects empty string):**
```typescript
z.string().regex(/^\+?\d{1,20}$/).optional()
```

**PWA behaviour:** when the user clears the caller ID input, the field is excluded from the request body on submit (not sent as `""`).

---

## API Changes

### `api/src/utils/validate.ts`

`createRunnerSchema` and `updateRunnerSchema` gain two optional fields:

```typescript
outboundCallerId: z.string().regex(/^\+?\d{1,20}$/).optional(),
deptCallerIds: z.record(z.string(), z.string().regex(/^\+?\d{1,20}$/)).optional(),
```

### `api/src/routes/admin/runners.ts`

**POST** — the `insert().values({...})` call includes the two new fields when present.

**PUT** — the `setValues` object (built with explicit `if (updates.X !== undefined)` guards) needs two additional clauses:

```typescript
if (updates.outboundCallerId !== undefined) setValues.outboundCallerId = updates.outboundCallerId;
if (updates.deptCallerIds    !== undefined) setValues.deptCallerIds    = updates.deptCallerIds;
```

**GET** — the explicit `.select({...})` column list must include the two new columns so edit pre-fill works:

```typescript
outboundCallerId: runners.outboundCallerId,
deptCallerIds:    runners.deptCallerIds,
```

### `api/src/routes/switch.ts`

After loading the runner from DB, resolve the caller ID before calling the xAPI:

```typescript
const callerId =
  (runner.deptCallerIds as Record<string, string> | null)?.[String(targetDeptId)] ??
  runner.outboundCallerId ??
  null;

await xapiClient.patchUserGroup(userId, targetDeptId, callerId);
```

No change to the request body schema — runner still sends only `targetDeptId`.

---

## xAPI Client Change

### `api/src/xapi/client.ts` — `patchUserGroup`

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

`OutboundCallerID` is omitted entirely when the value is `null`, `undefined`, or empty — preserving existing 3CX behaviour for runners with no caller ID configured. The existing 3CX v18 PUT fallback carries the same body object, so `OutboundCallerID` is included there too when set.

**Unit test note:** The existing `patchUserGroup` unit test in `client.test.ts` asserts on the exact request body. It needs a new test case for the caller-ID-present path, and the existing test case must verify the field is absent when not provided.

---

## Database Migration

```sql
ALTER TABLE runners ADD COLUMN outbound_caller_id text;
ALTER TABLE runners ADD COLUMN dept_caller_ids jsonb;
```

Generated via `drizzle-kit generate` and applied by the existing migration runner at startup.

---

## PWA Changes

### `api/src/db/schema.ts`

```typescript
outboundCallerId: text('outbound_caller_id'),
deptCallerIds:    jsonb('dept_caller_ids').$type<Record<string, string>>(),
```

### `pwa/components/admin/RunnerModal.tsx` — Redesigned layout

`RunnerForm` type gains:
```typescript
outboundCallerId: string         // empty string = not configured
deptCallerIds: Record<string, string>  // deptId → callerID; absent key = not configured
```

**Submission rule:** before calling the API, strip empty-string values:
- if `outboundCallerId === ''`, omit the field from the request body
- remove any `deptCallerIds` entries where the value is `''`

**New modal layout (add and edit mode):**

```
PBX               [dropdown            ]

Default Caller ID [+49...              ]
                  Optional · + and digits only

Departments
  [✓] Innendienst    Caller ID [+49111...]
  [✓] Schollmeier    Caller ID [        ]  ← empty = use runner default
  [ ] Extern Christopher
  [ ] testdepartment

[Cancel]  [Add Runner / Update]
```

**Behaviour rules:**
- Caller ID input only renders next to **checked** departments; unchecked rows are unaffected
- `onChange` strips any character that is not `+` or a digit; `+` is only accepted as the first character (replace `/[^\d]/g` on chars after position 0, replace `/[^+\d]/g` on full string then ensure `+` only at index 0)
- On submit: each non-empty caller ID validated against `/^\+?\d{1,20}$/`; inline error shown on first failure; submission blocked
- On PBX change: dept caller ID inputs reset (dept list reloads)
- Edit mode: `outboundCallerId` and all `deptCallerIds` entries pre-filled from existing runner data returned by `GET /admin/runners`

### API call

The existing `POST /admin/runners` and `PUT /admin/runners/:id` calls pass `outboundCallerId` and `deptCallerIds` in the request body, with empty values stripped as described above.

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
| `api/src/db/migrations/` | New migration file (generated by drizzle-kit) |
| `api/src/utils/validate.ts` | Extend `createRunnerSchema` and `updateRunnerSchema` |
| `api/src/routes/admin/runners.ts` | Persist new fields in POST + PUT; return them in GET select list |
| `api/src/routes/switch.ts` | Resolve caller ID and pass to `patchUserGroup` |
| `api/src/xapi/client.ts` | Extend `patchUserGroup` signature and body; update unit test |
| `pwa/components/admin/RunnerModal.tsx` | Redesign with caller ID fields; strip empties before submit |
