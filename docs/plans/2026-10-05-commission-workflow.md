# Commission workflow implementation

Approved for local implementation: calculation details/identity exceptions, dated agency/service rate rules, commission review with reasons/history, month-end settlement/real PDF+CSV statements, partner explanation/questions.

Safety: no bank transfer APIs/SDKs; no customer balance writes or sends. Additive schema SQL is reviewed/applied separately. Old statement snapshots remain immutable; changed facts invalidate approval rather than silently change payable amounts. Operator session actor is server-derived. Partner token can submit questions only for its visible bookings; no operator URLs/public passenger capability URLs in partner responses.

URL evidence: read-only theswoopapp/dooms-operator CopyLinksDialog, ReservationsPage/useRequestParamsFromUrl and global ID helpers; customer TripPage. Request/Trip IDs are base64 Type:UUID. Shared shuttle_booking is NOT a Request and cannot be cast into a reservation URL.

Verification: frontend typecheck/build; Lambda build/typecheck; all existing verify scripts; new rules/lifecycle/PDF/authorization checks; local DB integration where available; desktop/mobile demo QA. No live-production acceptance implied.

Implementation and verification completed locally: see `docs/commission-workflow-verification.md`. Prepared unpaid records can be voided with a reason while preserving history, then re-reviewed and replaced. Customer order/tracking capability links are not exposed in partner payloads. No production migration or deployment performed.

Approved follow-on pass completed locally: lifecycle Overview, reconciliation/checklist with explicit reviewed carry-forward, signed paid-statement correction ledger integrated into settlement creation/void/export, and scoped data-health refresh. Separate finance roles remain excluded. Final gates and release boundaries are in `docs/commission-workflow-verification.md`.
