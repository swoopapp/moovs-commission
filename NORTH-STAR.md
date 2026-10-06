# Moovs Commissions
Type: code

Help operators and their agency/agent partners trust booking attribution, commission agreements, earnings and settlement records.

- Moovs owns reservations, Company/Booking Contact/Passenger identities, customer invoices, payments and refunds.
- This portal owns partner commission rules, attribution, review, statements and settlement visibility.
- Agency maps to Company; agent maps to Booking Contact; Passenger is the traveler, never the commission recipient.
- Preserve historical finalized financial snapshots and explain every calculation.
- Operator workspace follows Moovs operator branding; partner access stays agency/agent scoped.

## Explicit boundaries
- 2026-10-05: Nate excluded bank transfers and all funds movement through this portal. Payment methods record external payments only.
- No duplicate booking engine, customer invoice ledger, QR engine or customer-payment processor.
- Local implementation does not authorize production migrations, deployment or real message sends.

## Date semantics
- Moovs stop times are stored wall-clock values; never reinterpret them as UTC instants. Shuttle service dates are calendar dates; scheduled shuttle timestamps are real instants. See `docs/TIMEZONES.md`.
- 2026-10-05: Nate approved lifecycle Overview, reconciliation, commission-only adjustments and data health. Separate finance roles are excluded: one operator login.
