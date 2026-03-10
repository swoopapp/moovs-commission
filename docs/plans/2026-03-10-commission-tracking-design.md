# Moovs Commissions — Design Document

**Date:** 2026-03-10
**Status:** Approved
**Shaped by:** Amir + Claude
**Designed by:** Nate + Claude
**Shaping doc:** moovs-factory/shaping/agent-commission-payouts.md
**Prototype:** https://prototypes-weld.vercel.app/commission-dashboard-prototype.html

---

## Problem

Operators (Todd/Gearfusion, Chris/AMA, Roberts Hawaii) manually track agent/concierge commissions in spreadsheets. Agents call constantly asking what they're owed. Lost attributions = lost agents = lost bookings.

## Solution

Standalone web app with two faces:
1. **Operator Dashboard** — manage agencies, sync trips, attribute bookings, calculate commissions, create payouts
2. **Agency Portal** — shareable token links where agencies see earnings without calling the operator

## Architecture

- **Frontend:** React 19 + Vite 6 + TypeScript + TailwindCSS + shadcn/ui
- **Backend:** Supabase (existing project `mylhldsyxkmzkksgifgt`, shared with Pebble)
- **Data source:** Metabase API via Supabase Edge Functions (same pattern as Pebble)
- **Deploy:** Vercel
- **Operator identity:** Reuses Pebble's `operator_branding` table and edge functions (same slugs, same branding)

### Access Levels

| Route | Auth | Purpose |
|-------|------|---------|
| `/admin` | Hardcoded password | Operator onboarding (reuses Pebble pattern) |
| `/{slug}` | SessionStorage + operator password | Operator dashboard |
| `/portal/{token}` | None (token-based, read-only) | Agency/agent portal |

### Data Flow

```
Operator clicks "Sync Trips"
  → Supabase Edge Function
    → Metabase API (completed trips by operator_id + date range)
      → Upsert into reservations table
        → Auto-attribute by moovs_company_id → agency mapping
          → Calculate commission (agency rate x configured base amount)
```

### Trip Sync Strategy

- Default: pull completed trips since last sync timestamp
- Override: operator can pick custom date range for backfills
- V1: manual button click. Upgrade path: Supabase cron → Moovs webhook

## Database Schema

All tables in existing Supabase project. `operator_branding` already exists (shared with Pebble).

### `agencies`
- `id` uuid PK
- `operator_id` uuid (FK → operator_branding)
- `moovs_company_id` text (link to Moovs company)
- `name` text
- `type` enum (Hotel/DMC/Travel Agent/OTA/Concierge/Other)
- `commission_rate` numeric
- `commission_type` enum (percent/flat)
- `commission_base` enum (base_rate/total_amount/total_with_gratuity)
- `contact_name`, `contact_email`, `contact_phone` text
- `payment_terms` text
- `contract_start`, `contract_end` date
- `status` enum (active/inactive/archived)
- `portal_token` text unique (GM-level access)
- `created_at`, `updated_at` timestamptz

### `agents`
- `id` uuid PK
- `agency_id` uuid (FK → agencies, CASCADE)
- `name` text
- `email`, `phone` text
- `role` enum (agent/gm)
- `department` text
- `status` enum (active/inactive)
- `portal_token` text unique (agent-level access)
- `created_at` timestamptz

### `reservations`
- `id` uuid PK
- `operator_id` uuid
- `moovs_request_id` text
- `moovs_trip_id` text unique
- `moovs_company_id` text
- `order_number` text
- `confirmation_number` text
- `pickup_date` timestamptz
- `pickup_location`, `dropoff_location` text
- `passenger_name` text
- `vehicle_type` text
- `base_rate_amount`, `total_amount`, `total_with_gratuity` numeric
- `trip_status` text
- `synced_at` timestamptz

### `reservation_attributions`
- `id` uuid PK
- `reservation_id` uuid unique (FK → reservations, CASCADE)
- `agency_id` uuid (FK → agencies)
- `agent_id` uuid nullable (FK → agents)
- `commission_rate` numeric (snapshot)
- `commission_type` enum (percent/flat)
- `commission_base` enum (snapshot)
- `commission_amount` numeric (calculated and stored)
- `attributed_at` timestamptz

### `payouts`
- `id` uuid PK
- `operator_id` uuid
- `agency_id` uuid (FK → agencies)
- `period_start`, `period_end` date
- `total_trips` int
- `total_revenue` numeric
- `total_commission` numeric
- `adjustments` numeric default 0
- `net_payout` numeric
- `method` enum (ACH/Wire/Check/Cash/Other)
- `reference_number` text
- `status` enum (draft/pending/paid)
- `notes` text
- `created_at`, `updated_at` timestamptz

### `payout_reservations`
- `payout_id` uuid (FK → payouts, CASCADE)
- `reservation_id` uuid (FK → reservations)
- PK (payout_id, reservation_id)

### RLS Strategy
- Operator auth: application-layer (sessionStorage password, not Supabase auth)
- Portal access: Edge function validates token → returns scoped data
- GM token: all agency data
- Agent token: only that agent's attributions and payout shares

## Key Screens

### Operator Dashboard (`/{slug}`)
- KPI cards: Total Owed / Total Paid / Active Agencies / Pending Payouts
- Agency table with search/filter → click row → Agency Detail
- "Sync Trips" button (since last sync default, date picker override)
- "+ Add Agency" button

### Agency Detail (4 tabs)
1. **Reservations** — attributed trips, filter by agent/status/date
2. **Agents** — agent list with booking counts + commission totals, add/edit agents
3. **Payouts** — payout history, "+ Create Payout" → Payout Wizard
4. **Settings** — commission rate/type/base, contract dates, payment terms, portal links

### Create Agency (2-step)
1. Search Moovs companies → select → auto-fill contact info → pick agency type
2. Commission config (rate, type, base) → payment terms → contract dates → create

### Payout Wizard (3-step)
1. Date range → preview trip count + commission total
2. Trip table with checkboxes → adjustments field → running total
3. Payment method → reference number → "Create Payout" or "Mark as Paid"

### Agency Portal (`/portal/{token}`)
- GM token: all bookings, all agents' earnings, payout history, outstanding balance
- Agent token: own bookings only, own earnings, own payout share

## Commission Engine

- **Snapshot at attribution time** — commission amount calculated and stored, not recalculated
- **Formula:** `commission_rate x trip[commission_base]` per agency configuration
- **Types:** percentage (%) or flat dollar ($) per agency
- **Base amount configurable per agency:** base_rate, total_amount, or total_with_gratuity
- **Adjustments:** flat amount on payouts for post-attribution corrections (cancellations, disputes, bonuses)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Standalone app | Yes | No changes to 4 Moovs repos, ship fast |
| Same Supabase project as Pebble | Yes | Shared operator_branding, one admin panel |
| Metabase for trip data | Yes | Proven in Pebble, pivot to GraphQL later |
| Commission base configurable | Per agency | Full flexibility, set once per agency |
| Sync default | Since last sync | Smart default + date picker override for backfills |
| Portal auth | Two token types (GM/agent) | Scoped read-only access, no login accounts |
| Commission snapshot | At attribution time | Avoids recalculation bugs, mirrors Moovs driver payouts |

## No-Gos

- No payment processing (track only, no Stripe)
- No Moovs repo changes
- No agent login accounts (token links only)
- No per-trip commission overrides (use adjustments)
- No mobile app (responsive web only)
