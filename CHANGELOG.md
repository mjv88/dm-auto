# Changelog

## [1.0.0] — 2026-03-13

### Initial Release

#### Authentication
- Microsoft Entra ID (MSAL) single sign-on with PKCE flow
- Automatic token refresh and silent authentication
- Login page with branded Microsoft sign-in button

#### Core Features
- PBX selection screen for multi-PBX environments
- Department listing with current department indicator
- One-tap department switching with confirmation dialog
- Success toast notification after switch
- Status badge showing current department assignment

#### PWA
- Installable Progressive Web App (manifest, service worker)
- Offline fallback page
- API response caching (NetworkFirst, 5-minute TTL)
- Static asset caching (CacheFirst, 30-day TTL)

#### UI/UX
- Mobile-first responsive design with Tailwind CSS
- Department cards with switch action
- Loading states and error screens with contextual messages
- Pull-to-refresh on department list

#### Security
- Content Security Policy headers
- X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy
- No localStorage/sessionStorage for sensitive data
- Non-root Docker container

#### Infrastructure
- Multi-stage Docker build (node:20-alpine)
- Jest unit tests with React Testing Library
- Playwright E2E test suite
- ESLint configuration
- Zustand state management
