# TCX Runner PWA — Deployment Guide

## Prerequisites

- [ ] Hetzner server with Coolify installed
- [ ] DNS records: `runner.tcx-hub.com` → server IP
- [ ] Microsoft Entra App Registration (multi-tenant, SPA redirect)
- [ ] TCX Runner API deployed and accessible
- [ ] 3CX PBX with xAPI enabled

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Runner API base URL | `https://runner-api.tcx-hub.com` |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | MS Entra Application (client) ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | MS Entra Directory (tenant) ID or `common` for multi-tenant | `common` |
| `NEXT_PUBLIC_APP_URL` | Public URL of this PWA | `https://runner.tcx-hub.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking (optional) | `https://xxx@xxx.ingest.sentry.io/xxx` |

No additional environment variables are required for the PWA beyond the above. System management features (VACUUM, Docker prune) are handled entirely by the API.

## Coolify Deployment

1. **Create new resource** in Coolify → Docker Compose or Dockerfile
2. **Connect GitHub repo**: `mjv88/tcx-runner-pwa`, branch `main`
3. **Set environment variables** listed above
4. **Configure domain**: `runner.tcx-hub.com` with HTTPS (Cloudflare proxy)
5. **Deploy** — Coolify will build using the multi-stage Dockerfile:
   - Stage 1: installs dependencies (`npm ci`)
   - Stage 2: builds Next.js (`npm run build`)
   - Stage 3: runs as non-root `nextjs` user on port 3000
6. **Set health check**: `GET /` should return 200

## First Deploy Verification

- [ ] App loads on mobile browser at `https://runner.tcx-hub.com`
- [ ] Microsoft SSO login button appears and completes auth flow
- [ ] PBX selection screen appears (or departments if single PBX)
- [ ] Department list loads from API
- [ ] Department switch completes successfully
- [ ] PWA install prompt appears / can be added to home screen
- [ ] Offline page shows when network is unavailable
- [ ] `/setup` redirects to `/admin` (setup wizard has been retired)

## Setup Wizard

The setup wizard (`/setup`) has been retired. Any requests to `/setup` are automatically redirected to `/admin`. First-time configuration is done directly through the admin panel.

## Intune Configuration (MDM)

For managed device deployment via Microsoft Intune:

1. Add as a **Web link** app in Intune (Apps → All apps → Add → Web link)
2. URL: `https://runner.tcx-hub.com`
3. Assign to target user groups
4. For full PWA experience, use **Managed Google Play** web app on Android

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Blank page after login | Missing `NEXT_PUBLIC_ENTRA_CLIENT_ID` | Set env var, redeploy |
| "Network Error" on dept load | API URL misconfigured or CORS | Check `NEXT_PUBLIC_API_URL`, verify API allows PWA origin |
| SSO redirect fails | Wrong redirect URI in Entra | Add `https://runner.tcx-hub.com/callback` to Entra SPA redirects |
| PWA won't install | Not served over HTTPS | Ensure Cloudflare proxy or SSL is active |
| CSP blocks API calls | API domain not in CSP connect-src | Update `next.config.js` headers |
| `/setup` not found | Setup wizard retired | Navigate to `/admin` directly |
