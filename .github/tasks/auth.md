Read RUNNER_APP_SPEC.md section §7 (Authentication) completely.
Read lib/auth.ts (currently a stub).
Read app/(auth)/login/page.tsx and app/(auth)/callback/page.tsx (stubs).

Your task: Implement the complete Microsoft MSAL SSO flow for the PWA.

IMPORTANT: This is a MULTI-TENANT app with a single app registration.
- NEXT_PUBLIC_ENTRA_CLIENT_ID is the platform's app registration (same for all customers)
- NO tenant ID in env — the user's tenant is determined at sign-in time from their Microsoft account
- MSAL authority uses "common" endpoint (not a specific tenant)

Environment variables:
- NEXT_PUBLIC_ENTRA_CLIENT_ID — Platform's multi-tenant app registration
- NEXT_PUBLIC_API_URL — https://runner-api.{domain}.com
- NEXT_PUBLIC_APP_URL — https://runner.{domain}.com

Required deliverables:

- lib/auth.ts
  Full MSAL PublicClientApplication config
  Authority: https://login.microsoftonline.com/common (multi-tenant)
  ClientId: NEXT_PUBLIC_ENTRA_CLIENT_ID
  RedirectUri: NEXT_PUBLIC_APP_URL + "/callback"

  acquireTokenSilent(): Promise<AuthResult>
    1. Initialize MSAL with config above
    2. Try silent acquisition (accounts[0])
    3. On InteractionRequiredAuthError → redirect to MS login
    4. On success → return { idToken, email, name }
  signOut(): void
  getStoredAccount(): AccountInfo | null

- lib/store.ts
  Zustand store: useRunnerStore
  State:
    authStatus: 'idle' | 'loading' | 'authenticated' | 'error'
    runnerProfile: RunnerProfile | null
    currentDept: Dept | null
    allowedDepts: Dept[]
    pbxOptions: PBXOption[]       ← for multi-PBX selector
    selectedPbxFqdn: string | null
    isAdmin: boolean              ← true if user is in tenant's admin_emails
    error: AppError | null
  Actions:
    setAuthStatus, setRunnerProfile, setCurrentDept,
    setAllowedDepts, setPbxOptions, setIsAdmin, setError, reset

- app/(auth)/login/page.tsx
  "Sign in with Microsoft" button
  On click → acquireTokenSilent()
  Shows loading spinner during auth
  Microsoft branding: logo, blue button (#0078D4)
  Mobile-first layout — centered card
  Works for ANY Microsoft org (multi-tenant)

- app/(auth)/callback/page.tsx
  Handles redirect from Microsoft
  Calls acquireTokenSilent() to complete flow
  On success → POST /runner/auth to Runner API (NEXT_PUBLIC_API_URL)
  Handle API responses:
    - TENANT_NOT_REGISTERED → show "Your organization is not registered" page
    - NOT_IN_RUNNERS_GROUP → show "You are not authorized as a runner" page
    - RUNNER_NOT_FOUND → show "No runner profile found" page
    - mode: 'select' → redirect to /select-pbx
    - mode: 'direct' → redirect to /departments
  On auth failure → /error with appropriate error code

- app/select-pbx/page.tsx
  Shows list of PBX options for multi-PBX runners
  Each card shows pbx_name and pbx_fqdn
  On select → store selectedPbxFqdn, redirect to /departments
  Mobile-first layout

- app/admin/page.tsx
  Only visible if isAdmin === true
  Tabs: Tenant Settings | PBX Credentials | Runners
  
  Tenant Settings tab:
    - Show tenant name, entra_group_id (editable)
    - Save → PUT /admin/tenants/me
  
  PBX Credentials tab:
    - List PBXs → GET /admin/pbx
    - Add PBX form: fqdn, name, auth_mode (xapi|user_credentials), credentials
    - Edit/delete PBX
  
  Runners tab:
    - List runners → GET /admin/runners (filterable by PBX, email, active)
    - Add runner form: email, extension, select PBX, select allowed departments
    - Edit/delete runner

- app/page.tsx
  On load: attempt silent SSO (Intune-managed devices get zero-tap)
  If authenticated → redirect to /departments (or /select-pbx if multi-PBX)
  If not → redirect to /login
  Shows loading spinner (never blank)

- types/auth.ts
  AuthResult, RunnerProfile, Dept, PBXOption, AppError, Tenant, PBXCredential types

- tests/lib/auth.test.ts
  Mock @azure/msal-browser completely
  Test: silent token acquired → returns email + idToken
  Test: InteractionRequiredAuthError → triggers redirect
  Test: MSAL uses "common" authority (not specific tenant)
  Test: store updates correctly on auth success
  Test: store updates correctly on auth failure
  Test: multi-PBX response shows PBX selector
  Test: TENANT_NOT_REGISTERED error shown correctly
  Test: admin panel visible only when isAdmin=true

Commit to feature/auth.
Open PR: "feat: Microsoft MSAL SSO + self-service admin panel"
Update BUILD_STATE.json: auth.status = "complete"
