-- Add IVR access flag to runners
ALTER TABLE runners ADD COLUMN IF NOT EXISTS ivr_access boolean NOT NULL DEFAULT false;

-- Extend audit_log for IVR actions
ALTER TABLE audit_log ALTER COLUMN to_dept_id DROP NOT NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'switch';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata jsonb;
