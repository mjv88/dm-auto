# Ring Group Auto-Assignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every department switch, automatically remove the runner from all ring groups associated with their old department and add them to all ring groups associated with their new department, preserving all other members.

**Architecture:** One new GET call (`getRingGroups`) fetches all ring groups with their department associations and current members in a single round-trip. The switch route calls this after `patchUserGroup` succeeds and before `writeAuditLog`. Ring group PATCH failures are non-fatal — logged and skipped. No DB changes, no UI changes, no admin config.

**Tech Stack:** Fastify 4, Drizzle ORM, TypeScript, Jest + nock

**Spec:** `docs/superpowers/specs/2026-03-18-ring-group-auto-assignment-design.md`

---

## Chunk 1: xAPI client — getRingGroups + updateRingGroupMembers

### Task 1: Add interfaces and getRingGroups (TDD)

**Files:**
- Modify: `api/src/xapi/client.ts` (after `XAPIUserExtension`, before `XAPIClient` class)
- Modify: `api/tests/xapi/client.test.ts` (new describe block after patchUserGroup tests)

- [ ] **Step 1: Add the two new interfaces to client.ts**

In `api/src/xapi/client.ts`, after the `XAPIUserExtension` interface (line ~36), add:

```typescript
export interface XAPIRingGroupMember {
  id?:    number;       // present on existing members; omit when adding new
  number: string;       // extension number — used to identify the runner
  name?:  string | null;
  tags?:  unknown[];
}

export interface XAPIRingGroup {
  id:       number;
  name:     string;
  number:   string;
  groupIds: number[];   // department IDs this ring group belongs to
  members:  XAPIRingGroupMember[];
}
```

- [ ] **Step 2: Write failing tests for getRingGroups**

In `api/tests/xapi/client.test.ts`, add a new describe block after the `patchUserGroup` block:

```typescript
// ── 3b. getRingGroups ────────────────────────────────────────────────────────

describe('getRingGroups', () => {
  it('returns ring groups with groupIds and members', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/RingGroups/)
      .reply(200, {
        value: [
          {
            Id: 206, Name: 'Sales Ring', Number: '802',
            Groups:  [{ GroupId: 33, Name: 'Sales' }],
            Members: [
              { Id: 45, Number: '101', Name: 'Alice', Tags: [] },
              { Id: 32, Number: '000', Name: 'Bob',   Tags: [] },
            ],
          },
          {
            Id: 213, Name: 'Support Ring', Number: '803',
            Groups:  [{ GroupId: 28, Name: '___FAVORITES___X' }],
            Members: [],
          },
        ],
      });

    const client = makeClient();
    const result = await client.getRingGroups();

    // ___FAVORITES___X is filtered out from groupIds client-side
    expect(result).toEqual([
      {
        id: 206, name: 'Sales Ring', number: '802',
        groupIds: [33],
        members: [
          { id: 45, number: '101', name: 'Alice', tags: [] },
          { id: 32, number: '000', name: 'Bob',   tags: [] },
        ],
      },
      {
        id: 213, name: 'Support Ring', number: '803',
        groupIds: [],   // ___FAVORITES___ filtered out
        members: [],
      },
    ]);
    expect(nock.isDone()).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: FAIL — `getRingGroups is not a function`

- [ ] **Step 4: Implement getRingGroups in client.ts**

Add after the `patchUserGroup` method and before the `// ── Private helpers` comment:

```typescript
/**
 * Fetches all ring groups with their department associations and current
 * member lists. Used by the switch route to compute ring group deltas.
 *
 * GET /xapi/v1/RingGroups
 *   ?$select=Id,Name,Number
 *   &$expand=Members,Groups($select=GroupId,Name;$filter=not startsWith(Name,'___FAVORITES___'))
 *
 * Client-side fallback: any Group entry whose Name starts with ___FAVORITES___
 * is filtered out in case the PBX ignores the nested $filter.
 */
async getRingGroups(): Promise<XAPIRingGroup[]> {
  const path =
    `/RingGroups?$select=Id,Name,Number` +
    `&$expand=Members,Groups($select=GroupId,Name;$filter=not startsWith(Name,'___FAVORITES___'))`;

  const data = (await this.get(path)) as {
    value: Array<{
      Id:      number;
      Name:    string;
      Number:  string;
      Groups:  Array<{ GroupId: number; Name: string }> | null;
      Members: Array<{ Id?: number; Number: string; Name?: string | null; Tags?: unknown[] }> | null;
    }>;
  };

  return data.value.map(rg => ({
    id:      rg.Id,
    name:    rg.Name,
    number:  rg.Number,
    groupIds: (rg.Groups ?? [])
      .filter(g => !g.Name.startsWith('___FAVORITES___'))
      .map(g => g.GroupId),
    members: (rg.Members ?? []).map(m => ({
      id:     m.Id,
      number: m.Number,
      name:   m.Name ?? null,
      tags:   m.Tags ?? [],
    })),
  }));
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: all tests PASS including the new getRingGroups test.

- [ ] **Step 6: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/xapi/client.ts tests/xapi/client.test.ts
git commit -m "feat(api): add getRingGroups to xAPI client with ___FAVORITES___ filter"
```

---

### Task 2: Add updateRingGroupMembers (TDD)

**Files:**
- Modify: `api/src/xapi/client.ts`
- Modify: `api/tests/xapi/client.test.ts`

- [ ] **Step 1: Write failing tests for updateRingGroupMembers**

In `api/tests/xapi/client.test.ts`, add after the `getRingGroups` describe block:

```typescript
// ── 3c. updateRingGroupMembers ────────────────────────────────────────────────

describe('updateRingGroupMembers', () => {
  it('PATCHes the ring group with PascalCase member keys (as required by 3CX xAPI)', async () => {
    // nock matches the EXACT body sent to the PBX — must be PascalCase
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/RingGroups(206)', {
        Members: [
          { Id: 45, Number: '101', Name: 'Alice', Tags: [] },
        ],
      })
      .reply(204);

    const client = makeClient();
    await expect(
      client.updateRingGroupMembers(206, [
        { id: 45, number: '101', name: 'Alice', tags: [] },
      ]),
    ).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });

  it('serializes a new member (no id) with only Number in the body', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/RingGroups(207)', {
        Members: [{ Number: '000' }],
      })
      .reply(204);

    const client = makeClient();
    await expect(
      client.updateRingGroupMembers(207, [{ number: '000' }]),
    ).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });

  it('accepts an empty member list (remove last member)', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/RingGroups(208)', { Members: [] })
      .reply(204);

    const client = makeClient();
    await expect(client.updateRingGroupMembers(208, [])).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: FAIL — `updateRingGroupMembers is not a function`

- [ ] **Step 3: Implement updateRingGroupMembers in client.ts**

Add after `getRingGroups` and before `// ── Private helpers`:

```typescript
/**
 * Replaces the member list of a ring group.
 * Must include ALL members (not just the changed one) — the PBX replaces
 * the entire Members array on PATCH.
 *
 * PATCH /xapi/v1/RingGroups({ringGroupId})
 * Body: { Members: [...] }
 * Expected: 204 No Content
 *
 * Only the runner is added/removed — all other members must be preserved
 * by the caller.
 */
async updateRingGroupMembers(
  ringGroupId: number,
  members: XAPIRingGroupMember[],
): Promise<void> {
  // The 3CX xAPI requires PascalCase keys in the PATCH body.
  // XAPIRingGroupMember uses camelCase internally — serialize here.
  const pbxMembers = members.map(m => ({
    ...(m.id     !== undefined ? { Id:   m.id }   : {}),
    Number: m.number,
    ...(m.name   !== undefined ? { Name: m.name } : {}),
    ...(m.tags   !== undefined ? { Tags: m.tags } : {}),
  }));
  await this.patch(`/RingGroups(${ringGroupId})`, { Members: pbxMembers });
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd C:/Projects/dm/dm-auto/api && npm test -- --testPathPattern=client.test
```

Expected: all tests PASS.

- [ ] **Step 5: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/xapi/client.ts tests/xapi/client.test.ts
git commit -m "feat(api): add updateRingGroupMembers to xAPI client"
```

---

## Chunk 2: Switch route — ring group delta logic

### Task 3: Add ring group handling to switch route

**Files:**
- Modify: `api/src/routes/switch.ts`

**Context:** The ring group logic inserts between the successful `patchUserGroup` call (line ~136) and the success `writeAuditLog` call (line ~157). It is wrapped in its own try/catch so any failure is non-fatal. `session.extensionNumber` is the runner's extension number string.

- [ ] **Step 1: Add ring group logic to switch.ts**

In `api/src/routes/switch.ts`, find the block after `patchUserGroup` succeeds (after line `await xapiClient.patchUserGroup(...)` inside its try/catch) and before `// 9. Audit: success`. Insert:

```typescript
      // 9. Ring group re-assignment (non-fatal — dept switch already committed)
      try {
        const ringGroups = await xapiClient.getRingGroups();
        const ext = session.extensionNumber!;

        // Ring groups for old dept and new dept
        const toLeave = ringGroups.filter(rg => rg.groupIds.includes(currentGroupId));
        const toJoin  = ringGroups.filter(rg => rg.groupIds.includes(targetDeptId));

        // Avoid touching ring groups that belong to both (no net change needed)
        const toJoinIds  = new Set(toJoin.map(rg => rg.id));
        const toLeaveIds = new Set(toLeave.map(rg => rg.id));

        const actuallyLeaving = toLeave.filter(rg => !toJoinIds.has(rg.id));
        const actuallyJoining = toJoin.filter(rg => !toLeaveIds.has(rg.id));

        // Remove runner from old ring groups
        for (const rg of actuallyLeaving) {
          const newMembers = rg.members.filter(m => m.number !== ext);
          if (newMembers.length === rg.members.length) continue; // not a member — skip
          try {
            await xapiClient.updateRingGroupMembers(rg.id, newMembers);
          } catch (err) {
            fastify.log.warn({ ringGroupId: rg.id, err }, 'Failed to remove runner from ring group');
          }
        }

        // Add runner to new ring groups
        for (const rg of actuallyJoining) {
          if (rg.members.some(m => m.number === ext)) continue; // already a member — skip
          const newMembers = [...rg.members, { number: ext }];
          try {
            await xapiClient.updateRingGroupMembers(rg.id, newMembers);
          } catch (err) {
            fastify.log.warn({ ringGroupId: rg.id, err }, 'Failed to add runner to ring group');
          }
        }
      } catch (err) {
        // getRingGroups() failed — log and continue, dept switch already succeeded
        fastify.log.warn({ err }, 'Failed to fetch ring groups for re-assignment');
      }
```

Renumber the existing `// 9. Audit: success` comment to `// 10. Audit: success` for clarity.

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Run full test suite**

```bash
cd C:/Projects/dm/dm-auto/api && npm test
```

Expected: same pass count as before (ring group code is new, existing switch tests still pass — they don't mock ring group calls so the try/catch will swallow the nock failure silently).

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/dm/dm-auto/api
git add src/routes/switch.ts
git commit -m "feat(api): auto assign/remove runner from ring groups on department switch"
```

---

## Chunk 3: Deploy

### Task 4: Push and redeploy

- [ ] **Step 1: Final build + test**

```bash
cd C:/Projects/dm/dm-auto/api && npm run build && npm test
```

Expected: build exits 0, tests pass (pre-existing failures in security.test and getAllUsers.test are not caused by this feature).

- [ ] **Step 2: Push**

```bash
cd C:/Projects/dm/dm-auto && git push origin main
```

- [ ] **Step 3: Redeploy API (only API changed)**

```bash
curl -s -X POST \
  -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/applications/v11gk4n5aa8jt3a7nsb7kgi5/restart"
```

- [ ] **Step 4: Verify deployment**

Poll until `status: finished`:
```bash
curl -s -H "Authorization: Bearer 1|BtCXz2CWg1NNvh84ojWtgYy93noOS2xiGCFCpoow89bb6501" \
  "http://46.224.229.119:8000/api/v1/deployments/<deployment_uuid>"
```

- [ ] **Step 5: Smoke test**

Switch a runner between two departments that have ring groups configured on the PBX. Verify in the 3CX admin panel that:
1. Runner was removed from ring groups associated with the old department
2. Runner was added to ring groups associated with the new department
3. All other ring group members are unchanged
