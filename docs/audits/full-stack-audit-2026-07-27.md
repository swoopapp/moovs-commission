# Full-stack health audit — 2026-07-27

## Status

- Scope completed: frontend, backend authorization/data integrity, and strongest
  locally achievable release gate.
- Verdict: **Release candidate ready for deployment.** The hostile-client payout
  blocker is resolved; authenticated browser QA remains a deployment smoke gate.
- Safety: local code and read-only inspection only. No production database
  writes, migrations, deployments, credentials, or customer-data probes.

## Architecture and critical flows

| Surface | Entry | Server/backend dependency | Primary risk |
| --- | --- | --- | --- |
| Admin | `/admin`, NextAuth Google | Next proxy → Lambda | privileged configuration |
| Operator session | `/{slug}` → `AuthGate` | signed `__Host-` session cookie | tenant isolation |
| Dashboard | KPIs, charts, agency table | agency/reservation/payout services | stale or misleading totals |
| Agency/agent | detail, matching, settings | agency/agent/company/contact routes | ownership and matching |
| Reservations | browse, filter, attribute | Moovs read replica + snapshots | freshness and attribution |
| Payout | three-step wizard | atomic payout endpoint | financial integrity/idempotency |
| Route rates | route-rate editor | operator config + shuttle routes | commission accuracy |
| External portal | `/portal/{token}` | server-side scoped aggregation | token isolation and balances |

Backend boundaries are Next.js route handlers and the deny-by-default proxy in
`src/app/api`, Lambda Hono routes in `lambda/src`, the Moovs read replica, and
the separate commission PostgreSQL database.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run verify:authorization` | Pass — 31 ownership/policy assertions |
| `npm run verify:payout-facts` | Pass — 14 authoritative money/snapshot assertions |
| `TZ=America/Chicago npm run verify:dates` | Pass — 6 local-calendar assertions |
| `npm run typecheck` | Pass |
| `npm run build` | Pass on Next 16.2.12; workspace-root warning resolved |
| `cd lambda && npm ci --ignore-scripts && npm run build` | Pass from tracked lockfile |
| `cd lambda && npm audit --omit=dev` | Pass — zero production advisories |
| Root `npm audit --omit=dev` | Three high advisories remain in Next/PostCSS/sharp; npm offers only an unsafe Next 9 downgrade |
| Production-mode local smoke | `/demo` 200, demo portal 200, demo portal API scoped, unauthenticated session 401 |
| Browser automation | Blocked: local Chrome exits before writing `DevToolsActivePort` |
| `next dev` | Blocked by host `EMFILE` watcher exhaustion; stopped immediately |

## Fixed findings

### AUD-001 — High — Cross-operator IDOR in the commission proxy

- Added a deny-by-default operator route policy and admin-only internal ownership
  resolver for agencies, agents, reservations, payouts, attributions, and links.
- Closed the missing `fetch-contacts` Moovs-operator check.
- Legacy financial writes and payout PATCH are unavailable to operator sessions;
  admin and trusted server-side portal aggregation remain explicitly privileged.
- Removed browser `Authorization` forwarding and added safe upstream 502/503
  responses.
- Lambda authentication now fails closed. The only bypass is explicit
  `ALLOW_UNAUTHENTICATED_LOCAL_DEV=true` outside production.
- Verification: 31 deterministic authorization assertions, root build, and Lambda
  build pass. Ownership SQL compiled but was not run against production data.

### AUD-002 — High — Partial, replayable, client-authoritative payout writes

- Replaced four client requests with `POST /payouts/create-from-trips`.
- A PostgreSQL transaction now snapshots reservations, derives attributions,
  creates the payout, and writes junction rows atomically.
- A client UUID plus transaction advisory lock makes retries idempotent.
- Rejects trips linked to another payout or agency and verifies agent membership.
- Loads agency terms and operator route rates, then recomputes commission rates,
  amounts, totals, and net payout on the server.
- The wizard submits only Moovs trip IDs and optional agent IDs—no prices,
  commission totals, or rates.
- Lambda re-fetches every submitted trip from the Moovs read replica using the
  server-held operator mapping, rejects missing/cross-operator trips, verifies
  each trip's authoritative client keys against the selected agency, snapshots
  those authoritative facts, and only then computes the payout.
- Regular-trip `total_amount` now excludes gratuity while
  `total_with_gratuity` includes it exactly once.

### AUD-003 — High — Portal outstanding balance mixed incompatible periods

- Portal statements are bounded to one 90-day window.
- Outstanding commission excludes reservations linked to paid payouts in that
  same window instead of subtracting all-time adjusted `net_payout`.
- Agent views receive agent-scoped reconciliation.

### AUD-004 — High — Unsafe commission-rate values

- Frontend route and agency settings enforce non-negative flat values and
  percentage values from 0–100.
- Lambda agency, route-rate, attribution, and atomic payout paths enforce the same
  constraints.

### AUD-005 — High — Payout candidates silently fell back to stale snapshots

- Payout trip loading now requires a successful live-Moovs fetch. Browsing can
  retain the existing snapshot fallback, but payout creation blocks with a
  persistent error and performs no mutation.

### AUD-006 — Medium — Browser auth state diverged from the signed session

- `AuthGate` now verifies the authoritative HttpOnly session and operator slug.
- Bearer query tokens are removed from the URL before asynchronous verification.
- Token/session failures have distinct, retryable states.

### AUD-007 — Medium — Date-only values rendered one day early

- Added local-calendar-safe parsing and local date-input serialization.
- Updated agency, reservation, payout, and portal displays/defaults.
- America/Chicago reproduction now preserves the intended date.

### AUD-008 — Medium — Loading failures, races, and misleading success states

- Added latest-request guards and independent retry states to dashboard/operator
  loading.
- Reservation errors no longer appear as valid empty states.
- Paid payout requires confirmation and a payment date; a synchronous guard
  prevents same-tick double submission.
- Clipboard and agency-link success messages now require successful mutations.

### AUD-009 — Medium — Responsive and accessibility defects

- Repaired mobile containment for headers, KPIs, filters, tabs, actions, and data
  tables.
- Added keyboard agency/agent navigation, named focusable table regions, labels,
  checkbox names, semantic headings, status/error announcements, meaningful
  empty states, and reduced-motion handling.
- Portal header, CSV escaping, transient errors, and retry behavior were repaired.

### AUD-010 — Security dependencies and build reproducibility

- Removed unused vulnerable `xlsx`.
- Updated Next/Auth.js lock resolution to Next 16.2.12, next-auth beta.32, and
  `@auth/core` 0.41.3, eliminating the prior critical Auth.js advisories.
- Added an explicit Turbopack root and tracked `lambda/package-lock.json`.
- Updated Lambda production dependencies; its production audit is clean.

## Worktree salvage follow-up

- Ported the useful work from the four retired Crystl worktrees without merging
  their stale auth or payout implementations.
- Dashboard stats now paginate all agencies and reservation pages, count active
  agencies independently from the visible/search page, and restrict “Paid This
  Period” to the current local calendar month.
- Dashboard, statement, and generic CSV filenames use the local calendar date;
  date-only CSV values no longer shift west of UTC.
- Added the missing skip link, agency-matching labels/loading semantics, detailed
  screen-reader chart data, semantic KPI values, stronger login error semantics,
  and explicit warnings that commission portal links are bearer access.

## Residual risks and blockers

### High / planned hardening

1. **Trusted service principals:** direct Lambda callers holding dashboard/admin
   secrets can use legacy mutation routes. Keep secrets server-only and either
   remove legacy writes or enforce the atomic invariant inside Lambda globally.
2. **Portal token storage:** agency/agent bearer tokens remain recoverable
   plaintext in commission storage. Move to hashed/revocable tokens with a
   reviewed rotation migration.

### Medium / operational

- `ensureCommissionTables()` still performs DDL/backfills on Lambda cold start.
  Replace with versioned pre-deploy migrations and readiness failure.
- Agency matching/settings search only an initial company page in some views;
  move all company selection to server-side search/pagination.
- Root production audit retains three Next/PostCSS/sharp advisories. The installed
  stable Next release remains in the advisory range; do not accept npm's proposed
  breaking downgrade to Next 9.
- No automated component/E2E suite covers authenticated cookie/token flows,
  payout SQL behavior, or responsive/screen-reader behavior.
- Local `next dev` still hits host-wide file-descriptor exhaustion, and
  `agent-browser` cannot launch Chrome on this machine. Production-mode HTTP
  smoke checks passed, but authenticated desktop/narrow browser QA remains.

## Next actions

1. Deploy the release candidate, then run authenticated operator payout smoke
   checks with a known non-production/test trip and verify the saved totals.
2. Add database-backed authorization/payout integration tests using disposable
   local PostgreSQL.
3. Complete authenticated desktop/narrow browser and screen-reader smoke tests on
   a host where Chrome launches.
4. Replace cold-start DDL and plaintext portal tokens through reviewed migrations.
