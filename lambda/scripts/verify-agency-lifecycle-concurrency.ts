// Lock-order proofs for the legacy agency lifecycle, against real PostgreSQL with several connections.
// Every "waits" claim below is read from pg_stat_activity and pg_blocking_pids, never inferred from elapsed time.
// Disposable loopback database only, same guard as verify-workflow-integration.ts. No Moovs facts are read.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Hono } from 'hono';
import { ensureCommissionTables, getAppPool } from '../src/appDb.js';
import agencies from '../src/routes/agencies.js';
import lifecycle from '../src/routes/agencyLifecycleRoutes.js';
import workflow from '../src/routes/workflow.js';

const connection = new URL(process.env.WORKFLOW_QA_DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname), 'QA must be loopback');
assert.equal(connection.pathname, '/moovs_commission_qa', 'Dedicated disposable database required');
assert.notEqual(process.env.NODE_ENV, 'production');
const admin = new pg.Pool({ connectionString: connection.toString() });
const schema = `qa_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
connection.searchParams.set('options', `-c search_path=${schema},public -c timezone=UTC`);
process.env.LOCAL_APP_DATABASE_URL = connection.toString();

let count = 0;
const eq = (a: unknown, b: unknown, message?: string) => {
  count++;
  assert.deepEqual(a, b, message);
};
const app = new Hono();
for (const route of [agencies, lifecycle, workflow]) app.route('/', route);
const send = (method: string, path: string, body: unknown) =>
  Promise.resolve(
    app.request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-workflow-actor': 'operator:qa' },
      body: JSON.stringify(body),
    }),
  );
/** A request left running, with a flag that says whether it has answered yet. */
function inFlight(method: string, path: string, body: unknown) {
  const state = { done: false, response: send(method, path, body) };
  void state.response.then(
    () => { state.done = true; },
    () => { state.done = true; },
  );
  return state;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clients: pg.Client[] = [];
async function session() {
  const client = new pg.Client({ connectionString: connection.toString() });
  await client.connect();
  clients.push(client);
  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
  return { client, pid };
}
type Waiter = { pid: number; query: string; wait_event: string; blockers: number[] };
/**
 * The one backend that is blocked on a lock right now and matches. Polls until the server reports it, then the
 * caller asserts on what the server said: which statement is blocked and which backends block it.
 */
async function blocked(match: RegExp | number, label: string): Promise<Waiter> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = (
      await admin.query(
        `SELECT pid, query, wait_event, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
         WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND pid<>pg_backend_pid()`,
      )
    ).rows as Waiter[];
    const found = rows.filter((row) => (typeof match === 'number' ? row.pid === match : match.test(row.query)));
    if (found.length === 1 && found[0].blockers.length) return found[0];
    await sleep(50);
  }
  return assert.fail(`${label}: no backend is blocked on a lock with that statement`);
}
const OPERATOR_SHARE = 'SELECT id FROM commission_operators WHERE id=$1 FOR SHARE';
// The statement lockOperatorMapping sends for an agency editor, and for create/restore.
const EDITOR_MAPPING = /FROM commission_operators co JOIN agencies x[\s\S]*FOR UPDATE OF co/;
const OPERATOR_MAPPING = /FROM commission_operators co WHERE co\.id=\$1 FOR UPDATE OF co/;

const operator = randomUUID(), agency = randomUUID(), payout = randomUUID(), dormant = randomUUID();
let pool: pg.Pool | undefined;
try {
  pool = await getAppPool();
  const db = pool;
  await ensureCommissionTables();
  for (const file of ['20261005_commission_workflow.sql', '20261005_commission_finance_clarity.sql'])
    await db.query(readFileSync(`migrations/${file}`, 'utf8'));
  await db.query("INSERT INTO commission_operators(id,moovs_operator_id,slug,display_name,auth_password,status) VALUES($1,'m-lock','lock','Lock','x','active')", [operator]);
  await db.query("INSERT INTO agencies(id,operator_id,moovs_company_id,name,commission_rate,commission_type) VALUES($1,$2,'co-live','Live',10,'percent'),($3,$2,'co-r','Dormant',10,'percent')", [agency, operator, dormant]);
  await db.query("INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status) VALUES($1,$2,$3,'2026-01-01','2026-01-31','draft')", [payout, operator, agency]);

  // --- 1. An agency editor queues at the operator row, so the two money writers below cannot be tied into a cycle.
  // Writer A is shaped like an adjustment create (operator share, agency share, then the payout).
  // Writer B is shaped like a void (operator share, payout for update, then the agency).
  // Before the fix the editor shared the operator row and queued for the AGENCY for update: B then queued behind it
  // for the agency, the editor waited for A, and A waited for B.
  const editors: [string, () => ReturnType<typeof inFlight>, () => Promise<unknown>][] = [
    [
      'PATCH /agencies/:id',
      () => inFlight('PATCH', `/agencies/${agency}`, { name: 'Live Renamed' }),
      async () => (await db.query('SELECT name FROM agencies WHERE id=$1', [agency])).rows[0].name,
    ],
    [
      'POST /workflow/rules',
      () => inFlight('POST', '/workflow/rules', { agency_id: agency, operator_id: operator, reason: 'Concurrency proof', previous: '[]', rules: [] }),
      async () => (await db.query("SELECT count(*)::int AS n FROM commission_workflow_events WHERE agency_id=$1 AND action='rules.updated'", [agency])).rows[0].n,
    ],
  ];
  for (const [label, start, effect] of editors) {
    const a = await session(), b = await session();
    await a.client.query('BEGIN');
    await a.client.query(OPERATOR_SHARE, [operator]);
    await a.client.query('SELECT id FROM agencies WHERE id=$1 FOR SHARE', [agency]);
    await b.client.query('BEGIN');
    await b.client.query(OPERATOR_SHARE, [operator]);
    await b.client.query('SELECT id FROM payouts WHERE id=$1 FOR UPDATE', [payout]);

    const editor = start();
    const queued = await blocked(EDITOR_MAPPING, `${label} at the operator row`);
    eq(queued.blockers.length > 0 && queued.blockers.every((pid) => [a.pid, b.pid].includes(pid)), true, `${label}: blocked only by the two share holders, got ${queued.blockers}`);
    eq(editor.done, false, label);

    // A now wants the payout that B holds.
    let aHasPayout = false;
    const aWait = a.client.query('SELECT id FROM payouts WHERE id=$1 FOR SHARE', [payout]).then(() => { aHasPayout = true; });
    eq((await blocked(a.pid, `${label}: A at the payout`)).blockers, [b.pid]);

    // B takes the agency share although an editor is queued. A lock timeout turns a wait into a failure here.
    await b.client.query("SET LOCAL lock_timeout = '3s'");
    eq((await b.client.query('SELECT id FROM agencies WHERE id=$1 FOR SHARE', [agency])).rows.length, 1, `${label}: B was not queued behind the editor`);
    eq([editor.done, aHasPayout], [false, false], label);

    await b.client.query('COMMIT');
    await aWait;
    eq(aHasPayout, true, label);
    // The editor is still at the operator row, now held only by A.
    eq((await blocked(queued.pid, `${label} still at the operator row`)).blockers, [a.pid]);
    eq(editor.done, false, label);
    await a.client.query('COMMIT');
    const response = await editor.response;
    eq(response.status, 200, `${label}: ${await response.clone().text()}`);
    eq(await effect(), label.startsWith('PATCH') ? 'Live Renamed' : 1, label);
  }

  // --- 2. Agency create holds the operator row until it commits, so a restore's client-conflict check cannot run
  // between the new agency's insert and its commit. The pause is a test-only trigger on an advisory lock this test owns.
  await db.query(`CREATE FUNCTION qa_pause_racer() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'Racer' THEN PERFORM pg_advisory_xact_lock(7, 55449); END IF; RETURN NEW; END $$`);
  await db.query('CREATE TRIGGER qa_pause_racer BEFORE INSERT ON agencies FOR EACH ROW EXECUTE FUNCTION qa_pause_racer()');
  await db.query("UPDATE agencies SET status='archived', portal_token=NULL WHERE id=$1", [dormant]);
  const advice = await (await send('GET', `/agencies/${dormant}/lifecycle?operator_id=${operator}`, undefined)).json() as any;
  eq([advice.kind, advice.data.status], ['advice', 'archived']);

  const gate = await session();
  await gate.client.query('SELECT pg_advisory_lock(7, 55449)');
  const create = inFlight('POST', '/agencies', { operator_id: operator, name: 'Racer', moovs_company_id: 'co-r' });
  const paused = await blocked(/INSERT INTO agencies/, 'create paused in its insert');
  eq([paused.wait_event, paused.blockers], ['advisory', [gate.pid]]);

  const restore = inFlight('POST', `/agencies/${dormant}/restore`, { operator_id: operator, expected_revision: advice.data.revision, reason: 'Reopening the account' });
  const restoring = await blocked(OPERATOR_MAPPING, 'restore at the operator row');
  // Blocked by the create itself: the create took the operator row before its insert and still holds it.
  eq(restoring.blockers, [paused.pid]);
  eq([create.done, restore.done], [false, false]);
  eq((await db.query("SELECT count(*)::int AS n FROM agencies WHERE name='Racer'")).rows[0].n, 0);

  await gate.client.query('SELECT pg_advisory_unlock(7, 55449)');
  const created = await create.response;
  eq(created.status, 201, await created.clone().text());
  const restored = await restore.response;
  // The restore ran after the create committed, saw the new active agency claiming the same client, and refused.
  eq([restored.status, await restored.json()], [409, { kind: 'refused', code: 'CONFLICT' }]);
  eq((await db.query('SELECT status FROM agencies WHERE id=$1', [dormant])).rows[0].status, 'archived');
  eq((await db.query("SELECT count(*)::int AS n FROM agency_client_links l JOIN agencies a ON a.id=l.agency_id WHERE a.name='Racer' AND l.client_key='company:co-r'")).rows[0].n, 1);
  eq((await db.query("SELECT count(*)::int AS n FROM commission_workflow_events WHERE agency_id=$1 AND action='agency.restored'", [dormant])).rows[0].n, 0);

  console.log(`Agency lifecycle concurrency passed (${count} assertions) against disposable loopback PostgreSQL. No cloud/provider calls.`);
} finally {
  for (const client of clients) await client.end().catch(() => undefined);
  await pool?.end();
  await admin.end();
}
