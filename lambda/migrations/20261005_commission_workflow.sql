-- LOCAL / REVIEWED MIGRATION ONLY. Do not run against production without approval.
BEGIN;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS commission_rules jsonb NOT NULL DEFAULT '[]';
ALTER TABLE commission_reservations ADD COLUMN IF NOT EXISTS moovs_request_id text;
ALTER TABLE commission_reservations ADD COLUMN IF NOT EXISTS route_public_id text;
ALTER TABLE commission_reservations ADD COLUMN IF NOT EXISTS refund_amount numeric;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS statement_snapshot jsonb;
CREATE TABLE IF NOT EXISTS commission_reviews (
  agency_id uuid NOT NULL REFERENCES agencies(id), moovs_trip_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('approved','held','rejected')),
  reason text NOT NULL, fingerprint text NOT NULL,
  expected_payment_date date, actor text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, moovs_trip_id)
);
CREATE TABLE IF NOT EXISTS commission_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL REFERENCES agencies(id),
  moovs_trip_id text, action text NOT NULL, actor text NOT NULL, reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_events_agency_date ON commission_workflow_events(agency_id, created_at DESC);
CREATE TABLE IF NOT EXISTS commission_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL REFERENCES agencies(id),
  agent_id uuid REFERENCES agents(id), moovs_trip_id text NOT NULL, submitted_by text NOT NULL,
  request_key uuid NOT NULL, message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolution text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
  UNIQUE(submitted_by, request_key)
);
CREATE INDEX IF NOT EXISTS commission_questions_scope ON commission_questions(agency_id, created_at DESC);
COMMIT;
