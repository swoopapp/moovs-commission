# Moovs Commissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone commission tracking & payout web app for Moovs operators, with an agency portal for agents to view earnings.

**Architecture:** Vite + React 19 + TypeScript SPA deployed to Vercel, backed by existing Supabase project (shared with Pebble). Reuses Pebble's operator_branding table, admin panel pattern, slug-based routing, sessionStorage auth, and Metabase edge functions. Three access levels: /admin (onboarding), /{slug} (operator dashboard), /portal/{token} (agency/agent read-only).

**Tech Stack:** React 19, Vite 6, TypeScript 5.7, TailwindCSS 4, shadcn/ui (Radix), Supabase PostgREST + Edge Functions, Metabase API, Vercel.

**Design doc:** `docs/plans/2026-03-10-commission-tracking-design.md`
**Prototype:** https://prototypes-weld.vercel.app/commission-dashboard-prototype.html

---

## Task 1: Project Scaffolding

**Goal:** Working Vite + React 19 app that builds and deploys, with all dependencies and config files matching Pebble's patterns.

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vercel.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/globals.css`
- Create: `src/config/env.ts`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize package.json**

```json
{
  "name": "moovs-commissions",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.12.0" },
  "dependencies": {
    "@radix-ui/react-accordion": "^1.2.3",
    "@radix-ui/react-alert-dialog": "^1.1.6",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-progress": "^1.1.2",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "@radix-ui/react-toggle": "^1.1.2",
    "@radix-ui/react-toggle-group": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@tailwindcss/vite": "^4.2.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "*",
    "lucide-react": "^0.563.0",
    "react": "^19.2.4",
    "react-day-picker": "^9.13.0",
    "react-dom": "^19.2.4",
    "react-hook-form": "^7.55.0",
    "recharts": "^3.7.0",
    "sonner": "^2.0.3",
    "tailwind-merge": "*",
    "tailwindcss": "^4.2.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react-swc": "^4.2.3",
    "typescript": "^5.7.0",
    "vite": "^6.3.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 2: Copy config files from Pebble**

Copy `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vercel.json` from Pebble — only change the `@` alias to point to `./src`.

**Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Commissions — Powered by Moovs</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 4: Create src/config/env.ts**

Same pattern as Pebble but add commission-specific edge function URLs:

```typescript
interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultOperatorId: string;
}

function getEnvVar(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value && fallback === undefined) {
    console.warn(`Missing environment variable: ${key}`);
    return '';
  }
  return value || fallback || '';
}

export const config: AppConfig = {
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL', 'https://mylhldsyxkmzkksgifgt.supabase.co'),
  supabaseAnonKey: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  defaultOperatorId: getEnvVar('VITE_DEFAULT_OPERATOR_ID'),
};

export const EDGE_FUNCTION_URLS = {
  fetchReservations: `${config.supabaseUrl}/functions/v1/fetch-reservations`,
  fetchOperators: `${config.supabaseUrl}/functions/v1/fetch-operators`,
} as const;
```

**Step 5: Create src/main.tsx with slug routing**

Same pattern as Pebble: `getSlugFromPath()`, `/admin` → AdminPanel, `/{slug}` → OperatorProvider → App, `/portal/{token}` → PortalView.

**Step 6: Create minimal src/App.tsx**

Placeholder with hash-based routing skeleton.

**Step 7: Create src/styles/globals.css**

Copy from Pebble — Tailwind imports + CSS custom properties for theming.

**Step 8: npm install, verify `npm run dev` starts, verify `npm run build` succeeds**

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: project scaffolding — Vite + React 19 + Tailwind + Supabase config"
```

---

## Task 2: Copy UI Components from Pebble

**Goal:** Port all shared shadcn/ui components so we have the full design system ready.

**Files:**
- Copy: `src/components/ui/*` (from Pebble)
- Copy: `src/lib/utils.ts` (cn helper)
- Copy: `src/components/figma/ImageWithFallback.tsx`
- Copy: `src/assets/moovs-logo.png`

**Step 1: Copy Pebble's `src/components/ui/` directory wholesale**

All 70+ shadcn/ui components — button, card, dialog, tabs, table, input, select, badge, separator, scroll-area, dropdown-menu, popover, checkbox, switch, label, tooltip, progress, avatar, accordion, sheet, etc.

**Step 2: Copy `src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

**Step 3: Copy moovs-logo.png asset**

**Step 4: Verify build still passes**

```bash
npm run typecheck
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: port shadcn/ui component library from Pebble"
```

---

## Task 3: Auth + Operator Context + Admin Panel

**Goal:** Working auth flow — /admin with hardcoded password, /{slug} with operator password, operator branding loaded from Supabase.

**Files:**
- Create: `src/services/authService.ts` (copy from Pebble, change key prefix to `commission_auth_`)
- Create: `src/services/operatorBrandingService.ts` (copy from Pebble)
- Create: `src/services/moovsOperatorService.ts` (copy from Pebble)
- Create: `src/contexts/OperatorContext.tsx` (copy from Pebble, change title to "Commissions")
- Create: `src/types/operatorBranding.ts` (copy from Pebble)
- Create: `src/components/auth/AuthGate.tsx` (copy from Pebble)
- Create: `src/components/auth/LoginPage.tsx` (copy from Pebble, update subtitle to "Commission Tracking")
- Create: `src/components/admin/AdminLoginPage.tsx` (copy from Pebble)
- Create: `src/components/admin/AdminPanel.tsx` (copy from Pebble)
- Create: `src/components/NotFoundPage.tsx` (copy from Pebble)

**Step 1: Copy all auth/operator files from Pebble**

Change only:
- `authService.ts`: key prefix `commission_auth_` (so sessions don't clash with Pebble)
- `OperatorContext.tsx`: page title `"${name} — Commissions"`
- `LoginPage.tsx`: subtitle from "Reservation Manifest" to "Commission Tracking"
- `AdminPanel.tsx`: header from "Manifest Admin" to "Commissions Admin"

**Step 2: Update src/main.tsx to wire up routing**

```typescript
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import App from './App.tsx';
import { OperatorProvider } from './contexts/OperatorContext.tsx';
import { NotFoundPage } from './components/NotFoundPage.tsx';
import { AdminPanel } from './components/admin/AdminPanel.tsx';
import './styles/globals.css';

function getSlugFromPath(): string {
  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  return path.split('/')[0] || '';
}

function Root() {
  const [notFound, setNotFound] = useState(false);
  const slug = getSlugFromPath();

  if (!slug) return <NotFoundPage />;
  if (slug === 'admin') return <AdminPanel />;
  if (slug === 'portal') {
    // Portal routes handled separately — Task 9
    return <div>Portal (coming soon)</div>;
  }
  if (notFound) return <NotFoundPage />;

  return (
    <OperatorProvider slug={slug} onNotFound={() => setNotFound(true)}>
      <App />
    </OperatorProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
```

**Step 3: Verify /admin loads with password gate, /{slug} loads operator branding**

```bash
npm run dev
# Visit http://localhost:3000/admin → should see admin login
# Visit http://localhost:3000/{existing-pebble-slug} → should see operator login
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: auth flow — admin panel, operator login, branding context"
```

---

## Task 4: Supabase Migration — Commission Tables

**Goal:** Create all 6 commission tables in the existing Supabase project with proper indexes and RLS.

**Files:**
- Create: `supabase/migrations/20260310000000_create_commission_tables.sql`

**Step 1: Write migration**

```sql
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

-- Auto-update updated_at
create trigger agencies_updated_at before update on agencies
  for each row execute function update_updated_at();
create trigger payouts_updated_at before update on payouts
  for each row execute function update_updated_at();
```

**Step 2: Run migration against Supabase**

Apply via Supabase dashboard SQL editor or `supabase db push`.

**Step 3: Verify tables exist**

```bash
# Use Supabase dashboard or:
curl -s "${SUPABASE_URL}/rest/v1/agencies?limit=0" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
# Should return [] (empty array, not error)
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: Supabase migration — commission tables with RLS"
```

---

## Task 5: Service Layer — Agency & Agent CRUD

**Goal:** Supabase PostgREST service for agencies and agents (same pattern as Pebble's operatorBrandingService).

**Files:**
- Create: `src/types/commission.ts`
- Create: `src/services/agencyService.ts`
- Create: `src/services/agentService.ts`

**Step 1: Create types**

```typescript
// src/types/commission.ts

export type AgencyType = 'Hotel' | 'DMC' | 'Travel Agent' | 'OTA' | 'Concierge' | 'Other';
export type CommissionType = 'percent' | 'flat';
export type CommissionBase = 'base_rate' | 'total_amount' | 'total_with_gratuity';
export type AgencyStatus = 'active' | 'suspended' | 'archived';
export type AgentRole = 'agent' | 'gm';
export type PayoutMethod = 'ACH' | 'Wire' | 'Check' | 'Cash' | 'Other';
export type PayoutStatus = 'draft' | 'pending' | 'paid';

export interface Agency {
  id: string;
  operator_id: string;
  moovs_company_id: string | null;
  name: string;
  type: AgencyType;
  commission_rate: number;
  commission_type: CommissionType;
  commission_base: CommissionBase;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  payment_terms: string | null;
  contract_start: string | null;
  contract_end: string | null;
  status: AgencyStatus;
  portal_token: string;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  agency_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: AgentRole;
  department: string | null;
  status: 'active' | 'inactive';
  portal_token: string;
  created_at: string;
}

export interface Reservation {
  id: string;
  operator_id: string;
  moovs_trip_id: string;
  moovs_company_id: string | null;
  order_number: string | null;
  confirmation_number: string | null;
  pickup_date: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  passenger_name: string | null;
  vehicle_type: string | null;
  trip_type: string | null;
  base_rate_amount: number;
  total_amount: number;
  total_with_gratuity: number;
  trip_status: string | null;
  synced_at: string;
}

export interface ReservationAttribution {
  id: string;
  reservation_id: string;
  agency_id: string;
  agent_id: string | null;
  commission_rate: number;
  commission_type: CommissionType;
  commission_base: CommissionBase;
  commission_amount: number;
  attributed_at: string;
}

export interface Payout {
  id: string;
  operator_id: string;
  agency_id: string;
  period_start: string;
  period_end: string;
  total_trips: number;
  total_revenue: number;
  total_commission: number;
  adjustments: number;
  net_payout: number;
  method: PayoutMethod;
  reference_number: string | null;
  status: PayoutStatus;
  notes: string | null;
  date_paid: string | null;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Create agencyService.ts**

Follow Pebble's operatorBrandingService pattern — raw `fetch()` against Supabase REST API with `apikey` + `Authorization` headers. CRUD functions: `fetchAgencies(operatorId)`, `fetchAgencyByToken(token)`, `createAgency(data)`, `updateAgency(id, updates)`, `deleteAgency(id)`.

**Step 3: Create agentService.ts**

Same pattern: `fetchAgents(agencyId)`, `fetchAgentByToken(token)`, `createAgent(data)`, `updateAgent(id, updates)`, `deleteAgent(id)`.

**Step 4: Verify with manual test**

Create a test agency via curl or Supabase dashboard, then verify `fetchAgencies` returns it in dev.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: agency + agent CRUD service layer"
```

---

## Task 6: Trip Sync Service + Edge Function Adaptation

**Goal:** Service that calls existing Pebble `fetch-reservations` edge function, transforms results, and upserts into `commission_reservations` table. Auto-attributes by company_id.

**Files:**
- Create: `src/services/tripSyncService.ts`
- Create: `src/services/attributionService.ts`
- Create: `src/services/reservationService.ts`

**Step 1: Create reservationService.ts**

PostgREST CRUD for `commission_reservations` table: `fetchReservations(operatorId, filters?)`, `upsertReservations(reservations[])`.

**Step 2: Create tripSyncService.ts**

Calls Pebble's existing `fetch-reservations` edge function with operator_id + date range. Transforms Metabase response into `commission_reservations` rows. Key fields to extract:
- `moovs_trip_id` ← "Trip ID"
- `moovs_company_id` ← "Company ID"
- `order_number` ← "Order Number"
- `confirmation_number` ← "Confirmation Number"
- `pickup_date` ← "Pickup Date Time"
- `pickup_location` ← "Pickup Address"
- `dropoff_location` ← "Dropoff Address"
- `passenger_name` ← "Passenger Contact Full Name"
- `vehicle_type` ← "Vehicle Name"
- `trip_type` ← "Trip Type"
- `base_rate_amount` ← "Base Rate"
- `total_amount` ← "Total Amount ($)"
- `total_with_gratuity` ← "Total Amount ($)" + "Driver Gratuity Amount"

Filter: only completed trips (`STATUS_SLUG` = completed/done). Upsert on `(operator_id, moovs_trip_id)`.

```typescript
// src/services/tripSyncService.ts

import { config, EDGE_FUNCTION_URLS } from '../config/env';
import type { Reservation } from '../types/commission';

interface SyncOptions {
  operatorId: string;
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;
}

interface RawReservation {
  [key: string]: unknown;
}

function transformToReservation(raw: RawReservation, operatorId: string): Reservation {
  const totalAmount = Number(raw['Total Amount ($)']) || 0;
  const gratuity = Number(raw['Driver Gratuity Amount']) || 0;

  return {
    id: crypto.randomUUID(),
    operator_id: operatorId,
    moovs_trip_id: String(raw['Trip ID'] || ''),
    moovs_company_id: raw['Company ID'] ? String(raw['Company ID']) : null,
    order_number: raw['Order Number'] ? String(raw['Order Number']) : null,
    confirmation_number: raw['Confirmation Number'] ? String(raw['Confirmation Number']) : null,
    pickup_date: raw['Pickup Date Time'] ? String(raw['Pickup Date Time']) : null,
    pickup_location: raw['Pickup Address'] ? String(raw['Pickup Address']) : null,
    dropoff_location: raw['Dropoff Address'] ? String(raw['Dropoff Address']) : null,
    passenger_name: raw['Passenger Contact Full Name'] ? String(raw['Passenger Contact Full Name']) : null,
    vehicle_type: raw['Vehicle Name'] ? String(raw['Vehicle Name']) : null,
    trip_type: raw['Trip Type'] ? String(raw['Trip Type']) : null,
    base_rate_amount: Number(raw['Base Rate']) || 0,
    total_amount: totalAmount,
    total_with_gratuity: totalAmount + gratuity,
    trip_status: raw['Status Slug'] ? String(raw['Status Slug']) : null,
    synced_at: new Date().toISOString(),
  };
}

export async function syncTrips(options: SyncOptions): Promise<{ synced: number; attributed: number }> {
  const { operatorId, dateFrom, dateTo } = options;

  // 1. Fetch from Metabase via edge function
  const body: Record<string, unknown> = { operator_id: operatorId };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;

  const res = await fetch(EDGE_FUNCTION_URLS.fetchReservations, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  const data = await res.json();
  const rawReservations: RawReservation[] = data.reservations || [];

  // 2. Transform + upsert into commission_reservations
  const reservations = rawReservations.map(r => transformToReservation(r, operatorId));
  // Upsert via PostgREST (on conflict operator_id, moovs_trip_id)
  // ... (uses reservationService.upsertReservations)

  return { synced: reservations.length, attributed: 0 };
}
```

**Step 3: Create attributionService.ts**

Auto-attribution logic: for each unattributed reservation, match `moovs_company_id` to `agencies.moovs_company_id`. If match found, create attribution with agency's commission config snapshot.

```typescript
export function calculateCommission(
  reservation: Reservation,
  agency: Agency,
): number {
  if (agency.commission_type === 'flat') return agency.commission_rate;

  const rate = agency.commission_rate / 100;
  switch (agency.commission_base) {
    case 'base_rate': return reservation.base_rate_amount * rate;
    case 'total_amount': return reservation.total_amount * rate;
    case 'total_with_gratuity': return reservation.total_with_gratuity * rate;
    default: return reservation.total_amount * rate;
  }
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: trip sync from Metabase + auto-attribution engine"
```

---

## Task 7: Operator Dashboard — Layout + KPI Cards

**Goal:** Main operator dashboard matching prototype: header, sidebar nav, KPI cards, agency table.

**Files:**
- Create: `src/components/layout/AppHeader.tsx`
- Create: `src/components/layout/Sidebar.tsx` (optional — prototype shows minimal nav)
- Create: `src/components/dashboard/DashboardView.tsx`
- Create: `src/components/dashboard/KPICards.tsx`
- Create: `src/components/dashboard/AgencyTable.tsx`
- Create: `src/components/dashboard/CommissionChart.tsx`
- Create: `src/services/dashboardService.ts`
- Modify: `src/App.tsx` — wire up hash routing

**Step 1: Create AppHeader**

Match prototype: Moovs logo + "Commission Tracking", operator name, sync button, user avatar.

**Step 2: Create KPICards component**

4 cards from prototype:
- Total Commission Owed (red/orange accent)
- Paid This Period (green accent)
- Active Agencies (blue accent)
- Pending Payouts (yellow accent)

Fetch from Supabase: sum commission_amount where unpaid, sum net_payout where paid in current period, count active agencies, count payouts where status=draft/pending.

**Step 3: Create AgencyTable component**

Columns from prototype: Agency, Type (badge), Rate, Bookings, Revenue, Earned, Paid, Outstanding, Status (badge), Actions.

Search input + Type filter dropdown + "+ Add Agency" button.

Click row → navigate to `#/agency/{id}`.

**Step 4: Create CommissionChart (nice-to-have)**

Recharts stacked bar chart — last 6 months by top 5 agencies. Can be a stretch goal.

**Step 5: Wire up App.tsx hash routing**

```typescript
// src/App.tsx
function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Parse route
  if (route.startsWith('#/agency/')) return <AgencyDetailView id={...} />;
  return <DashboardView />;
}
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: operator dashboard — KPI cards, agency table, layout"
```

---

## Task 8: Agency Detail View — 4 Tabs

**Goal:** Full agency detail page with Reservations, Agents, Payouts, and Settings tabs matching prototype.

**Files:**
- Create: `src/components/agency/AgencyDetailView.tsx`
- Create: `src/components/agency/AgencyHeader.tsx`
- Create: `src/components/agency/ReservationsTab.tsx`
- Create: `src/components/agency/AgentsTab.tsx`
- Create: `src/components/agency/PayoutsTab.tsx`
- Create: `src/components/agency/SettingsTab.tsx`
- Create: `src/components/agency/CreateAgencyDialog.tsx`
- Create: `src/components/agency/AddAgentDialog.tsx`

**Step 1: AgencyDetailView with tabs**

Header section: agency name, type badge, status badge, contact info, mini KPIs (bookings, revenue, earned, outstanding).

Radix Tabs component with 4 tabs.

**Step 2: ReservationsTab**

Table with columns: Order #, Date, Passenger, Agent, Trip Type, Route, Revenue, Commission, Status.
Filter by agent dropdown + status dropdown.
Data: join `commission_reservations` + `reservation_attributions` for this agency.

**Step 3: AgentsTab**

Card grid from prototype: avatar initials, name, role, department, email, phone, stats (bookings/revenue/commission).
"+ Add Agent" button → AddAgentDialog.
Click agent card → filter ReservationsTab by that agent.

**Step 4: PayoutsTab**

Table: Period, Trips, Revenue, Commission, Adjustments, Net Payout, Method, Ref #, Status, Date Paid.
"+ Create Payout" button → Payout Wizard (Task 9).

**Step 5: SettingsTab**

From prototype:
- Left: Commission rate/type/base config, payment terms, contract dates, notes
- Right: Portal link (copy button), agency status toggle, danger zone (delete)

Portal link format: `{window.location.origin}/portal/{agency.portal_token}`

**Step 6: CreateAgencyDialog (2-step wizard)**

Step 1: Company search (fetches from Metabase or Supabase companies), agency type selector, auto-populated contact fields.
Step 2: Commission config (rate, type, base), payment terms, contract dates, notes.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: agency detail — reservations, agents, payouts, settings tabs"
```

---

## Task 9: Payout Wizard

**Goal:** 3-step payout creation matching prototype.

**Files:**
- Create: `src/components/payout/PayoutWizard.tsx`
- Create: `src/components/payout/DateRangeStep.tsx`
- Create: `src/components/payout/TripSelectionStep.tsx`
- Create: `src/components/payout/PaymentDetailsStep.tsx`
- Create: `src/services/payoutService.ts`

**Step 1: PayoutWizard container**

Dialog with step indicator (1/2/3), back/next buttons, state management across steps.

**Step 2: DateRangeStep**

From/To date inputs. "Load Trips" button fetches unpaid attributed reservations for this agency in range. Shows trip count + total commission preview.

**Step 3: TripSelectionStep**

Scrollable table with checkboxes. Columns: Checkbox, Order #, Date, Passenger, Revenue, Commission. Select all. Running totals: trips, revenue, commission. Adjustments input field. Net payout = total_commission + adjustments.

**Step 4: PaymentDetailsStep**

Payment method dropdown (ACH/Wire/Check/Cash/Other), reference number, payment date, notes. Summary card showing final amounts. Two buttons: "Save as Draft" (status=draft) or "Mark as Paid" (status=paid).

**Step 5: payoutService.ts**

PostgREST CRUD: `fetchPayouts(agencyId)`, `createPayout(data)`, `updatePayoutStatus(id, status)`. Creating a payout also inserts `payout_reservations` junction rows.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: 3-step payout wizard with trip selection"
```

---

## Task 10: Sync Trips UI + Attribution View

**Goal:** "Sync Trips" button on dashboard, attribution confirmation UI.

**Files:**
- Create: `src/components/sync/SyncTripsDialog.tsx`
- Create: `src/components/sync/AttributionReview.tsx`
- Modify: `src/components/dashboard/DashboardView.tsx` — add sync button

**Step 1: SyncTripsDialog**

Button in dashboard header. On click, opens dialog:
- Default: "Sync trips since last sync" (shows last_synced_at timestamp)
- Override: date range picker
- "Sync" button → calls `syncTrips()` → shows progress → shows results

**Step 2: AttributionReview**

After sync, show: X trips synced, Y auto-attributed, Z need manual attribution.
For unmatched trips: table with company name, allow operator to select agency from dropdown.
"Confirm Attributions" button → creates attribution records.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: trip sync UI + manual attribution review"
```

---

## Task 11: Agency Portal

**Goal:** Read-only portal accessed via `/portal/{token}` — GM sees all, agent sees own data.

**Files:**
- Create: `src/components/portal/PortalView.tsx`
- Create: `src/components/portal/PortalHeader.tsx`
- Create: `src/components/portal/PortalKPIs.tsx`
- Create: `src/components/portal/PortalReservations.tsx`
- Create: `src/components/portal/PortalStatements.tsx`
- Create: `src/services/portalService.ts`
- Modify: `src/main.tsx` — wire up `/portal/{token}` route

**Step 1: portalService.ts**

Two lookup functions:
- `fetchPortalByAgencyToken(token)` → returns agency + all agents + all attributions + payouts (GM view)
- `fetchPortalByAgentToken(token)` → returns agency + single agent + agent's attributions only

Logic: first try `agencies.portal_token`, then try `agents.portal_token`. Determines GM vs Agent view.

**Step 2: PortalView container**

No auth gate. Fetches data by token on mount. Shows agency branding (name, type). Role indicator (GM/Agent).

**Step 3: PortalKPIs**

From prototype: Total Bookings, Revenue Generated, Commission Earned. Scoped to GM (all) or Agent (own).

**Step 4: PortalReservations table**

Columns: Date, Passenger, Trip Type, Route, Revenue, Commission, Status. Read-only.

**Step 5: PortalStatements section**

Two-column grid:
- Outstanding Balance card (prominent number, payment terms, CSV export button)
- Recent Payouts table (Period, Trips, Net Payout, Method, Status, Date)

**Step 6: Update main.tsx routing**

```typescript
if (slug === 'portal') {
  const token = window.location.pathname.split('/')[2] || '';
  return <PortalView token={token} />;
}
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: agency portal — token-based read-only view"
```

---

## Task 12: CSV Export + Polish

**Goal:** CSV export for payouts/statements, final polish, deploy.

**Files:**
- Create: `src/utils/csvExport.ts`
- Modify: various components for polish

**Step 1: CSV export utility**

Export payout details as CSV (trips included). Export commission statement (all attributions for an agency in a date range).

**Step 2: UI polish pass**

- Loading states (skeleton loaders)
- Empty states (no agencies yet, no trips synced)
- Toast notifications (sonner) for sync complete, payout created, etc.
- Error handling (failed sync, API errors)
- Responsive layout for tablets

**Step 3: Deploy to Vercel**

```bash
# Create GitHub repo
gh repo create theswoopapp/moovs-commissions --private
git remote add origin git@github.com:theswoopapp/moovs-commissions.git
git push -u origin main
# Connect to Vercel via dashboard or CLI
```

**Step 4: Final commit**

```bash
git add -A && git commit -m "feat: CSV export, polish, production deploy"
```

---

## Execution Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Project scaffolding | — |
| 2 | UI components from Pebble | 1 |
| 3 | Auth + Admin + Operator context | 2 |
| 4 | Supabase migration | — (parallel with 1-3) |
| 5 | Agency/Agent CRUD services | 4 |
| 6 | Trip sync + attribution engine | 4, 5 |
| 7 | Operator dashboard UI | 3, 5 |
| 8 | Agency detail (4 tabs) | 5, 6, 7 |
| 9 | Payout wizard | 5, 8 |
| 10 | Sync UI + attribution review | 6, 7 |
| 11 | Agency portal | 5, 8 |
| 12 | CSV export + polish + deploy | all |

**Parallelizable:** Tasks 1-3 (scaffolding) can run parallel with Task 4 (migration). Tasks 7-8 can partially overlap. Task 11 (portal) is independent once services exist.
