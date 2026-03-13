-- Add missing audit_log fields required by §14 of RUNNER_APP_SPEC.md
-- fromDeptName / toDeptName for historical accuracy without joins
-- ipAddress / userAgent for security audit trail

ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "from_dept_name" text;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "to_dept_name" text;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" text;
