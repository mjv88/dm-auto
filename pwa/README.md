# TCX Runner PWA

A mobile-first Progressive Web App that lets 3CX users switch their department assignment with a single tap. Built for enterprise deployment via Microsoft Intune with Entra ID SSO.

## Tech Stack

- **Framework**: Next.js 14 (App Router, standalone output)
- **Auth**: Microsoft MSAL (Entra ID, PKCE)
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

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Coolify deployment steps, environment variables, and Intune configuration.

## Specification

See [RUNNER_APP_SPEC.md](./RUNNER_APP_SPEC.md) for the full product specification.
