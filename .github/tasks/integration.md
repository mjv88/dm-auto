Read RUNNER_APP_SPEC.md completely.
Read all files in src/.
Read all files in tests/.

Your task: Final integration — close every gap between spec and implementation.

Steps:
1. Run npm test — fix any failing tests
2. Run npm run build — fix any type errors
3. Compare every endpoint in §5 against implementation:
   - Request shapes match exactly
   - Response shapes match exactly
   - All error codes from §13 thrown correctly
4. Verify all audit log fields written (§14)
5. Verify all security headers present (§15)
6. Verify Dockerfile: production build works, runs as non-root user
7. Verify /health returns all required fields
8. Write DEPLOYMENT.md:
   - Coolify setup steps
   - Environment variable checklist
   - First-run migration command
   - Smoke test checklist
9. Update README.md with final accurate setup instructions

Commit to feature/final-integration.
Open PR: "feat: final integration and deployment documentation"
Update BUILD_STATE.json: integration.status = "complete", current_phase = "COMPLETE"
