# XAPI_TEST_GUIDE.md
## 3CX Runner App — xAPI Validation Against `sales.on3cx.de`

**Purpose:** Validate the three xAPI calls before starting the autonomous build pipeline.  
**Test PBX:** `https://sales.on3cx.de/`  
**Must answer:** Does `PATCH /Users` Groups array **replace** or **add** group membership?

---

## Prerequisites

You need xAPI client credentials for `sales.on3cx.de`.  
Get them from: **3CX Admin Panel → Settings → API → Add Application**

- Grant type: `client_credentials`
- Required scope: `SystemConfiguration`
- Note the `client_id` and `client_secret`

Also note one **real extension number** on this PBX to use as the test subject (e.g. `101`).

---

## Step 0 — Authenticate

```bash
export PBX="https://sales.on3cx.de"
export CLIENT_ID="your_client_id_here"
export CLIENT_SECRET="your_client_secret_here"

TOKEN=$(curl -s -X POST "${PBX}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  | jq -r '.access_token')

echo "Token: ${TOKEN:0:40}..."
```

Expected: a JWT string ~500 characters long.  
On error: check credentials and that the scope is `SystemConfiguration`.

---

## Step 1 — Find a User by Extension Number

```bash
export EXT="101"   # replace with a real extension on sales.on3cx.de

curl -s "${PBX}/xapi/v1/Users?\$filter=Number eq '${EXT}'&\$expand=Groups&\$select=Id,Number,FirstName,LastName,EmailAddress" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq .
```

**What you're looking for:**

```json
{
  "value": [{
    "Id": 42,
    "Number": "101",
    "FirstName": "Maria",
    "LastName": "Tester",
    "EmailAddress": "maria@customer.de",
    "Groups": [{
      "GroupId": 28,
      "Name": "DEFAULT",
      "Type": "Extension"
    }]
  }]
}
```

**Record:**
```
userId  = value[0].Id         → e.g. 42
currentGroupId = value[0].Groups[0].GroupId  → e.g. 28
```

---

## Step 2 — List All Groups (Departments)

```bash
curl -s "${PBX}/xapi/v1/Groups?\$select=Id,Name&\$orderby=Name" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq .
```

Expected:
```json
{
  "value": [
    { "Id": 28, "Name": "DEFAULT" },
    { "Id": 35, "Name": "Sales" },
    { "Id": 41, "Name": "Support" }
  ]
}
```

**Record:** Pick a **target group** different from the current one.
```
targetGroupId = e.g. 35  (Sales)
```

---

## Step 3 — The Critical PATCH Test

Set your values:

```bash
export USER_ID=42           # from Step 1
export TARGET_GROUP_ID=35   # from Step 2 — NOT the current group
```

**Before the PATCH** — snapshot current groups:
```bash
echo "=== BEFORE ==="
curl -s "${PBX}/xapi/v1/Users(${USER_ID})?\$expand=Groups" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '.Groups[] | {GroupId: .GroupId, Name: .Name}'
```

**Execute the PATCH:**
```bash
HTTP_CODE=$(curl -s -o /tmp/patch_response.json -w "%{http_code}" \
  -X PATCH "${PBX}/xapi/v1/Users(${USER_ID})" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"Groups\":[{\"GroupId\":${TARGET_GROUP_ID},\"Rights\":{\"RoleName\":\"users\"}}],\"Id\":${USER_ID}}")

echo "HTTP Status: ${HTTP_CODE}"
cat /tmp/patch_response.json | jq . 2>/dev/null || echo "(empty body — 204 is expected)"
```

Expected HTTP status: **204 No Content** (empty body).

**After the PATCH** — verify result:
```bash
echo "=== AFTER ==="
curl -s "${PBX}/xapi/v1/Users(${USER_ID})?\$expand=Groups" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '.Groups[] | {GroupId: .GroupId, Name: .Name}'
```

---

## Step 4 — Interpret the Result

### ✅ Result A: REPLACE behavior (what we want + assume)

```
BEFORE:  [{ GroupId: 28, Name: "DEFAULT" }]
AFTER:   [{ GroupId: 35, Name: "Sales" }]
```

User is now in exactly one group. The PATCH **replaced** the Groups array.  
→ **No code changes needed.** Our spec and implementation are correct.

---

### ⚠️ Result B: APPEND behavior

```
BEFORE:  [{ GroupId: 28, Name: "DEFAULT" }]
AFTER:   [{ GroupId: 28, Name: "DEFAULT" }, { GroupId: 35, Name: "Sales" }]
```

The PATCH **added** the group — user is now in both.  
→ **Code change required.** The xAPI client must:
1. First call `getUserByNumber()` to get current groups
2. Build PATCH body as the **full desired final state** (only target group, no others)
3. Or: add a separate DELETE/PATCH call to remove the old group first

Workaround for Result B — send only the target group (still correct for most PBXs):
```bash
# Explicit single-group PATCH to force replace
curl -s -X PATCH "${PBX}/xapi/v1/Users(${USER_ID})" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"Groups\":[{\"GroupId\":${TARGET_GROUP_ID},\"Rights\":{\"RoleName\":\"users\"}}],\"Id\":${USER_ID}}"
```
If still appending: try including `"GroupsOperation": "Replace"` in the body (unofficial field, some versions).

---

## Step 5 — Restore the Test User

**Put them back in their original group:**

```bash
export ORIGINAL_GROUP_ID=28   # from Step 1 — restore to this

curl -s -X PATCH "${PBX}/xapi/v1/Users(${USER_ID})" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"Groups\":[{\"GroupId\":${ORIGINAL_GROUP_ID},\"Rights\":{\"RoleName\":\"users\"}}],\"Id\":${USER_ID}}"

echo "Restored. Verifying..."
curl -s "${PBX}/xapi/v1/Users(${USER_ID})?\$expand=Groups" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '.Groups[] | {GroupId: .GroupId, Name: .Name}'
```

---

## Step 6 — Validate Email Mapping

The Runner App maps Microsoft SSO email → 3CX user via the `EmailAddress` field.  
Confirm it works on this PBX:

```bash
export TEST_EMAIL="maria@customer.de"   # replace with a real email on sales.on3cx.de

curl -s "${PBX}/xapi/v1/Users?\$filter=EmailAddress eq '${TEST_EMAIL}'&\$select=Id,Number,EmailAddress" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq .
```

Expected: one result with matching `EmailAddress`.  
If zero results: the 3CX user may not have an email set → assign one in admin panel.

---

## Validation Checklist

```
[ ] Step 0: Token acquired successfully
[ ] Step 1: GET /xapi/v1/Users  returns user with Groups[] array
[ ] Step 2: GET /xapi/v1/Groups  returns department list
[ ] Step 3: PATCH /xapi/v1/Users({id}) returns 204
[ ] Step 4: PATCH behavior = REPLACE (confirm before building)
[ ] Step 5: User restored to original group
[ ] Step 6: Email → User lookup works
```

---

## If Something Fails

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `401 Unauthorized` on token | Wrong credentials or scope | Re-check client_id/secret, ensure `SystemConfiguration` scope |
| `404` on `/xapi/v1/Users` | Wrong PBX URL or xAPI not enabled | Confirm PBX is v20, xAPI enabled in Settings |
| `403` on PATCH | Token missing write scope | Re-create API key with `SystemConfiguration` (not read-only) |
| `400` on PATCH | Wrong body format | Check `Id` field matches `userId` in URL |
| Empty `Groups[]` in GET | User has no group assigned | Assign user to a department in admin panel first |
| `EmailAddress` field missing | PBX v18 or older schema | Upgrade to v20; or use `Number` as lookup key and adapt the DB schema |

---

## After Validation

Once all 6 steps pass:

1. Record the PATCH behavior (Replace or Append) in `RUNNER_APP_SPEC.md §9`
2. Start the autonomous build pipeline (commit `BUILD_STATE.json`)
3. The xAPI client Claude builds will target `/xapi/v1/Users` and `/xapi/v1/Groups`

*Document any deviations from expected responses in the spec before the pipeline starts.*
