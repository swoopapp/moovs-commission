# Commission workflow — local implementation and verification

2026-10-05. **This report records local acceptance before release.** Production release was subsequently explicitly approved under `COS-COMMISSIONS-20261005-01`; see [release runbook](production-release-runbook.md) and the Nate OS production approval note for current execution evidence. Local testing itself did not deploy or change production; no funds movement/customer messages are authorized.

## Implemented

1. Booking calculation detail with Company/agency, Booking Contact/agent, and Passenger shown separately. Stable contact-ID matching takes priority; ambiguous matches cannot be approved. Operator deep links encode raw `Request:<UUID>` / `Trip:<UUID>` with Base64 and URL escaping, matching the read-only manifest reference. Confirmation numbers are not entity IDs. Shared `shuttle_booking` records are not miscast as Request IDs.
2. Agency-specific dated shared-shuttle route/service and private one-way-transfer exceptions. Specific route wins over service default, then existing fixed/standard logic. Overlapping same-scope rules are rejected. Preview explicitly covers loaded bookings, not all history. Save uses optimistic concurrency plus an audit reason.
3. Approved/held/rejected reviews with reasons, optional expected dates and append-only events. Current authoritative Moovs facts and rules are fingerprinted; pricing/status/refund/identity/mapping changes require re-review. Passenger identity never determines partner credit.
4. Cross-agency period loading and independent retry-safe settlement preparation. Only currently eligible approvals are included. Snapshots freeze calculation facts; real multipage PDF and CSV exports use those snapshots. External payment records do not invoke providers. Unpaid records can be voided without deleting their snapshots/links; paid records cannot be voided or rewritten. Paid-statement corrections use the signed commission ledger below, with explicit selection into a later settlement—not automatic customer refund proration.
5. Partner-facing calculation/state explanations and scoped questions/resolutions. Token ownership is resolved server-side; agent questions and statement lines stay agent-scoped. Per-partner rate limiting and idempotent question submission. Operator request IDs, passenger-capability URLs, review fingerprints and private operator notes are excluded from public payloads. No email delivery.

Additional fixes: all linked agency client keys are included (not only the primary key); unmatched agency pages never query all operator bookings; end-date filtering includes the entire chosen day but not next-day midnight; NUMERIC/date values are normalized where domain calculations need them.

## Passed gates

- Root `npm run typecheck` and `npm run build`.
- Lambda `npm run typecheck` and `npm run build`.
- Existing verification: authorization 33, dates 104 across four runtime zones, authoritative facts 14, batching 4, concurrency 3 assertions.
- Workspace verification: 14 assertions for six sections and public/operator theme isolation.
- `npm run verify:workflow`: 76 assertions covering IDs/links, rule precedence/validation, contact matching, lifecycle invalidation, immutable export/public scoping, CSV formula escaping and proxy authorization.
- Lambda `npm run verify:workflow-integration`: 132 assertions against a disposable PostgreSQL instance on loopback, with synthetic app/Moovs fixtures. Exercises additive migration twice, actual SQL queries/transactions, stale/invalid/foreign approvals, server-calculated settlement amounts, duplicate/idempotent preparation, external-payment recording/replay, immutable snapshots, void/replacement lifecycle, rules concurrency, agency ambiguity, partner isolation, question resolution/idempotency/rate limiting, refund eligibility and inclusive end dates. No AWS/provider requests. Test fixture write/delete operations are local only.
- Actual PDF parsed with `pdfinfo` / `pdftotext`: four pages, booking QA-30 and final total retained. Legacy payouts without snapshots do not get fabricated detailed statements.
- `git diff --check`.

## Browser verification

Read-only local demo at `http://127.0.0.1:3107/demo`. Current fixtures track the previous calendar month and contain sample reviews, statements and questions.

- Desktop review: 36 bookings across six agencies; detail modal, separated identities, calculation base/rate, review/history; demo write actions disabled.
- Month-end screen: eligible/exception/already-allocated counts and snapshot records; preparation/external-payment/void actions disabled in demo.
- Agency rules: add draft exception, preview loaded-booking impact, save disabled in demo.
- Public portal: booking opens calculation/question modal; no operator link; no operator workspace body theme; demo question writes disabled; public API payload omits private IDs/fingerprints.
- 390px mobile: review table scrolls within container; detail dialog scrolls, Escape closes; partner/review pages have no document horizontal overflow.
- No browser console errors or warnings in the final Overview/month-end/partner checks. Recharts initial dimensions are explicit.
- Screenshots in ignored `output/qa/`: `commission-review-desktop.png`, `commission-detail-desktop.png`, `month-end-settlement-desktop.png`, `agency-rules-desktop.png`, `partner-commission-detail.png`, `partner-mobile.png`, `commission-detail-mobile.png`, `commission-review-mobile.png`.

## Local integration test setup

Homebrew PostgreSQL tools are installed. Use a disposable loopback cluster and database named `moovs_commission_qa`, then set `WORKFLOW_QA_DATABASE_URL` for the Lambda test command. The harness refuses non-loopback hosts, any other database name, and production mode; each run creates a fresh synthetic schema. It does not load production connection variables. Local connection overrides in appDb/db are disabled in production and restricted to loopback.

## Release boundary / follow-up

- Reviewed additive migrations: `lambda/migrations/20261005_commission_workflow.sql` then `lambda/migrations/20261005_commission_finance_clarity.sql`. Neither is applied automatically in production. Nate subsequently explicitly approved both exact additive migrations and backend/frontend release via COS-COMMISSIONS-20261005-01. Execution uses the runbook dependency order and requires destination, completed recovery checkpoint, schema readbacks and real-account read-only acceptance.
- Existing hosted backend lacks these new workflow endpoints/schema until released; local live-account UI must not be described as end-to-end released. It disables settlement actions when workflow loading fails.
- Positive/pending refunds, missing pricing/refund facts, cancelled/unknown completion states and ambiguous agency attribution block approval. No automatic refund proration. New shuttle payment models without legacy booking-price facts remain in exception review rather than being silently approved at zero value.
- Date contract verified against read-only server/operator source and documented in `docs/TIMEZONES.md`: naive trip wall-clock, SQL DATE service day, and true instants are separate. Current production schema/live-account acceptance still require validation.
- Simple PDF uses ASCII Helvetica with deterministic replacement for unsupported glyphs; full Unicode typography is not implemented.
- Moovs source references and synthetic SQL fixtures do not prove the current production replica schema or real operator link acceptance. Validate both in staging/live read-only acceptance before deployment.
- Customer order/tracking capabilities are not added to partner responses. Moovs remains the customer booking/invoice/payment/refund system.

## Date-contract correction — 2026-10-05

- Added 104 cross-runtime date assertions and expanded SQL integration to 86 assertions. Both UTC-session and Honolulu-session/Tokyo-runtime runs passed.
- Removed timezone conversion from regular pickup filters/buckets, preserved wall-clock timestamp text, and made shuttle service-date selection explicit. SQL DATE parsing no longer passes through runtime-local Date objects.
- The date correction was verified independently first. The approved follow-on pass is now completed locally as described below; no production acceptance is implied.


## Approved follow-on pass — completed locally, 2026-10-05

1. **Lifecycle Overview:** mutually exclusive calculated/projected/approved/held/prepared/paid booking buckets, plus rejected/recheck/unknown visibility. Calculated is not a balance owed. Historical prepared/paid amounts come from frozen statements, not today's rates. Pending signed corrections are shown separately, never silently added twice.
2. **Period reconciliation:** all/exception/outside-program views, one row per booking, required acknowledgement, complete-read checks and visible older reviewed/unpaid carry-forward. Explicit opt-in can include eligible older approvals; future travel remains forbidden. Carry-forward is not an exhaustive unreviewed-history scan. Period/option changes reset acknowledgement and selection.
3. **Commission correction ledger:** agency/operator-scoped signed rows linked to a paid snapshot and optional original booking; required reason and server-derived actor. Creation/cancellation history and retry-safe keys. Explicit month-end selection supports correction-only statements. Row locking permits only one allocation; voiding an unpaid replacement releases ledger rows without changing old snapshots. Paid originals cannot be rewritten. Operator PDF/CSV includes correction origins/reasons; partner export removes private reasons, and agent statements exclude agency-level corrections. No bank transfers/customer charges/refunds.
4. **Data health:** complete replica-read metadata, oldest page-read time, verified operator timezone, unavailable facts/snapshots/workflow/carry status and refresh actions. Failed/inconsistent pagination never becomes a fresh payable read. Read timestamps do not establish upstream replica currency. Partner health stays scoped to its visible bookings. Naive timestamps cannot be used as refresh instants.

### Final verification
- `npm run verify:finance`: **58 assertions**, including live service wiring, unique lifecycle totals, snapshots/outages, paging/count/duplicate/metadata failures, invalid timezone, oldest read timestamp, carry-forward and public/agent correction isolation.
- Lambda PostgreSQL integration: **132 assertions**, repeated with UTC session and Honolulu session/Tokyo runtime. Includes migrations applied twice, operator-scoped attribution trip index, correction-source ownership/cents validation, retry conflicts, cancellation, correction-only negative settlement, consumed-once protection (concurrent requests), void/replacement and immutable original, explicit older carry-forward and future-date rejection.
- All root/Lambda typechecks and production builds, original verification scripts, workflow 76, dates 104, workspace 14 and `git diff --check` passed.
- Actual correction operator/public PDFs parsed with `pdftotext`: signed amount, original statement and frozen total retained; private operator reason/reference absent from public copy. Existing four-page statement fixture remains intact.
- Read-only browser: 36 period bookings + one approved Aug 31 carry-forward; opt-in increases agency selection from two to three bookings; selecting pending corrections updates signed totals. Changing dates disables stale actions, loading resets checklist/selection. Ledger connected in month-end and agency Settlements; demo mutation buttons disabled.
- Desktop and 390px checks: Overview, month-end, correction form, detail/Escape and agency/agent portals. No document horizontal overflow on checked mobile screens; final checks no console errors/warnings. Local production-mode preview uses process-only trusted loopback host, not a production auth configuration change. No authenticated live-account writes/acceptance tested.
- Ignored QA artifacts: `finance-overview-desktop.png`, `finance-monthend-desktop.png`, `finance-monthend-mobile.png`, `finance-detail-mobile.png`, `finance-agency-ledger-desktop.png`, `finance-partner-mobile.png`, `finance-correction-statement.pdf`, `finance-public-statement.pdf` under `output/qa/`.
- Disposable local PostgreSQL stopped after verification. Preview remains at `http://127.0.0.1:3107/demo`. At the end of this local phase, nothing was committed/pushed/deployed and no production SQL was applied. Subsequent authorized release evidence is tracked separately; no customer messages or money movement.

## Overview read-performance acceptance follow-up
- Production baseline on the existing 69-agency Roberts operator: **31,930 ms** from reload to visible Dashboard metrics, 69 agent + 69 workflow requests, 2 booking pages. Financial mutations intercepted throughout QA.
- Replace per-agency fan-out with existing bounded agent batches and new bounded workflow batches; begin Moovs paging concurrently with independent app reads. Single-agency workflow compatibility retained.
- Workflow batch authorization requires every requested agency to belong to the authenticated operator. Empty, mixed single/batch, missing/foreign scopes are rejected; backend UUID and 50-agency cap remain bounded.
- Four set-based app reads retain separate agency results, 200 audit events **per agency**, date normalization and signed adjustment amounts. Missing/malformed batch agency data fails health; no silent partial success or fabricated empty results.
- Local follow-up gates: finance 66, workflow 83, authorization 33, date 104, authoritative facts 14, query batching 4, navigation 14, concurrency 3; disposable PostgreSQL integration **144 assertions in both UTC and Honolulu sessions** (Tokyo process timezone for the latter); both typechecks/builds passed. This does not replace deployed timing/scope/UI acceptance.

### SQL / fixed membership follow-up
- Nate requested independent Astra review. It confirmed HTTP fan-out plus full-period SQL rereads behind JS OFFSET slicing, non-deterministic same-day ties and the 10,000-booking read ceiling. Actual Roberts six-month range has **20,306** identities; old live Overview correctly raised paging-consistency health rather than trustworthy totals.
- Actual read-only plans: regular period with refunds **24.53 ms / 220 rows**; shuttle period **271.789 ms / 20,086 rows**; bounded workflow queries **0.03–0.842 ms**. SQL execution alone did not explain 31.93 seconds; repeated reads/HTTP orchestration did.
- Finance now obtains one fixed scoped identity manifest, then enriches exact 500-ID chunks at concurrency 3 through authoritative facts. Native UUID predicates enable primary-key selection. Single-agency/legacy booking UI and settlement facts retain compatibility; cancelled shuttles are opt-in only for complete period reconciliation. Missing-price/refund records remain unavailable, never payable zero-price records.
- One manifest count, explicit 25,000 ceiling, no partial-manifest success, complete/duplicate/missing/foreign/date/zone/instant checks; stop outstanding/new chunk reads after failure. Identity selection is fixed as of manifest read, **not** a single transactional price snapshot and not proof no booking entered the period afterward. Settlements still revalidate financial facts.
- Read-only source preflight completely enriched all **20,306** selected bookings, including **2,411** missing-price/refund records. Manifest SQL ~90 ms; selected 500-shuttle fact SQL ~9 ms with native booking primary-key lookup. No production repairs/records/mutations.
- Removed quadratic carry membership scan; financial calculations and immutable snapshots unchanged. Local follow-up gates: finance 101, workflow 86, disposable integration 170 in both timezone configurations; both builds/typechecks and existing date/scope/navigation/fact/batching gates passed. Actual source parity and deployed timing/UI evidence remain separate required gates.
- Final actual read-only parity gate passed for **all 20,306 bookings**: identity, service day, source, Company/Booking Contact, pickup text/instant, status, route, base/total/gratuity totals and refund availability/amount matched the original complete SQL after the existing frontend empty-string/null normalization. No financial totals repaired. Warm selected 500-shuttle plan **6.799 ms**; native primary-key selection confirmed.

### Actual frontend transport / Gear Fusion follow-up
- Job 50 for exact `235b8ba3` BUILD/DEPLOY/VERIFY SUCCEED, but actual frontend acceptance found gateway HTML 403 for raw 250/500 UUID fact bodies; 20/100/180-ID bodies returned 200. Direct API/source tests did not prove this gateway path. Failed UI remained clearly unavailable; not counted as performance success.
- Read-only fact transport now accepts a canonical compact UUID representation, capped **350 IDs / <8 KB JSON body**, at concurrency 3. Legacy array requests remain compatible. The encoding grants no capability; operator authorization and WAF rules are unchanged. Malformed/noncanonical/mixed payloads rejected.
- Keep the already verified operator timezone when a later facts request fails, without marking the read healthy or converting stored dates.
- Nate clarified his account is **Gear Fusion**, not Roberts. Exact archived pre-fix Dashboard loader against actual Gear Fusion reads: **42,699 ms**, 11 agent + 11 workflow + 18 booking-page requests; **4,291 complete rows**, America/New_York. This is a controlled archived-client live-read benchmark, not a historical production page-navigation timing.
- Current follow-up local gates: finance 104, disposable integration 174 in both timezone configurations, builds/typechecks/date/scope gates. Final deployed Gear Fusion and Roberts timings/complete-read/scope/UI acceptance still required.

### Shared status and retained-period follow-up (2026-10-06)
- Healthy Overview, commission review, settlement and partner views now use a compact refresh/status row. Source/timezone/refresh metadata and technical explanations are on-demand; incomplete reads and unavailable facts remain visible actionable warnings. Calculation details no longer occupy a permanent paragraph; signed corrections remain separate from booking totals and unknown bookings are not all relabeled outside-program.
- Authenticated operator-scoped in-memory workspace state retains loaded review/settlement periods, both filters and Overview/table results through hash-tab navigation. No local/session storage, cross-operator cache or retained approval/selection/dialog state. Explicit refresh/load remains available; successful workbench changes invalidate other financial reads, and backend settlement revalidation is unchanged.
- Local browser: August period and `all` reconciliation filter restored after Overview round trip; **0 API requests on return**, compact status **28px**, details open/Escape close, mobile no horizontal overflow. Production acceptance recorded separately in the approval note.
- New `npm run verify:data-status`: **26 assertions** for compact success, visible failed/incomplete warnings, staleness, partner snapshots and correct KPI unknown/outside/correction breakdown. Typecheck/build, finance104, authorization33 and date104 gates pass.
