// Agency archive / restore / link issue and the legacy writers they must bind.
// Disposable loopback PostgreSQL only, same guard as verify-workflow-integration.ts. No Moovs facts are needed:
// every case here is decided before a route would read them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Hono } from 'hono';
import { ensureCommissionTables, getAppPool } from '../src/appDb.js';
import agencies from '../src/routes/agencies.js';
import lifecycle from '../src/routes/agencyLifecycleRoutes.js';
import agentsCrud from '../src/routes/agentsCrud.js';
import workflow from '../src/routes/workflow.js';
import adjustments from '../src/routes/adjustments.js';
import payouts from '../src/routes/payoutsCrud.js';

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
for (const route of [agencies, lifecycle, agentsCrud, workflow, adjustments, payouts]) app.route('/', route);
async function call(method: string, path: string, body: unknown, status: number, raw?: string) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-workflow-actor': 'operator:qa' },
    body: method === 'GET' || method === 'DELETE' ? undefined : (raw ?? JSON.stringify(body)),
  });
  const text = await res.text();
  count++;
  assert.equal(res.status, status, `${method} ${path}: ${text}`);
  // No reply on these paths may carry a stored link, whatever the outcome.
  for (const secret of TOKENS) assert.ok(!text.includes(secret), `${method} ${path} leaked a link`);
  return { json: text ? JSON.parse(text) : null, cache: res.headers.get('cache-control') };
}
const TOKENS: string[] = [];
const operator = randomUUID(), otherOperator = randomUUID(), pausedOperator = randomUUID();
const agency = randomUUID(), rival = randomUUID(), foreign = randomUUID(), paused = randomUUID();
const agent = randomUUID(), idleAgent = randomUUID();
const agencyToken = 'a'.repeat(64), agentToken = 'b'.repeat(64), idleToken = 'c'.repeat(64);

let pool: pg.Pool | undefined;
try {
  pool = await getAppPool();
  const db = pool;
  await ensureCommissionTables();
  for (const file of ['20261005_commission_workflow.sql', '20261005_commission_finance_clarity.sql'])
    await db.query(readFileSync(`migrations/${file}`, 'utf8'));
  await db.query(
    "INSERT INTO commission_operators(id,moovs_operator_id,slug,display_name,auth_password,status) VALUES($1,'m-qa','qa','QA','x','active'),($2,'m-other','other','Other','x','active'),($3,'m-paused','paused','Paused','x','inactive')",
    [operator, otherOperator, pausedOperator],
  );
  await db.query(
    "INSERT INTO agencies(id,operator_id,moovs_company_id,name,commission_rate,commission_type,portal_token) VALUES($1,$2,'co-1','QA Agency',10,'percent',$3),($4,$5,'co-9','Foreign',10,'percent',$6),($7,$8,'co-8','Paused',10,'percent',$9)",
    [agency, operator, agencyToken, foreign, otherOperator, 'd'.repeat(64), paused, pausedOperator, 'e'.repeat(64)],
  );
  await db.query(
    "INSERT INTO agents(id,agency_id,name,status,portal_token) VALUES($1,$2,'Active Agent','active',$3),($4,$2,'Idle Agent','inactive',$5)",
    [agent, agency, agentToken, idleAgent, idleToken],
  );
  TOKENS.push(agencyToken, agentToken, idleToken);
  const scope = `?operator_id=${operator}`;
  const advice = async () => (await call('GET', `/agencies/${agency}/lifecycle${scope}`, null, 200)).json.data;
  const row = async () => {
    const found = (await db.query('SELECT status,portal_token FROM agencies WHERE id=$1', [agency])).rows[0];
    return [found.status, found.portal_token];
  };
  const events = async (action: string) =>
    (await db.query('SELECT actor,reason,details FROM commission_workflow_events WHERE agency_id=$1 AND action=$2', [agency, action])).rows;

  // --- Advice
  const first = await call('GET', `/agencies/${agency}/lifecycle${scope}`, null, 200);
  eq(first.cache, 'private, no-store, max-age=0');
  eq(first.json.kind, 'advice');
  eq(Object.keys(first.json.data).sort(), ['agency_id', 'agency_link', 'agents', 'obligations', 'revision', 'status']);
  eq(first.json.data.agency_link, true);
  eq(first.json.data.agents.map((a: any) => a.link), [true, true]);
  eq(first.json.data.obligations, { open_payouts: 0, open_adjustments: 0, approved_unsettled: 0, held_unsettled: 0 });
  assert.match(first.json.data.revision, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/);
  eq((await call('GET', `/agencies/${agency}/lifecycle?operator_id=${otherOperator}`, null, 404)).json, { kind: 'refused', code: 'RESOURCE_UNAVAILABLE' });
  eq((await call('GET', `/agencies/${agency}/lifecycle`, null, 400)).json, { kind: 'refused', code: 'INVALID_INPUT' });

  // --- Wire refusals: nothing below may write
  const good = { operator_id: operator, expected_status: 'active', expected_revision: first.json.data.revision, reason: 'Closing the account' };
  for (const bad of [
    { ...good, token: 'x' },
    { ...good, expected_status: 'archived' },
    { ...good, expected_revision: `${good.expected_revision}Z` },
    { ...good, reason: '  a ' },
    { operator_id: operator, expected_status: 'active', expected_revision: good.expected_revision },
  ])
    eq((await call('POST', `/agencies/${agency}/archive`, bad, 400)).json, { kind: 'refused', code: 'INVALID_INPUT' });
  eq((await call('POST', `/agencies/${agency}/archive`, null, 400, `{"pad":"${'x'.repeat(5000)}"}`)).json, { kind: 'refused', code: 'INVALID_INPUT' });
  eq((await call('POST', `/agencies/${agency}/archive`, { ...good, operator_id: otherOperator }, 404)).json, { kind: 'refused', code: 'RESOURCE_UNAVAILABLE' });
  eq((await call('POST', `/agencies/${paused}/archive`, { ...good, operator_id: pausedOperator }, 404)).json, { kind: 'refused', code: 'RESOURCE_UNAVAILABLE' });
  eq((await call('POST', `/agencies/${agency}/archive`, { ...good, expected_status: 'suspended' }, 409)).json, { kind: 'refused', code: 'STALE_FACTS' });
  eq((await call('POST', `/agencies/${agency}/archive`, { ...good, expected_revision: '2000-01-01T00:00:00.000000' }, 409)).json, { kind: 'refused', code: 'STALE_FACTS' });
  eq(await row(), ['active', agencyToken]);

  // --- Each recorded obligation blocks on its own
  const paidPayout = randomUUID(), openPayout = randomUUID(), otherPaid = randomUUID();
  const snapshot = JSON.stringify({ version: 1, lines: [] });
  await db.query(
    "INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status,statement_snapshot) VALUES($1,$2,$3,'2026-01-01','2026-01-31','paid',$4)",
    [paidPayout, operator, agency, snapshot],
  );
  const blocked = async (label: string, expected: Record<string, number>) => {
    const revision = (await advice()).revision;
    eq((await call('POST', `/agencies/${agency}/archive`, { ...good, expected_revision: revision }, 409)).json, { kind: 'refused', code: 'OBLIGATIONS_OPEN' }, label);
    eq((await advice()).obligations, { open_payouts: 0, open_adjustments: 0, approved_unsettled: 0, held_unsettled: 0, ...expected }, label);
    eq((await row())[0], 'active', label);
  };
  await db.query("INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status) VALUES($1,$2,$3,'2026-02-01','2026-02-28','draft')", [openPayout, operator, agency]);
  await blocked('draft payout', { open_payouts: 1 });
  await db.query("UPDATE payouts SET status='void' WHERE id=$1", [openPayout]);
  const adjustment = randomUUID();
  await db.query("INSERT INTO commission_adjustments(id,agency_id,source_payout_id,amount,reason,actor,request_key) VALUES($1,$2,$3,5,'Correction','qa',$4)", [adjustment, agency, paidPayout, randomUUID()]);
  await blocked('pending adjustment', { open_adjustments: 1 });
  // Applied to a voided payout is still open: the void-stable rule.
  await db.query('UPDATE commission_adjustments SET applied_payout_id=$1 WHERE id=$2', [openPayout, adjustment]);
  await blocked('adjustment on a void payout', { open_adjustments: 1 });
  await db.query('UPDATE commission_adjustments SET applied_payout_id=$1 WHERE id=$2', [paidPayout, adjustment]);
  for (const status of ['approved', 'held'] as const) {
    await db.query("INSERT INTO commission_reviews(agency_id,moovs_trip_id,status,reason,fingerprint,actor) VALUES($1,'trip-1',$2,'Reviewed','fp','qa') ON CONFLICT(agency_id,moovs_trip_id) DO UPDATE SET status=EXCLUDED.status", [agency, status]);
    await blocked(`${status} review`, { [`${status}_unsettled`]: 1 });
  }
  // Settled by a paid payout that holds the trip, even one prepared for another agency of the operator.
  const reservation = randomUUID();
  await db.query("INSERT INTO agencies(id,operator_id,name,commission_rate,commission_type) VALUES($1,$2,'Rival',10,'percent')", [rival, operator]);
  await db.query("INSERT INTO commission_reservations(id,operator_id,moovs_trip_id) VALUES($1,$2,'trip-1')", [reservation, operator]);
  await db.query("INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status) VALUES($1,$2,$3,'2026-01-01','2026-01-31','paid')", [otherPaid, operator, rival]);
  await db.query('INSERT INTO payout_reservations(payout_id,reservation_id) VALUES($1,$2)', [otherPaid, reservation]);
  eq((await advice()).obligations, { open_payouts: 0, open_adjustments: 0, approved_unsettled: 0, held_unsettled: 0 });

  // --- Archive
  const before = (await advice()).revision;
  eq((await call('POST', `/agencies/${agency}/archive`, { ...good, expected_revision: before }, 200)).json, { kind: 'committed', result: { agency_id: agency } });
  eq(await row(), ['archived', null]);
  eq((await db.query('SELECT count(*)::int AS n FROM agents WHERE agency_id=$1 AND portal_token IS NOT NULL', [agency])).rows[0].n, 0);
  eq((await db.query('SELECT status FROM agents WHERE id=$1', [idleAgent])).rows[0].status, 'inactive');
  const archivedEvents = await events('agency.archived');
  eq(archivedEvents.length, 1);
  eq(archivedEvents[0].actor, 'operator:qa');
  eq(archivedEvents[0].reason, 'Closing the account');
  eq(archivedEvents[0].details, { identity_verified: false, source: 'legacy-api', before_status: 'active', agency_link_revoked: true, agent_links_revoked: 2, obligations_checked: 'recorded-only' });
  // A resend of the same request is a refusal, never a second archive.
  eq((await call('POST', `/agencies/${agency}/archive`, { ...good, expected_revision: before }, 409)).json, { kind: 'refused', code: 'STALE_FACTS' });
  eq((await events('agency.archived')).length, 1);

  // --- Old links are dead on every legacy reader, including a link left on an archived row by an older writer
  eq((await call('GET', `/agencies/by-token/${agencyToken}`, null, 200)).json, []);
  eq((await call('GET', `/agents/by-token/${agentToken}`, null, 200)).json, []);
  await db.query('UPDATE agencies SET portal_token=$1 WHERE id=$2', ['f'.repeat(64), agency]);
  await db.query('UPDATE agents SET portal_token=$1 WHERE id=$2', ['9'.repeat(64), agent]);
  TOKENS.push('f'.repeat(64), '9'.repeat(64));
  eq((await call('GET', `/agencies/by-token/${'f'.repeat(64)}`, null, 200)).json, []);
  eq((await call('GET', `/agents/by-token/${'9'.repeat(64)}`, null, 200)).json, []);

  // --- Archived agency: no edit, no new obligation, no link
  const archivedBody = { error: 'Agency is archived. Restore it before making changes.', code: 'AGENCY_ARCHIVED' };
  const archivedRevision = (await advice()).revision;
  for (const [method, path, body] of [
    ['PATCH', `/agencies/${agency}`, { name: 'Renamed' }],
    ['PATCH', `/agencies/${agency}`, { status: 'active' }],
    ['PATCH', `/agencies/${agency}`, { client_links: [] }],
    ['POST', '/agents', { agency_id: agency, name: 'New Agent' }],
    ['PATCH', `/agents/${agent}`, { status: 'inactive' }],
    ['POST', '/workflow/rules', { agency_id: agency, operator_id: operator, reason: 'Change', previous: '[]', rules: [] }],
    ['POST', '/workflow/review', { agency_id: agency, operator_id: operator, moovs_trip_id: 'trip-2', status: 'held', reason: 'Hold it', fingerprint: 'fp' }],
    ['POST', '/workflow/adjustments', { agency_id: agency, operator_id: operator, source_payout_id: paidPayout, request_key: randomUUID(), amount: 5, reason: 'Late correction' }],
    ['POST', '/payouts', { operator_id: operator, agency_id: agency, period_start: '2026-03-01', period_end: '2026-03-31' }],
    ['PATCH', `/payouts/${otherPaid}`, { notes: 'still editable: rival is not archived' }],
  ] as const) {
    const live = path === `/payouts/${otherPaid}`;
    const res = await call(method, path, body, live ? 200 : 409);
    if (!live) eq(res.json, archivedBody, `${method} ${path}`);
  }
  // otherPaid belongs to the live rival but is what settled the archived agency's held review of trip-1. Taking it
  // out of paid would reopen that review behind the archive: refused, while staying paid or editing notes is not.
  for (const status of ['draft', 'void'])
    eq((await call('PATCH', `/payouts/${otherPaid}`, { status }, 409)).json.code, 'ARCHIVED_AGENCY_SETTLED');
  await call('PATCH', `/payouts/${otherPaid}`, { status: 'paid' }, 200);
  eq((await db.query('SELECT status FROM payouts WHERE id=$1', [otherPaid])).rows[0].status, 'paid');
  eq((await advice()).obligations.held_unsettled, 0);
  // A second paid payout holding the same trip means nothing would reopen, so the edit is allowed and reversible.
  const secondPaid = randomUUID();
  await db.query("INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status) VALUES($1,$2,$3,'2026-01-01','2026-01-31','paid')", [secondPaid, operator, rival]);
  await db.query('INSERT INTO payout_reservations(payout_id,reservation_id) VALUES($1,$2)', [secondPaid, reservation]);
  await call('PATCH', `/payouts/${otherPaid}`, { status: 'draft' }, 200);
  eq((await advice()).obligations.held_unsettled, 0);
  eq((await call('PATCH', `/payouts/${secondPaid}`, { status: 'draft' }, 409)).json.code, 'ARCHIVED_AGENCY_SETTLED');
  await call('PATCH', `/payouts/${otherPaid}`, { status: 'paid' }, 200);
  await db.query('DELETE FROM payouts WHERE id=$1', [secondPaid]);
  // Raw edit of a pre-workflow payout of the archived agency is refused whatever it changes.
  const legacyPaid = randomUUID();
  await db.query("INSERT INTO payouts(id,operator_id,agency_id,period_start,period_end,status) VALUES($1,$2,$3,'2025-01-01','2025-01-31','paid')", [legacyPaid, operator, agency]);
  for (const body of [{ status: 'draft' }, { notes: 'x' }, { status: 'void' }])
    eq((await call('PATCH', `/payouts/${legacyPaid}`, body, 409)).json, archivedBody);
  eq((await call('POST', '/payout-reservations', { payout_id: legacyPaid, reservation_ids: [reservation] }, 409)).json, archivedBody);
  eq((await call('POST', `/agencies/${agency}/issue-link`, { operator_id: operator, expected_revision: archivedRevision }, 409)).json, { kind: 'refused', code: 'CONFLICT' });
  eq((await call('POST', `/agencies/${agency}/issue-agent-link`, { operator_id: operator, agent_id: agent, expected_revision: archivedRevision }, 409)).json, { kind: 'refused', code: 'CONFLICT' });
  eq(Object.values((await db.query('SELECT name,status FROM agencies WHERE id=$1', [agency])).rows[0]), ['QA Agency', 'archived']);
  eq((await db.query('SELECT count(*)::int AS n FROM payouts WHERE agency_id=$1', [agency])).rows[0].n, 3);
  eq((await db.query('SELECT count(*)::int AS n FROM commission_adjustments WHERE agency_id=$1', [agency])).rows[0].n, 1);
  // Cancelling stays possible: it can only close an obligation.
  await db.query('UPDATE commission_adjustments SET applied_payout_id=NULL WHERE id=$1', [adjustment]);
  await call('POST', `/workflow/adjustments/${adjustment}/cancel`, { agency_id: agency, operator_id: operator, reason: 'No longer due' }, 200);

  // --- Retired mutations make no database call and change nothing
  for (const [method, path] of [['DELETE', `/agencies/${agency}`], ['DELETE', `/agencies/${rival}`], ['DELETE', `/agents/${agent}`]] as const)
    eq((await call(method, path, null, 409)).json.code, 'DELETE_DISABLED');
  eq((await call('POST', `/agencies/${rival}/regenerate-token`, {}, 409)).json.code, 'USE_LIFECYCLE');
  eq((await db.query('SELECT count(*)::int AS n FROM agencies WHERE operator_id=$1', [operator])).rows[0].n, 2);
  eq((await db.query('SELECT count(*)::int AS n FROM agents WHERE agency_id=$1', [agency])).rows[0].n, 2);
  eq((await call('POST', '/agencies', { operator_id: operator, name: 'Born archived', status: 'archived' }, 400)).json.code, 'STATUS_NOT_EDITABLE');
  // Create is one transaction under the operator row: an unknown operator creates nothing, a known one gets its links.
  await call('POST', '/agencies', { operator_id: randomUUID(), name: 'No operator' }, 404);
  eq((await db.query("SELECT count(*)::int AS n FROM agencies WHERE name='No operator'")).rows[0].n, 0);
  const made = (await call('POST', '/agencies', { operator_id: operator, name: 'Made', moovs_company_id: 'co-7', status: 'inactive' }, 201)).json[0];
  eq([made.status, made.client_links.map((l: any) => l.client_key)], ['inactive', ['company:co-7']]);
  await db.query('DELETE FROM agencies WHERE id=$1', [made.id]);
  eq((await call('PATCH', `/agencies/${rival}`, { status: 'archived' }, 400)).json.code, 'STATUS_NOT_EDITABLE');
  eq((await db.query('SELECT status FROM agencies WHERE id=$1', [rival])).rows[0].status, 'active');
  // A live agency still edits, with its client links, in one transaction.
  const edited = (await call('PATCH', `/agencies/${rival}`, { name: 'Rival Renamed', client_links: [{ client_type: 'company', client_id: 'co-1' }] }, 200)).json[0];
  eq([edited.name, edited.client_links.map((l: any) => l.client_key)], ['Rival Renamed', ['company:co-1']]);

  // --- Restore: refused while another active agency claims the same client, then back with no link at all
  const restore = async (status: number) =>
    (await call('POST', `/agencies/${agency}/restore`, { operator_id: operator, expected_revision: (await advice()).revision, reason: 'Account reopened' }, status)).json;
  eq(await restore(409), { kind: 'refused', code: 'CONFLICT' });
  await call('PATCH', `/agencies/${rival}`, { client_links: [] }, 200);
  eq(await restore(200), { kind: 'committed', result: { agency_id: agency } });
  eq(await row(), ['active', null]);
  eq((await db.query('SELECT count(*)::int AS n FROM agents WHERE agency_id=$1 AND portal_token IS NOT NULL', [agency])).rows[0].n, 0);
  eq((await events('agency.restored'))[0].details, { identity_verified: false, source: 'legacy-api', stale_links_cleared: 2 });
  for (const dead of [agencyToken, 'f'.repeat(64)]) eq((await call('GET', `/agencies/by-token/${dead}`, null, 200)).json, []);
  for (const dead of [agentToken, '9'.repeat(64)]) eq((await call('GET', `/agents/by-token/${dead}`, null, 200)).json, []);

  // --- Issue: a fresh link only, never returned by the command
  const issued = await call('POST', `/agencies/${agency}/issue-link`, { operator_id: operator, expected_revision: (await advice()).revision }, 200);
  eq(issued.json, { kind: 'committed', result: { agency_id: agency } });
  const fresh = (await row())[1] as string;
  TOKENS.push(fresh);
  assert.match(fresh, /^[0-9a-f]{64}$/);
  eq([agencyToken, 'f'.repeat(64)].includes(fresh), false);
  const stale = (await advice()).revision;
  eq((await call('POST', `/agencies/${agency}/issue-agent-link`, { operator_id: operator, agent_id: idleAgent, expected_revision: stale }, 409)).json, { kind: 'refused', code: 'CONFLICT' });
  eq((await call('POST', `/agencies/${agency}/issue-agent-link`, { operator_id: operator, agent_id: agent, expected_revision: stale }, 200)).json, { kind: 'committed', result: { agency_id: agency, agent_id: agent } });
  // The agent issue advanced the agency revision, so the same request cannot rotate the link twice.
  eq((await call('POST', `/agencies/${agency}/issue-agent-link`, { operator_id: operator, agent_id: agent, expected_revision: stale }, 409)).json, { kind: 'refused', code: 'STALE_FACTS' });
  eq((await events('agent.link-issued')).length, 1);
  eq((await events('agency.link-issued'))[0].details, { identity_verified: false, source: 'legacy-api', replaced_existing: false });
  // Suspended agencies keep their portal, as before. These two existing reads return the row with its link,
  // so the leak guard is dropped for them only.
  TOKENS.length = 0;
  await call('PATCH', `/agencies/${agency}`, { status: 'suspended' }, 200);
  eq((await call('GET', `/agencies/by-token/${fresh}`, null, 200)).json.length, 1);

  console.log(`Agency lifecycle passed (${count} assertions) against disposable loopback PostgreSQL. No cloud/provider calls.`);
} finally {
  await pool?.end();
  await admin.end();
}
