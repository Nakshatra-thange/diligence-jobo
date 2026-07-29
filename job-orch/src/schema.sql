CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  input JSONB NOT NULL,
  output JSONB,
  provider_job_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup when a webhook arrives referencing the provider's job id
CREATE INDEX IF NOT EXISTS idx_jobs_provider_job_id ON jobs (provider_job_id);

-- Fast lookup for the reconciliation job (Part 4) scanning pending/processing jobs
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS fake_provider_jobs (
  provider_job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  ready_at TIMESTAMPTZ NOT NULL,
  output JSONB
);