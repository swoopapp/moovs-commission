-- =============================================================
-- Commission Tracking Tables
-- Shares Supabase project + operator_branding with Pebble
-- =============================================================

-- 1. Agencies
create table agencies (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  moovs_company_id text,
  name text not null,
  type text not null default 'Other'
    check (type in ('Hotel','DMC','Travel Agent','OTA','Concierge','Other')),
  commission_rate numeric not null default 10,
  commission_type text not null default 'percent'
    check (commission_type in ('percent','flat')),
  commission_base text not null default 'total_amount'
    check (commission_base in ('base_rate','total_amount','total_with_gratuity')),
  contact_name text,
  contact_email text,
  contact_phone text,
  payment_terms text default 'Net 30',
  contract_start date,
  contract_end date,
  status text not null default 'active'
    check (status in ('active','suspended','archived')),
  portal_token text unique default encode(gen_random_bytes(18), 'hex'),
  notes text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_agencies_operator on agencies(operator_id);
create index idx_agencies_company on agencies(moovs_company_id);
create index idx_agencies_portal_token on agencies(portal_token);

-- 2. Agents
create table agents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'agent'
    check (role in ('agent','gm')),
  department text,
  status text not null default 'active'
    check (status in ('active','inactive')),
  portal_token text unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

create index idx_agents_agency on agents(agency_id);
create index idx_agents_portal_token on agents(portal_token);

-- 3. Reservations (synced from Metabase)
create table commission_reservations (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  moovs_trip_id text not null,
  moovs_company_id text,
  order_number text,
  confirmation_number text,
  pickup_date timestamptz,
  pickup_location text,
  dropoff_location text,
  passenger_name text,
  vehicle_type text,
  trip_type text,
  base_rate_amount numeric default 0,
  total_amount numeric default 0,
  total_with_gratuity numeric default 0,
  trip_status text,
  synced_at timestamptz not null default now(),
  unique(operator_id, moovs_trip_id)
);

create index idx_reservations_operator on commission_reservations(operator_id);
create index idx_reservations_company on commission_reservations(moovs_company_id);
create index idx_reservations_pickup on commission_reservations(pickup_date);
create index idx_reservations_order on commission_reservations(order_number);

-- 4. Reservation Attributions
create table reservation_attributions (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references commission_reservations(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  commission_rate numeric not null,
  commission_type text not null check (commission_type in ('percent','flat')),
  commission_base text not null check (commission_base in ('base_rate','total_amount','total_with_gratuity')),
  commission_amount numeric not null,
  attributed_at timestamptz not null default now()
);

create index idx_attributions_agency on reservation_attributions(agency_id);
create index idx_attributions_agent on reservation_attributions(agent_id);

-- 5. Payouts
create table payouts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  agency_id uuid not null references agencies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_trips int not null default 0,
  total_revenue numeric not null default 0,
  total_commission numeric not null default 0,
  adjustments numeric not null default 0,
  net_payout numeric not null default 0,
  method text default 'Check'
    check (method in ('ACH','Wire','Check','Cash','Other')),
  reference_number text,
  status text not null default 'draft'
    check (status in ('draft','pending','paid')),
  notes text,
  date_paid date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payouts_operator on payouts(operator_id);
create index idx_payouts_agency on payouts(agency_id);
create index idx_payouts_status on payouts(status);

-- 6. Payout Reservations (junction)
create table payout_reservations (
  payout_id uuid not null references payouts(id) on delete cascade,
  reservation_id uuid not null references commission_reservations(id) on delete cascade,
  primary key (payout_id, reservation_id)
);

-- =============================================================
-- RLS — anon read/write for V1 (same pattern as Pebble demo)
-- =============================================================

alter table agencies enable row level security;
alter table agents enable row level security;
alter table commission_reservations enable row level security;
alter table reservation_attributions enable row level security;
alter table payouts enable row level security;
alter table payout_reservations enable row level security;

-- Anon full access (sessionStorage auth, not Supabase auth)
create policy "anon_all_agencies" on agencies for all to anon using (true) with check (true);
create policy "anon_all_agents" on agents for all to anon using (true) with check (true);
create policy "anon_all_reservations" on commission_reservations for all to anon using (true) with check (true);
create policy "anon_all_attributions" on reservation_attributions for all to anon using (true) with check (true);
create policy "anon_all_payouts" on payouts for all to anon using (true) with check (true);
create policy "anon_all_payout_reservations" on payout_reservations for all to anon using (true) with check (true);

-- Auto-update updated_at (reuses function from Pebble migration)
create trigger agencies_updated_at before update on agencies
  for each row execute function update_updated_at();
create trigger payouts_updated_at before update on payouts
  for each row execute function update_updated_at();
