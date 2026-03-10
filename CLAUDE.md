# Moovs Commissions

Standalone commission tracking & payout app for Moovs operators.

## Tech Stack
- React 19 + Vite 6 + TypeScript
- TailwindCSS 4 + shadcn/ui (Radix)
- Supabase PostgREST (shared project with Pebble: mylhldsyxkmzkksgifgt)
- Vercel deployment

## Architecture
- `/admin` — operator onboarding (hardcoded password)
- `/{slug}` — operator dashboard (sessionStorage password auth)
- `/portal/{token}` — agency portal (no auth, read-only)

## Key Patterns
- Auth: sessionStorage with `commission_auth_` prefix
- Data: raw fetch() against Supabase PostgREST (no JS SDK)
- Routing: slug-based + hash routing within operator context
- Operators: own commission_operators table (independent from Pebble's operator_branding)
- commission_operators.id = operatorId (used for Supabase queries), moovs_operator_id = Moovs UUID (used for Metabase edge functions)

## Development
```
npm install
npm run dev      # http://localhost:3000
npm run build    # typecheck + production build
npm run typecheck
```

## Supabase Tables
commission_operators, agencies, agents, commission_reservations, reservation_attributions, payouts, payout_reservations
