Read RUNNER_APP_SPEC.md section §5 completely — all endpoint shapes.
Read lib/api.ts (currently a stub).
Read lib/store.ts (implemented).
Read lib/auth.ts (implemented — use acquireTokenSilent() for tokens).

Your task: Implement the Runner API client that connects the PWA to the backend.

Base URL: process.env.NEXT_PUBLIC_API_URL

Required deliverables:

- lib/api.ts (replace stub)

  class RunnerAPIClient:

  async auth(pbxFqdn?: string): Promise<AuthResponse>
    1. Get idToken from acquireTokenSilent()
    2. POST /runner/auth { idToken, pbxFqdn }
    3. On mode='direct': store runner profile, navigate to /departments
    4. On mode='select': store pbxOptions, navigate to /select-pbx
    5. On error: store error, navigate to /error

  async getDepartments(): Promise<DeptResponse>
    GET /runner/departments                      ← Runner API endpoint (xAPI calls /Groups internally)
    Header: Authorization: Bearer {sessionToken from store}
    On 401: attempt silent re-auth then retry once
    On error: throw typed AppError

  async switchDepartment(targetDeptId: number): Promise<SwitchResponse>
    POST /runner/switch { targetDeptId }
    Header: Authorization: Bearer {sessionToken from store}
    On 401: attempt silent re-auth then retry once
    On success: update store.currentDept
    On error: throw typed AppError with errorCode

  Session token storage:
    Store in memory (Zustand store only)
    Never in localStorage or sessionStorage
    Lost on page reload → re-auth from MSAL (silent, zero friction)

- lib/errors.ts
  AppError class with code + message
  Maps every API error code from §13 to AppError
  isRetryable(code): boolean

- lib/api.test.ts
  Mock fetch globally
  Test: auth → direct mode → store updated correctly
  Test: auth → select mode → pbxOptions in store
  Test: getDepartments → returns group/dept list
  Test: switchDepartment → updates currentDept in store
  Test: 401 triggers re-auth and retries
  Test: PBX_UNAVAILABLE → AppError with isRetryable=true
  Test: NOT_A_RUNNER → AppError with isRetryable=false

Commit to feature/api-client.
Open PR: "feat: Runner API client"
Update BUILD_STATE.json: api_client.status = "complete"
