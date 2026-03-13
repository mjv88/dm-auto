Read RUNNER_APP_SPEC.md section §15 (Security Requirements) completely.
Read next.config.js, app/layout.tsx, all lib/ files.

Your task: Security hardening, performance, accessibility, edge cases.

Required deliverables:

- next.config.js (update)
  Security headers on all responses:
    Content-Security-Policy:
      default-src 'self'
      script-src 'self' 'unsafe-inline' (required for Next.js)
      connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com
      img-src 'self' data:
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: geolocation=(), microphone=(), camera=()

- app/layout.tsx (update)
  Add viewport meta: viewport-fit=cover (iOS notch support)
  Add apple touch icon links
  Prevent zoom on input focus: font-size minimum 16px on inputs
  Safe area insets for iOS home indicator: pb-safe class

- lib/api.ts (update)
  Add request timeout: 10 seconds (AbortController)
  Add retry on network error: 2 retries, 1s delay
  Add correlation ID header: x-request-id (uuid v4)

- Accessibility audit and fixes:
  All interactive elements have aria-label
  DeptCard: role="button", aria-disabled for current dept
  ConfirmSheet: aria-modal, focus trap when open
  ErrorScreen: role="alert"
  Color contrast: all text passes WCAG AA (4.5:1)
  Touch targets: all >= 44px (Apple HIG minimum)

- Performance:
  app/departments/page.tsx: add React.memo to DeptCard list
  lib/store.ts: add shallow equality checks on selectors
  Images: all icons use next/image with sizes

- Edge cases to handle:
  Extension with zero allowed departments → show "No departments available"
  PBX returns empty department list → show "No departments found"
  Department name longer than 40 chars → truncate with ellipsis
  Network request takes >5s → show "This is taking longer than usual..."
  MSAL popup blocked by browser → show manual login link

- tests/security/
  CSP header present on all routes
  X-Frame-Options present
  No localStorage usage (scan all files)
  Input sanitization on any user-input fields

Commit to feature/hardening.
Open PR: "feat: security headers, accessibility, edge cases"
Update BUILD_STATE.json: hardening.status = "complete"
