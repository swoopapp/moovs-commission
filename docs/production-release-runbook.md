# Commissions production release

Approval `COS-COMMISSIONS-20261005-01` (2026-10-05), Nate OS `05 Moovs/Moovs Commissions/2026-10-05 - Production release approval.md`.

## Verified destinations
- Moovs AWS account `705875818460` (verify STS identity again on every resumed release).
- App database: RDS `prototype-db`, `prototype-db.c4xzucffjf3i.us-east-1.rds.amazonaws.com`, database `postgres`, schema `public`, region `us-east-1`. Shared app instance: never restore it in place or change unrelated schemas/tables as a commissions rollback.
- Core source: `database-production-read-replica`, database `production`, schema `swoop`. **Read-only**, not a migration destination. Catalog/booking acceptance connections force `default_transaction_read_only=on`.
- Backend: Lambda `commissions-api`, `us-east-1`; API `https://wvx7dgl297.execute-api.us-east-1.amazonaws.com`.
- Frontend: Amplify `d3p7e6jzxrmmm3`, `us-east-2`, production branch `main`, repository `swoopapp/moovs-commission`, domain `https://commission.moov.sh`. Older Vercel/Supabase docs do not identify this release's deployment target.

## Dependency order and recovery
1. Inspect current remote commit, Amplify jobs, Lambda revision/hash, app schema/constraints/indexes and aggregate record integrity. Never repeat a delivery from chat alone.
2. Verify a completed encrypted recovery checkpoint for the exact RDS instance. For this release: `commissions-pre-release-20261005-01` must be **available**, not merely requested/creating. Preserve current Lambda ZIP and verify its base64 SHA-256 against AWS; keep signed download URLs/credentials out of files, chat and logs.
3. Run only these exact reviewed files, in order, with `search_path=public`, a release advisory lock, 5-second lock timeout, 60-second statement timeout and each file's existing transaction:
   - `lambda/migrations/20261005_commission_workflow.sql`, SHA-256 `bce3734069eb5b952aa596be6f8e8a6b53a0fbdcb9fc80e277c6cf49f8a7edbe`.
   - `lambda/migrations/20261005_commission_finance_clarity.sql`, SHA-256 `ff76ff0c1db541cb3aaebdf70d5eba0990faf2565758f1b294a01eb2364b6a67`.
4. Read back every added column/type, required table/constraint/index, and before/after existing-record counts/digests. Entire exact schema already present means skip execution; partial/drifted schema requires investigation. No migration ledger/bootstrap/data repair is silently added. On uncertain response, inspect schema before retry.
5. Stage explicit reviewed owned files only, preserving unrelated edits, instructions, `.mcp.json`, env files, credentials and runtime/generated artifacts. Commit without force; build Lambda from exact committed content. Deploy with AWS RevisionId compare-and-swap, then verify hash, Active/Successful and real read-only endpoints **before** frontend push.
6. Non-force push exact commit to `main`; verify that same commit's Amplify job Build/Deploy/Verify succeeds. Do not launch an extra job when the push already queued one.
7. Check public/synthetic live UI plus real protected production read APIs and scoped operator proxy. Financial, review, rule, token mutation and partner-message requests must be blocked during browser QA. No production settlement/test records; synthetic transaction acceptance remains disposable-local only.
8. Close task-owned SSM sessions and record exact evidence in the approval note/workbench. Do not conflate successful demo/build with real production query/auth acceptance.

Recovery is forward-compatible additive schema plus previous backend/frontend code if necessary. Do not drop new tables, rewrite paid records, guess old shuttle service dates, or restore a shared RDS instance in place. Any destructive repair needs a new smallest explicit decision.

## Local gates
Root and Lambda typechecks/builds; authorization, date, workspace, workflow, finance, authoritative facts, batching and concurrency scripts. Workflow integration uses disposable loopback PostgreSQL only (132 assertions, UTC and Honolulu DB/Tokyo runtime); source live acceptance preserves the wall-clock/DATE/instant contract in `docs/TIMEZONES.md`.

For private VPC access use an existing Session Manager remote-host forwarding path, not new public firewall rules. Reference: [AWS Session Manager port forwarding](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding).
