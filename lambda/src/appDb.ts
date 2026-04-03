import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export async function getAppPool(): Promise<pg.Pool> {
  if (pool) return pool;

  pool = new Pool({
    host: process.env.APP_DB_HOST || 'prototype-db.c4xzucffjf3i.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: process.env.APP_DB_NAME || 'postgres',
    user: process.env.APP_DB_USER || 'postgres',
    password: process.env.APP_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 60000,
  });

  return pool;
}

export async function appQuery(text: string, params?: any[]): Promise<pg.QueryResult> {
  const p = await getAppPool();
  return p.query(text, params);
}

/** Idempotent: creates all commission tables if they don't exist */
export async function ensureCommissionTables(): Promise<void> {
  // Helper function for updated_at triggers
  await appQuery(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // 0. Commission Operators
  await appQuery(`
    CREATE TABLE IF NOT EXISTS commission_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      moovs_operator_id TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      auth_password TEXT NOT NULL,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#1a1a2e',
      secondary_color TEXT DEFAULT '#e2e8f0',
      contact_email TEXT,
      contact_phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_commission_operators_slug ON commission_operators(slug)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_commission_operators_moovs_id ON commission_operators(moovs_operator_id)`);

  // 1. Agencies
  await appQuery(`
    CREATE TABLE IF NOT EXISTS agencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id UUID NOT NULL,
      moovs_company_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Other',
      commission_rate NUMERIC NOT NULL DEFAULT 10,
      commission_type TEXT NOT NULL DEFAULT 'percent',
      commission_base TEXT NOT NULL DEFAULT 'total_amount',
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      market_segment TEXT,
      payment_terms TEXT DEFAULT 'Net 30',
      contract_start DATE,
      contract_end DATE,
      status TEXT NOT NULL DEFAULT 'active',
      portal_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
      notes TEXT,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_agencies_operator ON agencies(operator_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_agencies_company ON agencies(moovs_company_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_agencies_portal_token ON agencies(portal_token)`);

  // 2. Agents
  await appQuery(`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'agent',
      department TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      portal_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_agents_agency ON agents(agency_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_agents_portal_token ON agents(portal_token)`);

  // 3. Commission Reservations
  await appQuery(`
    CREATE TABLE IF NOT EXISTS commission_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id UUID NOT NULL,
      moovs_trip_id TEXT NOT NULL,
      moovs_company_id TEXT,
      order_number TEXT,
      confirmation_number TEXT,
      pickup_date TIMESTAMPTZ,
      pickup_location TEXT,
      dropoff_location TEXT,
      passenger_name TEXT,
      vehicle_type TEXT,
      trip_type TEXT,
      base_rate_amount NUMERIC DEFAULT 0,
      total_amount NUMERIC DEFAULT 0,
      total_with_gratuity NUMERIC DEFAULT 0,
      trip_status TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(operator_id, moovs_trip_id)
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_reservations_operator ON commission_reservations(operator_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_reservations_company ON commission_reservations(moovs_company_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_reservations_pickup ON commission_reservations(pickup_date)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_reservations_order ON commission_reservations(order_number)`);

  // 4. Reservation Attributions
  await appQuery(`
    CREATE TABLE IF NOT EXISTS reservation_attributions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id UUID NOT NULL UNIQUE REFERENCES commission_reservations(id) ON DELETE CASCADE,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      commission_rate NUMERIC NOT NULL,
      commission_type TEXT NOT NULL,
      commission_base TEXT NOT NULL,
      commission_amount NUMERIC NOT NULL,
      attributed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_attributions_agency ON reservation_attributions(agency_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_attributions_agent ON reservation_attributions(agent_id)`);

  // 5. Payouts
  await appQuery(`
    CREATE TABLE IF NOT EXISTS payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id UUID NOT NULL,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      total_trips INT NOT NULL DEFAULT 0,
      total_revenue NUMERIC NOT NULL DEFAULT 0,
      total_commission NUMERIC NOT NULL DEFAULT 0,
      adjustments NUMERIC NOT NULL DEFAULT 0,
      net_payout NUMERIC NOT NULL DEFAULT 0,
      method TEXT DEFAULT 'Check',
      reference_number TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      date_paid DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_payouts_operator ON payouts(operator_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_payouts_agency ON payouts(agency_id)`);
  await appQuery(`CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status)`);

  // 6. Payout Reservations (junction)
  await appQuery(`
    CREATE TABLE IF NOT EXISTS payout_reservations (
      payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
      reservation_id UUID NOT NULL REFERENCES commission_reservations(id) ON DELETE CASCADE,
      PRIMARY KEY (payout_id, reservation_id)
    )
  `);

  // Triggers for updated_at
  await appQuery(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'commission_operators_updated_at') THEN
        CREATE TRIGGER commission_operators_updated_at BEFORE UPDATE ON commission_operators
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agencies_updated_at') THEN
        CREATE TRIGGER agencies_updated_at BEFORE UPDATE ON agencies
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payouts_updated_at') THEN
        CREATE TRIGGER payouts_updated_at BEFORE UPDATE ON payouts
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      END IF;
    END $$
  `);

  console.log('Commission tables ensured');
}
