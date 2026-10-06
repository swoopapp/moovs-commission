# Moovs commissions date contract

Do not treat all database times (or every trailing `Z`) as UTC instants.

| Source | Meaning | Commission handling |
| --- | --- | --- |
| `stop.date_time` | `timestamp without time zone`: stored local wall-clock | Preserve written date/time. Filter/bucket this column directly. Never apply operator/viewer timezone conversion. |
| `shuttle_booking.travel_date` | SQL `DATE`: service calendar date | Commission period, dated rules and statement date use this date—even if an overnight pickup is next-day. |
| `shuttle_booking.scheduled_pickup_time` / `scheduled_dropoff_time` | True `timestamptz` instants | Convert only when displaying actual scheduled time, using the explicit applicable timezone. Never use the UTC prefix as the service day. |
| Audit/refresh/created timestamps | True instants | May convert for display. They are not booking travel dates. |
| Payout periods, external payment dates, rule-effective/expected-payment dates | Calendar dates | Preserve `YYYY-MM-DD`, no timezone conversion. |

## Implementation

- SQL emits regular pickup/dropoff timestamps as text, preserving exact wall-clock components. The legacy `...Z` API shape is a **wall-clock container**, not a UTC-instant assertion. It must not be sent through `operatorDay`/`new Date(...).toLocale*()` as an instant.
- `travel_day` is explicit SQL text from `to_char(stop.date_time,'YYYY-MM-DD')` or `to_char(shuttle_booking.travel_date,'YYYY-MM-DD')`. Rules, eligibility, period checks, statement snapshots and partner tables use it.
- Regular SQL filtering uses `pickup.date_time >= date_from::date` and `< date_to::date + INTERVAL '1 day'`. No `AT TIME ZONE` conversion of this naive column. Shuttle filtering uses `travel_date` directly.
- A missing shuttle scheduled time stays missing; do not invent an instant by casting service date to `timestamptz`.
- Pool-local pg parsers keep SQL DATE and naive timestamp values as strings. True instants retain pg's instant parser. No global parser mutation or pool/session timezone change.
- Existing app snapshot `pickup_date` is unfortunately `TIMESTAMPTZ` and mixes contracts. A legacy regular-trip fallback extracts UTC-shaped **container components**; it is not a conversion of the source wall clock. Shuttle snapshots lacking explicit `travel_day` require authoritative refresh, not a guessed UTC day. No backfill or destructive schema change was run.
- `wallClockDay` / `formatDisplayDate` preserve calendar components. `reservationTravelDay` distinguishes booking types. `operatorDay` is exclusively for real instants and refuses offset-free strings. Automatic operator-local periods require a verified timezone; no silent UTC substitution.
- Historical finalized statements are not rewritten; new statements freeze the verified travel day.

## Read-only reference evidence

- Server `migrations/201911061642_init.ts`: stop `date_time` uses `{ useTz: false }`.
- Server `src/moovs/libs/trip/loadApiTripsPage.ts`: explicitly documents wall-clock pickup dates and filters with `::timestamp`, not timezone conversion.
- Server `migrations/202508202047_shuttle_feature.ts`: `travel_date` is SQL DATE.
- Server `migrations/202512082218_add_travel_time_to_shared_shuttle_trip_destination.ts` and `202512111707_rename_shuttle_time_fields.ts`: scheduled fields originate as timezone-aware timestamps.
- Server `src/moovs/libs/shuttle/enrichBookingsWithDateTime.ts`: scheduled instants converted using booking timezone.
- Operator `src/globals/utils/helpers.tsx`: legacy picker offsets compensate automatic timezone adjustments; a serialized `Z` does not establish instant semantics.
- Existing companion reference: `/Users/natebullock/Projects/moovs-dashboardv2/docs/TIMEZONES.md`. No shared deployment/resource relationship is inferred from this reference.

## Verification (local only, 2026-10-05)

- `npm run verify:dates`: 26 assertions in each of UTC, Los Angeles, Tokyo and Honolulu (104 total), including midnight/month boundaries, DST gap/repeated-hour preservation, shuttle service dates and distinct true-instant conversion.
- Lambda workflow integration: 132 assertions with synthetic loopback PostgreSQL. Repeated with PostgreSQL session Honolulu and Node runtime Tokyo; covers inclusive end-date/next-midnight SQL boundaries, wall-clock text serialization, real shuttle timestamp vs service date, and DATE string decoding.
- These are source-contract and local integration checks, not confirmation of the current production replica schema or live-account acceptance. Nate subsequently approved production release and the exact additive app migrations under COS-COMMISSIONS-20261005-01. Current release evidence is separate from these local checks.

## Production source preflight — approved release

On 2026-10-05 (operator-local date), read-only connections to the actual `production/swoop` replica verified `pg_is_in_recovery=true` and `transaction_read_only=on`. Catalog confirmed `stop.date_time` is timestamp without timezone, shuttle `travel_date` is DATE, scheduled pickup is timestamptz and operator timezone exists. Reviewed authoritative SQL successfully read 3 regular and 2 shuttle facts across existing operators. No source writes or customer record values were printed. This verifies actual query/schema compatibility, not production mutation or settlement acceptance. See [production release runbook](production-release-runbook.md).
