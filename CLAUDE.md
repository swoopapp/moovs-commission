# Moovs Commissions

Standalone commission tracking & payout app for Moovs operators.

## Tech Stack
- React 19 + Vite 6 + TypeScript
- TailwindCSS 4 + shadcn/ui (Radix)
- AWS Lambda (Hono) + API Gateway for backend
- AWS RDS PostgreSQL (prototype-db) for commission data
- AWS S3 (moovs-prototype-data) for logo storage
- Vercel deployment (frontend)

## Architecture
- `/admin` — operator onboarding (hardcoded password)
- `/{slug}` — operator dashboard (sessionStorage password auth)
- `/portal/{token}` — agency portal (no auth, read-only)
- `/lambda` — Backend API (Hono on AWS Lambda)

## Key Patterns
- Auth: sessionStorage with `commission_auth_` prefix
- Data: frontend fetch() → Lambda API → RDS PostgreSQL (no direct DB access from browser)
- Lambda connects to TWO databases: production read replica (Moovs data) and prototype-db (commission data)
- Routing: slug-based + hash routing within operator context
- Operators: own commission_operators table (independent from Pebble's operator_branding)
- commission_operators.id = operatorId (used for RDS queries), moovs_operator_id = Moovs UUID (used for Metabase edge functions)

## Development
```
npm install
npm run dev      # http://localhost:3000
npm run build    # typecheck + production build
npm run typecheck
```

## Lambda API
```
cd lambda
npm install
npm run build    # esbuild → dist/index.js
npm run deploy   # build + zip + aws lambda update-function-code
```

## Database Tables (RDS prototype-db)
commission_operators, agencies, agents, commission_reservations, reservation_attributions, payouts, payout_reservations

Tables are auto-created on Lambda cold start via ensureCommissionTables() in appDb.ts.

## API Endpoints

### Commission CRUD (prototype-db)
- `/commission-operators` — GET (list/by-slug), POST, PATCH /:id, DELETE /:id
- `/agencies` — GET (?operator_id, ?search, ?limit/offset), POST, PATCH /:id, DELETE /:id
- `/agencies/by-token/:token`, `/agencies/linked-companies/:operatorId`
- `/agents` — GET (?agency_id or ?agency_ids), POST, PATCH /:id, DELETE /:id
- `/agents/by-token/:token`
- `/commission-reservations` — GET (?operator_id, ?date_from, ?date_to)
- `/commission-reservations/by-ids?ids=X,Y,Z`
- `/attributions` — GET (?reservation_ids or ?agency_id), POST
- `/payouts` — GET (?operator_id or ?agency_id), POST, PATCH /:id
- `/payout-reservations` — GET (?payout_ids), POST
- `/upload-logo` — POST (multipart form → S3)

### Moovs Data (production read replica)
- `/fetch-operators?operator_id=UUID`
- `/fetch-reservations` — POST {operator_id, date_from?, date_to?}
- `/fetch-companies` — POST {operator_id}
- `/fetch-contacts` — POST {operator_id, company_id?}
