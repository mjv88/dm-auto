Read RUNNER_APP_SPEC.md sections §6 and §11 (PWA + Intune requirements).
Read public/manifest.json (already created in scaffold).
Read next.config.js (currently a stub).

Your task: Full PWA configuration — manifest, service worker, Next.js setup.

Required deliverables:

- next.config.js (replace stub)
  next-pwa fully configured:
    dest: 'public'
    disable in development
    register: true, skipWaiting: true
    runtimeCaching:
      - API calls (NetworkFirst, 5min cache)
      - Static assets (CacheFirst, 30 days)
  output: 'standalone'
  All NEXT_PUBLIC env vars exposed

- public/manifest.json (update with all required fields)
  name: "Runner Hub"
  short_name: "Runner"
  display: "standalone"
  theme_color: "#0078D4"
  background_color: "#ffffff"
  orientation: "portrait"
  start_url: "/?source=pwa"
  icons: 192, 512, 512-maskable
  scope: "/"
  lang: "de"            ← DACH market

- public/sw-custom.js
  Custom service worker additions:
  - Offline fallback page (shows "No connection" shell)
  - Clear notification on new version available
  - Cache API base URL responses

- app/layout.tsx (update stub)
  Complete HTML metadata for PWA:
    viewport: width=device-width, initial-scale=1, viewport-fit=cover
    theme-color: #0078D4
    apple-mobile-web-app-capable: yes
    apple-mobile-web-app-status-bar-style: default
    manifest link
  Root providers: ZustandProvider
  Inter font (Google Fonts, subset: latin)
  Global styles: safe-area insets for notched phones

- public/icons/
  Generate placeholder icons using canvas (node script):
    icon-192.png (blue circle with "R" — placeholder)
    icon-512.png
    icon-512-maskable.png (with safe zone)
  Script: scripts/generate-icons.js

- app/offline/page.tsx
  Shown by service worker when offline:
  Clean "No internet connection" screen
  Runner Hub branding
  "Try again" button

- tests/pwa/manifest.test.ts
  Validates manifest.json has all required Intune fields
  Validates all icon paths exist
  Validates display: standalone
  Validates start_url set

Commit to feature/pwa-config.
Open PR: "feat: PWA configuration, manifest, service worker"
Update BUILD_STATE.json: pwa_config.status = "complete"
