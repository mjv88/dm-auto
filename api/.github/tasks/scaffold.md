Read RUNNER_APP_SPEC.md sections §3 and §17.
Read the existing BUILD_STATE.json.

Your task: Scaffold the complete project structure.

Create EVERY file and folder listed in §3.
Files should be stubs with correct imports and TODO comments —
do not implement logic yet. That comes in later phases.

Required deliverables:
- All folders created
- package.json with exact dependencies listed in §DEPENDENCIES
- tsconfig.json (strict mode)
- Dockerfile (multi-stage, node:20-alpine)
- docker-compose.yml (local dev with postgres)
- .env.example (all vars from §17, values empty)
- drizzle.config.ts
- src/index.ts (Fastify server, no routes yet)
- src/config.ts (zod env validation, all vars)
- All route files as stubs
- All middleware files as stubs
- README.md with setup instructions

After creating all files:
- Run: npm install
- Run: npm run build (must succeed with 0 errors)
- Commit everything to branch feature/scaffold
- Open a PR to main titled "feat: project scaffold"
- Update BUILD_STATE.json: scaffold.status = "complete"
