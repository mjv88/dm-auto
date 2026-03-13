Read RUNNER_APP_SPEC.md section §6 (all screen wireframes) and §13 (error states).
All components from ui_core phase are available. Use them.
Read lib/api.ts (currently a stub — you will call it, not implement it).
Read lib/store.ts (implemented).

Your task: Build all full-page screen components.

Required deliverables:

- app/departments/page.tsx (main screen)
  On mount:
    - GET /runner/departments from store (not API — store already populated by auth)
    - Display RunnerHeader
    - Display StatusBadge with currentDept
    - Display list of DeptCards (current greyed, others tappable)
    - Refresh icon top-right (re-fetches from API)
  On dept card tap:
    - Open ConfirmSheet
  On ConfirmSheet confirm:
    - Set store switching state
    - Call lib/api.ts switchDepartment(targetDeptId)
    - On success: update store, show success toast (2s), close sheet
    - On failure: close sheet, show ErrorScreen with error code
  Pull-to-refresh: supported

- app/select-pbx/page.tsx (multi-PBX selector)
  Only shown when store.pbxOptions.length > 1
  Lists PBX options as cards:
    Card shows: pbxName (bold), pbxFqdn (secondary, truncated)
  On tap: set store.selectedPbxFqdn → call api.auth(fqdn) → to /departments
  Back button: not shown (no going back from here)

- app/error/page.tsx
  Reads error from store or URL param ?code=
  Renders ErrorScreen component
  Retry where applicable

- components/SuccessToast.tsx
  Overlay toast: "✅ Switched to {deptName}"
  Auto-dismisses after 2 seconds
  Green background, white text
  Slides in from top

- app/departments/loading.tsx
  Next.js loading state for departments route
  Shows LoadingScreen component

- tests/screens/
  - departments.test.tsx:
    Renders correctly with 3 allowed depts
    Current dept card is disabled
    Tap on dept opens ConfirmSheet
    Confirm calls switchDepartment
    Success shows toast
    API failure shows error screen
  - select-pbx.test.tsx:
    Renders all PBX options
    Tap sets store and navigates
  All API calls mocked via jest.mock('../../lib/api')

Commit to feature/ui-screens.
Open PR: "feat: all screen components"
Update BUILD_STATE.json: ui_screens.status = "complete"
