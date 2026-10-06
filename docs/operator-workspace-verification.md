# Moovs operator workspace — local verification

Date: 2026-10-05. Local implementation only; no deployment, database writes, or payment processing changes.

## Scope

- Moovs wordmark, self-hosted Poppins (400/500/600/700 with OFL license), and product palette from the explicitly requested custom-iframe Customize workspace reference (`cdca9f8`). This is a visual reference, not a shared infrastructure dependency.
- Header + desktop left navigation: Overview, Agencies, Agency matching, Route rates. Existing agency deep links remain valid; agency details activate Agencies.
- Overview keeps compact metrics, puts the agency table before the chart. Agencies is the table-focused view, sharing existing search/pagination/export behavior.
- Public GM/agent portals do not acquire the operator-workspace body class. Customer palette values remain in data; the operator UI consistently uses Moovs colors instead of mutating document-root variables.
- Body-scoped styles include portalled select/dialog content. Mobile drawer uses Radix focus management and closes on navigation/Escape/desktop resize.
- Presentation-only fixes: route-rate header stacks on mobile; screen-reader chart table is wrapped to avoid intrinsic table width expanding the page.

## Gates

Passed: `npm run typecheck`, `npm run build`, `npm run verify:workspace`, all five existing `verify:*` scripts, and `git diff --check`.

Workspace script has 14 navigation/source-boundary assertions. Existing scripts cover authorization (33), dates (6), authoritative payout facts (14), batching (4), concurrency (3). Source-boundary checks are not runtime proof; browser checks below cover the actual rendering boundary.

## Browser checks — local read-only demo

- Desktop: header/wordmark, actual Poppins font, active navigation, Overview/Agencies differentiation, agency deep link and existing contextual tabs, matching, route rates.
- Search filters to Grandview; page-size selector works and portalled listbox inherits Poppins.
- Mobile 390px: open/close drawer, Escape and focus return to trigger, selecting a route closes drawer; route-rate primary button resolves to `rgb(25, 95, 233)`.
- Narrow 320px, mobile 390px, sidebar breakpoint 1024px, normal desktop 1602px: no document horizontal overflow. Tables retain their own horizontal scrolling.
- Drawer closes after crossing to desktop and releases body pointer lock.
- Public demo GM portal retains its original system font and has no workspace theme or sidebar.
- Only demo/sample data exercised. No production account CRUD, invoice creation, real payment, or authenticated write paths were tested.

## Local preview

`http://127.0.0.1:3107/demo`

The initial macOS file watcher hit `EMFILE` and served stale source after edits. Restarted the task-owned dev server with `WATCHPACK_POLLING=true`; reloaded and reverified current source. This is process-local, not a machine-wide configuration change. Leave the dev server running for Nate's local iteration; no launch agent or persistent startup service was installed.

Screenshot: `output/qa/operator-workspace-desktop.jpg` (local sample data only).

## Subsequent workflow extension

The same local workspace now includes Commission review and Month-end settlement. See [commission workflow verification](commission-workflow-verification.md) for the synthetic database tests, real statement exports, review/partner boundaries and unreleased backend/schema requirements. The original presentation-only phase above did not write databases; subsequent workflow testing wrote only a disposable local PostgreSQL instance.
