# Entra SSO Setup Guide

Configuration reference and setup checklist for Microsoft Entra ID (Azure AD) single sign-on in the TCX Runner App.

---

## 1. Current Configuration Status

### PWA (Next.js Frontend)

| Item | Status | Details |
|------|--------|---------|
| MSAL library | Configured | `@azure/msal-browser` in `pwa/lib/auth.ts` |
| Authority | Multi-tenant | Uses `https://login.microsoftonline.com/common` (any tenant accepted) |
| Token flow | Redirect | `acquireTokenSilent` first, falls back to `acquireTokenRedirect` |
| Scopes requested | Configured | `openid`, `profile`, `email`, `User.Read` |
| Cache location | sessionStorage | `storeAuthStateInCookie: false` |
| Redirect URI | Dynamic | `{NEXT_PUBLIC_APP_URL}/callback` (handled by `pwa/app/(auth)/callback/page.tsx`) |
| CSP connect-src | Configured | `login.microsoftonline.com` and `graph.microsoft.com` whitelisted in `next.config.js` |

### API (Fastify Backend)

| Item | Status | Details |
|------|--------|---------|
| Token validation | Configured | `api/src/middleware/authenticate.ts` — JWKS via common endpoint |
| JWKS endpoint | Multi-tenant | `https://login.microsoftonline.com/common/discovery/v2.0/keys` (10-min cache) |
| Audience check | Configured | Validates `aud === ENTRA_CLIENT_ID` |
| Issuer check | Configured | Regex: `https://login.microsoftonline.com/{tid}/v2.0` |
| Graph API auth | Configured | `api/src/entra/graphAuth.ts` — client_credentials flow for Graph calls |
| Group membership | Configured | `api/src/entra/groupCheck.ts` — `POST /v1.0/users/{oid}/checkMemberGroups` (5-min cache) |
| Tenant lookup | DB-driven | `entraTenantId` and `entraGroupId` stored per tenant in the `tenants` table |

### What Must Be Provisioned Per Deployment

- One Azure AD App Registration (shared across all customer tenants)
- Environment variables set in both PWA and API deployments
- Each customer tenant onboarded in the admin UI (Entra tenant ID + Runners group ID)

---

## 2. Azure AD App Registration Settings

### 2a. Create the App Registration

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Configure:
   - **Name:** `TCX Runner` (or your preferred display name)
   - **Supported account types:** **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**
   - **Redirect URI:** Select **Single-page application (SPA)** and enter:
     ```
     https://runner.{your-domain}.com/callback
     ```
4. Click **Register**
5. Note the **Application (client) ID** -- this is your `ENTRA_CLIENT_ID`

### 2b. Redirect URIs

Add all environments under **Authentication > Single-page application > Redirect URIs**:

| Environment | URI |
|-------------|-----|
| Production | `https://runner.{your-domain}.com/callback` |
| Staging | `https://runner-staging.{your-domain}.com/callback` |
| Local dev | `http://localhost:3000/callback` |

Do NOT add any Web or Mobile/Desktop redirect URIs. The app uses the SPA redirect type exclusively.

### 2c. Implicit Grant and Hybrid Flows

Under **Authentication > Implicit grant and hybrid flows**:

- **Access tokens:** Unchecked (not needed; MSAL uses authorization code + PKCE)
- **ID tokens:** Check this box (the PWA requests ID tokens via MSAL)

### 2d. Client Secret

Under **Certificates & secrets > Client secrets**:

1. Click **New client secret**
2. Set an expiry (recommended: 24 months)
3. Copy the **Value** immediately -- this is your `ENTRA_CLIENT_SECRET`
4. Store it securely; it cannot be retrieved after leaving this page

The client secret is used server-side only (API) for the Graph API client_credentials flow. It is never exposed to the browser.

### 2e. API Permissions

Under **API permissions**, add the following **Microsoft Graph** permissions:

| Permission | Type | Purpose |
|------------|------|---------|
| `User.Read` | Delegated | Basic user profile (email, name) in ID token |
| `GroupMember.Read.All` | Application | Server-side group membership check via Graph API |

After adding `GroupMember.Read.All` (Application type):

1. Click **Grant admin consent for {your directory}**
2. Confirm the prompt
3. Verify both permissions show a green checkmark under "Status"

`GroupMember.Read.All` requires admin consent because it is an Application permission (used by the API's client_credentials flow, not delegated to the user).

### 2f. Token Configuration

Under **Token configuration**, add the following **optional claims** to the **ID token**:

| Claim | Purpose |
|-------|---------|
| `email` | User's email address (primary identifier for runner lookup) |
| `preferred_username` | Fallback if `email` claim is missing (UPN) |

The API reads `tid` (tenant ID) and `oid` (user object ID) from the ID token. These are standard claims and do not need to be added manually.

### 2g. Expose an API (Not Required)

The TCX Runner App does **not** define its own API scopes. The API validates the Microsoft-issued ID token directly. No "Expose an API" configuration is needed.

---

## 3. Required Environment Variables

### PWA Environment Variables

Set in the PWA deployment (Coolify, `.env.local`, etc.):

```env
# Microsoft Entra ID — public values safe for browser exposure
NEXT_PUBLIC_ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_ENTRA_TENANT_ID=                # Optional; not used at runtime (authority is "common")
NEXT_PUBLIC_APP_URL=https://runner.example.com

# API backend
NEXT_PUBLIC_API_URL=https://runner-api.example.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | Yes | Application (client) ID from the app registration |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | No | Not used at runtime; authority is `common` for multi-tenant. Kept for documentation |
| `NEXT_PUBLIC_APP_URL` | Yes | PWA base URL; used to construct the redirect URI (`{APP_URL}/callback`) |
| `NEXT_PUBLIC_API_URL` | Yes | API base URL for the `/runner/auth` call |

### API Environment Variables

Set in the API deployment (Coolify, `.env`, etc.):

```env
# Microsoft Entra ID
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Legacy single-tenant (optional — multi-tenant uses DB)
ENTRA_TENANT_ID=
ENTRA_RUNNERS_GROUP_ID=

# CORS — must match the PWA URL
NEXT_PUBLIC_APP_URL=https://runner.example.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ENTRA_CLIENT_ID` | Yes | Same Application (client) ID as the PWA |
| `ENTRA_CLIENT_SECRET` | Yes | Client secret from the app registration (server-side only) |
| `ENTRA_TENANT_ID` | No | Legacy; multi-tenant mode reads tenant IDs from the DB |
| `ENTRA_RUNNERS_GROUP_ID` | No | Legacy; multi-tenant mode reads group IDs from the DB |

**Both the PWA and API must use the same `ENTRA_CLIENT_ID`.** The API validates that `aud` in the ID token matches this value.

---

## 4. Step-by-Step: Onboarding a New Customer Tenant

Once the platform app registration and deployments are configured, each new customer tenant is onboarded through the admin UI.

### Prerequisites at the Customer's Azure AD

1. **Create a security group** (e.g., "Runners") in the customer's Azure AD
2. Add the users who should have Runner access to this group
3. Note the **Entra Tenant ID** (Azure AD > Overview > Tenant ID)
4. Note the **Runners Group Object ID** (Azure AD > Groups > select group > Object ID)

### Onboarding in TCX Runner Admin

1. Log in to the admin portal (`https://runner.{your-domain}.com/admin`) as a `super_admin`
2. Navigate to the **Companies** tab
3. Click **Add Company**
4. Fill in:
   - **Company name** -- display name for the tenant
   - **Entra Tenant ID** -- the customer's Azure AD tenant ID (GUID)
   - **Runners Group ID** -- the Object ID of the customer's "Runners" security group
   - **Admin emails** -- email addresses of the customer's admins
5. Save the tenant
6. Navigate to the **PBX** tab and add the customer's 3CX PBX credentials (FQDN + xAPI or user credentials)
7. Navigate to the **Runners** tab and either:
   - Manually add runners (map Entra email to PBX extension + allowed departments)
   - Enable **Auto-Provision** on the tenant to let the system auto-create runner records on first login

### First Login by a Customer User

1. User opens `https://runner.{your-domain}.com`
2. MSAL redirects to Microsoft login (`login.microsoftonline.com/common`)
3. User signs in with their corporate credentials
4. Microsoft issues an ID token with `tid` (their tenant) and `oid` (their user)
5. The callback page sends the ID token to `POST /runner/auth`
6. The API:
   - Validates the token signature and audience
   - Looks up the tenant by `tid` in the DB
   - Checks group membership via Graph API (`checkMemberGroups`)
   - Finds the runner record by email
   - Issues a session JWT
7. User lands on the department switcher

---

## 5. Testing SSO End-to-End

### 5a. Verify App Registration

1. Open [Azure Portal > App registrations > TCX Runner](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Confirm:
   - **Application (client) ID** matches `ENTRA_CLIENT_ID` in both PWA and API env vars
   - **Redirect URIs** include `{APP_URL}/callback` for the environment under test
   - **API permissions** show `User.Read` (Delegated) and `GroupMember.Read.All` (Application) with admin consent granted

### 5b. Verify Environment Variables

```bash
# PWA — confirm the client ID is set (do NOT log secrets)
echo "PWA ENTRA_CLIENT_ID: $NEXT_PUBLIC_ENTRA_CLIENT_ID"
echo "PWA APP_URL: $NEXT_PUBLIC_APP_URL"

# API — confirm both are set
echo "API ENTRA_CLIENT_ID: $ENTRA_CLIENT_ID"
echo "API ENTRA_CLIENT_SECRET is set: $([ -n "$ENTRA_CLIENT_SECRET" ] && echo yes || echo NO)"
```

### 5c. Test the Login Flow

1. Open the PWA in an incognito/private browser window
2. You should be redirected to `login.microsoftonline.com`
3. Sign in with a user who is:
   - In a registered tenant (tenant's `entraTenantId` exists in the DB)
   - A member of the tenant's Runners security group
   - Has a runner record (or auto-provisioning is enabled)
4. After sign-in, you should land on `/departments` (single PBX) or `/select-pbx` (multiple PBXes)

### 5d. Test Error Scenarios

| Scenario | Expected Result |
|----------|----------------|
| User from unregistered tenant | 403 `TENANT_NOT_REGISTERED` -- "Organisation not registered" |
| User not in Runners group | 403 `NOT_IN_RUNNERS_GROUP` -- "Not authorised as a runner" |
| User in group but no runner record (auto-provision off) | 403 `RUNNER_NOT_FOUND` -- "No runner profile found" |
| Expired or tampered ID token | 401 `TOKEN_EXPIRED` or `UNAUTHORIZED` |

### 5e. Verify Graph API (Group Check)

Test the Graph API client_credentials token independently:

```bash
# Obtain a Graph token using the app's credentials
curl -s -X POST "https://login.microsoftonline.com/common/oauth2/v2.0/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$ENTRA_CLIENT_ID" \
  -d "client_secret=$ENTRA_CLIENT_SECRET" \
  -d "scope=https://graph.microsoft.com/.default" | jq .access_token

# Use the token to check group membership
curl -s -X POST "https://graph.microsoft.com/v1.0/users/{USER_OID}/checkMemberGroups" \
  -H "Authorization: Bearer {GRAPH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"groupIds": ["{RUNNERS_GROUP_ID}"]}' | jq .
```

A successful response returns `{ "value": ["{RUNNERS_GROUP_ID}"] }` if the user is a member, or `{ "value": [] }` if not.

### 5f. Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| MSAL redirect loops or blank page | Missing redirect URI in app registration | Add `{APP_URL}/callback` as SPA redirect |
| `AADSTS700054` error in browser | Wrong redirect URI type (Web instead of SPA) | Delete the Web URI, add as SPA type |
| 401 from `/runner/auth` with valid login | `ENTRA_CLIENT_ID` mismatch between PWA and API | Ensure both use the same client ID |
| 503 "Group check failed" | Missing admin consent for `GroupMember.Read.All` | Grant admin consent in app registration |
| 503 "Group check failed" | `ENTRA_CLIENT_SECRET` expired or wrong | Rotate the secret and update the API env var |
| Token works in dev but not prod | Redirect URI not added for prod URL | Add the production callback URI |
| `TENANT_NOT_REGISTERED` for a known customer | Tenant not yet added in admin UI | Add via Companies tab |
| `NOT_IN_RUNNERS_GROUP` | User not in the security group, or wrong group ID | Verify group membership and group OID in tenant config |

---

## 6. Architecture Summary

```
Browser (PWA)                    API (Fastify)                   Microsoft
─────────────                    ─────────────                   ─────────
  │                                  │                               │
  │── acquireTokenSilent ───────────────────────────────────────────>│
  │<─ ID token (aud=CLIENT_ID, tid, oid, email) ───────────────────│
  │                                  │                               │
  │── POST /runner/auth ────────────>│                               │
  │   { idToken }                    │                               │
  │                                  │── Verify JWT signature ──────>│
  │                                  │   (JWKS common endpoint)      │
  │                                  │<─ Public key ────────────────│
  │                                  │                               │
  │                                  │── Validate aud, iss, exp      │
  │                                  │── Look up tenant by tid (DB)  │
  │                                  │                               │
  │                                  │── checkMemberGroups ─────────>│
  │                                  │   (client_credentials token)   │
  │                                  │<─ { value: [groupId] } ──────│
  │                                  │                               │
  │                                  │── Look up runner by email (DB)│
  │                                  │── Issue session JWT            │
  │<─ { mode, runner, sessionToken }│                               │
  │                                  │                               │
```

**Key points:**
- The PWA never sees the client secret; it only uses the public client ID
- Token validation uses the `common` JWKS endpoint, so tokens from any Entra tenant are verifiable
- Group membership is checked server-side using an Application permission, not a delegated one
- Tenant-specific config (tenant ID, group ID) is stored in the database, not in environment variables
- The client_credentials token for Graph API is cached server-side with a 5-minute buffer before expiry
