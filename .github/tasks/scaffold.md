Read RUNNER_APP_SPEC.md section §3 and §6 and §17.
Read BUILD_STATE.json.

Your task: Scaffold the complete Next.js PWA project structure.

Create EVERY file and folder from the spec §3 tcx-runner-pwa tree.
Files are stubs with correct imports and TODO comments only.
Do not implement any logic yet.

Required deliverables:
- package.json with these exact dependencies:
    next@14, react@18, react-dom@18,
    @azure/msal-browser@3,
    next-pwa@5,
    tailwindcss@3,
    zustand@4,
    @radix-ui/react-dialog,
    class-variance-authority,
    clsx,
    typescript@5,
    @types/react, @types/node,
    jest@29, @testing-library/react, @testing-library/jest-dom,
    @playwright/test

- tsconfig.json (strict mode, paths alias: @/* → src/*)
- next.config.js (stub — next-pwa not wired yet, comes in pwa_config phase)
- tailwind.config.js (mobile-first, custom colors: brand blue #0078D4)
- postcss.config.js
- Dockerfile (multi-stage: node:20-alpine builder → runner)
- docker-compose.yml (local dev)
- .env.example (all vars from §17 PWA section)
- jest.config.js (with @testing-library/jest-dom setup)
- playwright.config.ts (baseURL from env)
- app/layout.tsx (stub — root layout)
- app/page.tsx (stub — redirects to /departments)
- app/(auth)/login/page.tsx (stub)
- app/(auth)/callback/page.tsx (stub)
- app/departments/page.tsx (stub)
- app/select-pbx/page.tsx (stub)
- app/error/page.tsx (stub)
- components/ (all component files as stubs)
- lib/auth.ts (stub)
- lib/api.ts (stub)
- lib/store.ts (stub)
- public/manifest.json (complete — values from §11)
- public/icons/.gitkeep

After creating all files:
- Run: npm install
- Run: npm run build (must succeed — stubs compile clean)
- Commit to feature/scaffold
- Open PR: "feat: project scaffold"
- Update BUILD_STATE.json: scaffold.status = "complete"
