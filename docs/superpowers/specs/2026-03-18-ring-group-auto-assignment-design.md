# Ring Group Auto-Assignment on Department Switch — Design Spec

## Goal

When a runner switches department, automatically remove them from all ring groups associated with their old department and add them to all ring groups associated with their new department. All other ring group members are preserved — only the specific runner's membership changes.

## Context

3CX ring groups expose their department associations via the `Groups` field on the xAPI `RingGroups` entity. This means no admin configuration is needed — the PBX already owns the dept → ring group mapping. The feature is entirely server-side and transparent to the runner.

---

## Approach

Fully PBX-driven. One GET call at switch time fetches all ring groups with their department associations and current member lists. Ring group PATCH operations run after the department switch succeeds and are non-fatal — failures are logged but never block the runner.

---

## xAPI Contract

### GET (one call per switch)

```
GET /xapi/v1/RingGroups
  ?$select=Id,Name,Number,IsRegistered,RingStrategy,ForwardNoAnswer,Groups
  &$expand=Members,Groups($select=GroupId,Name;$filter=not startsWith(Name,'___FAVORITES___');)
```

Response shape per ring group:
```json
{
  "Id": 206,
  "Name": "Ateststst",
  "Number": "802",
  "Members": [
    { "Id": 45, "Number": "101", "Name": "William Rodriguez", "Tags": [] },
    { "Id": 32, "Number": "000", "Name": "Marcos Valassas",   "Tags": [] }
  ],
  "Groups": [
    { "GroupId": 28, "Name": "System Owner" }
  ]
}
```

### PATCH (one call per affected ring group)

```
PATCH /xapi/v1/RingGroups({Id})
Content-Type: application/json

{ "Members": [ ...full updated member list... ] }
```

**Critical:** the Members array must include ALL existing members with their original `{ Id, Number, Name, Tags }` shape — only the runner is added or removed. Other members must not be modified.

To **remove** runner with extension `"000"` from a ring group whose current members are `[101, 000, 100]`:
```json
{ "Members": [{ "Id": 45, "Number": "101", "Name": "William Rodriguez", "Tags": [] },
               { "Id": 44, "Number": "100", "Name": "Test Reset",        "Tags": [] }] }
```

To **add** runner with extension `"000"` to a ring group whose current members are `[101]`:
```json
{ "Members": [{ "Id": 45, "Number": "101", "Name": "William Rodriguez", "Tags": [] },
               { "Number": "000" }] }
```
New member entry only needs `Number` — the PBX resolves `Id` and `Name` from the extension number.

---

## Switch Flow (updated)

Steps 1–3 (validate, load runner, dept PATCH) are unchanged. Ring group handling runs after the dept switch succeeds:

```
4. getRingGroups()
     → ONE GET call returning all ring groups with Groups + Members

5. toLeave = ring groups where Groups contains currentGroupId
   toJoin  = ring groups where Groups contains targetDeptId

6. actuallyLeaving = toLeave \ toJoin   (avoid touching ring groups in both sets)
   actuallyJoining = toJoin  \ toLeave

7. For each ring group in actuallyLeaving:
     if runner's extensionNumber is in Members:
       PATCH with runner removed from Members (all others preserved)
     else:
       skip (already absent — no-op)

8. For each ring group in actuallyJoining:
     if runner's extensionNumber is NOT in Members:
       PATCH with runner appended to Members (all others preserved)
     else:
       skip (already present — no-op)

9. Any PATCH failure: log { ringGroupId, error } — do NOT throw, do NOT fail the switch
```

---

## Data Model

**No DB changes.** No new tables, no new columns, no migrations.

---

## New xAPI Client Methods

### `getRingGroups(): Promise<XAPIRingGroup[]>`

```typescript
interface XAPIRingGroup {
  id:      number;
  name:    string;
  number:  string;
  groupIds: number[];   // department IDs this ring group belongs to
  members: Array<{
    id:     number;
    number: string;
    name:   string | null;
    tags:   unknown[];
  }>;
}
```

Fetches all ring groups using the confirmed GET query above. Filters out `___FAVORITES___` via the query itself.

### `updateRingGroupMembers(ringGroupId: number, members: XAPIRingGroupMember[]): Promise<void>`

```
PATCH /xapi/v1/RingGroups({ringGroupId})
Body: { Members: members }
```

Expected response: 204 No Content. Same retry + error handling pattern as `patchUserGroup`.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `getRingGroups()` fails | Log error, skip ring group handling entirely. Switch still succeeds. |
| Individual `updateRingGroupMembers()` fails | Log `{ ringGroupId, error }`. Continue processing remaining ring groups. Switch still succeeds. |
| Runner already absent from ring group to leave | Skip PATCH (no-op). |
| Runner already present in ring group to join | Skip PATCH (no-op). |
| No ring groups for target department | Remove from old dept's ring groups, join nothing. Valid state. |
| No ring groups for old department | Skip removal. Join new dept's ring groups. |
| Ring group belongs to both old and new dept | No change to that ring group (cancel out). |

---

## Files Changed

| File | Change |
|------|--------|
| `api/src/xapi/client.ts` | Add `XAPIRingGroup` interface, `getRingGroups()`, `updateRingGroupMembers()` |
| `api/src/routes/switch.ts` | Call ring group logic after `patchUserGroup` succeeds |
| `api/tests/xapi/client.test.ts` | Tests for `getRingGroups()` and `updateRingGroupMembers()` |

---

## Out of Scope

- Admin UI changes — no RunnerModal changes, no new endpoints
- DB changes — no new columns or tables
- Audit log changes — ring group membership changes are not logged separately (kept simple)
- Runner-facing changes — transparent, no UI feedback about ring group membership
