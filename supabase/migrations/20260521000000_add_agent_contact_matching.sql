-- Agent-level commission attribution support
-- - Link commission agents back to Moovs contacts.
-- - Snapshot booking-contact fields on commission reservations so agent matching survives payouts/history.

alter table agents
  add column if not exists moovs_contact_id text;

create index if not exists idx_agents_moovs_contact on agents(moovs_contact_id);

alter table commission_reservations
  add column if not exists booking_contact_id text,
  add column if not exists booking_contact_name text,
  add column if not exists booking_contact_email text;

create index if not exists idx_reservations_booking_contact on commission_reservations(booking_contact_id);
