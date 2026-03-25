# TCX Runner PWA

A mobile-first Progressive Web App that lets 3CX users switch their department assignment with a single tap. Built for enterprise deployment via Microsoft Intune with Entra ID SSO.

## Tech Stack

- **Framework**: Next.js 15 (App Router, React 19, standalone output)
- **Auth**: Microsoft MSAL 5 (Entra ID, PKCE)
- **State**: Zustand
- **Styling**: Tailwind CSS
- **Testing**: Jest + React Testing Library, Playwright E2E
- **Container**: Docker multi-stage (node:20-alpine)

## Local Development

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/mjv88/tcx-runner-pwa.git
   cd tcx-runner-pwa
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local` with your API URL and Entra ID credentials.

4. Start the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

```bash
npm test              # Jest unit tests
npm run test:e2e      # Playwright E2E tests
```

## Admin Interface

The admin panel is accessible at `/admin`. Tab availability depends on the user's role.

### Tab order

| Tab | Role required | Description |
|---|---|---|
| Dashboard | All admins | Overview and quick stats |
| Companies | `super_admin` | Create/delete tenants, manage tenant admins |
| Users | All admins | Manage runner users |
| PBX | All admins | PBX configuration and connections |
| Runners | All admins | Runner profiles and assignments |
| MS-Entra | All admins | Microsoft Entra ID / Azure AD settings (formerly "Settings") |
| Audit Log | All admins | Activity audit trail |
| System | `super_admin` | Server metrics, maintenance operations |

### Companies tab (super_admin)

- Create new tenants
- Delete existing tenants
- View and reassign tenant admins

### System tab (super_admin)

- View live server metrics (CPU, memory, disk)
- Trigger PostgreSQL VACUUM
- Trigger Docker prune via SSH to reclaim disk space

### Runner Modal

The RunnerModal has been redesigned and includes:

- **PBX user picker** — search and select the linked 3CX user from the PBX
- **Caller ID fields** — set a default outbound caller ID and per-department overrides
- **Ring group selector** — assign ring groups per department

### Setup wizard

The setup wizard has been retired. Navigating to `/setup` redirects to `/admin`.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Coolify deployment steps, environment variables, and Intune configuration.

## Specification

See [RUNNER_APP_SPEC.md](./RUNNER_APP_SPEC.md) for the full product specification.
