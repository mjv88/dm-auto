CREATE TABLE IF NOT EXISTS dashboard_state (
  id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
