-- Additive, reviewed release only. Not automatically applied in production.
BEGIN;
ALTER TABLE commission_reservations ADD COLUMN IF NOT EXISTS travel_day date;
ALTER TABLE commission_reservations ADD COLUMN IF NOT EXISTS booking_timezone text;
CREATE TABLE IF NOT EXISTS commission_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agency_id uuid NOT NULL REFERENCES agencies(id),
 source_payout_id uuid NOT NULL REFERENCES payouts(id),
 moovs_trip_id text,
 amount numeric(12,2) NOT NULL CHECK(amount<>0),
 reason text NOT NULL,
 actor text NOT NULL,
 request_key uuid NOT NULL UNIQUE,
 applied_payout_id uuid REFERENCES payouts(id),
 cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(applied_payout_id IS NULL OR cancelled_at IS NULL)
);
CREATE INDEX IF NOT EXISTS commission_adjustments_agency ON commission_adjustments(agency_id,created_at DESC);
COMMIT;
