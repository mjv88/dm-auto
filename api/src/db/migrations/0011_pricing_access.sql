ALTER TABLE users ADD COLUMN IF NOT EXISTS pricing_access boolean NOT NULL DEFAULT false;
