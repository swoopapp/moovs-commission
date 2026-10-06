import adjustmentsRoute from '../src/routes/adjustments.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Hono } from 'hono';
import { ensureCommissionTables, getAppPool } from '../src/appDb.js';
import { getPool } from '../src/db.js';
import workflow from '../src/routes/workflow.js';
import financePeriod from '../src/routes/financePeriod.js';
import questions from '../src/routes/partnerQuestions.js';
import payouts from '../src/routes/payoutsCrud.js';
import reservations from '../src/routes/reservations.js';
import persisted from '../src/routes/commissionReservations.js';
import attributionsRoute from '../src/routes/attributions.js';
import { agencyTrip } from '../src/workflowContext.js';
import { commissionFingerprint } from '../../src/lib/commission-workflow.ts';

const connection = new URL(process.env.WORKFLOW_QA_DATABASE_URL ?? '');
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname),
  'QA must be loopback',
);
assert.equal(
  connection.pathname,
  '/moovs_commission_qa',
  'Dedicated disposable database required',
);
assert.notEqual(process.env.NODE_ENV, 'production');
const admin = new pg.Pool({ connectionString: connection.toString() });
const schema = `qa_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
const sessionZone = process.env.WORKFLOW_QA_SESSION_TIMEZONE ?? 'UTC';
assert.ok(['UTC', 'Pacific/Honolulu'].includes(sessionZone));
connection.searchParams.set(
  'options',
  `-c search_path=${schema},public -c timezone=${sessionZone}`,
);
process.env.LOCAL_APP_DATABASE_URL = connection.toString();
process.env.LOCAL_MOOVS_DATABASE_URL = connection.toString();
let count = 0;
const eq = (a: unknown, b: unknown) => {
  count++;
  assert.deepEqual(a, b);
};
const app = new Hono();
app.route('/', workflow);
app.route('/', financePeriod);
app.route('/', adjustmentsRoute);
app.route('/', questions);
app.route('/', payouts);
app.route('/', reservations);
app.route('/', persisted);
app.route('/', attributionsRoute);
async function request(
  path: string,
  body: any,
  status: number,
  method = 'POST',
) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-workflow-actor': 'operator:qa',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  count++;
  assert.equal(res.status, status, `${path}: ${JSON.stringify(json)}`);
  return json;
}
const operator = randomUUID(),
  agency = randomUUID(),
  agent = randomUUID(),
  otherAgent = randomUUID(),
  otherOperator = randomUUID(),
  otherAgency = randomUUID(),
  req = randomUUID(),
  trip = randomUUID(),
  tripOther = randomUUID(),
  tripCancelled = randomUUID(),
  route = randomUUID(),
  shuttle = randomUUID(),
  sc = randomUUID(),
  rv = randomUUID(),
  rd = randomUUID();
const agencyToken = 'a'.repeat(64),
  agentToken = 'b'.repeat(64);
let pool: pg.Pool | undefined, replica: pg.Pool | undefined;
try {
  pool = await getAppPool();
  replica = await getPool();
  await ensureCommissionTables();
  const migration = readFileSync(
    'migrations/20261005_commission_workflow.sql',
    'utf8',
  );
  await pool.query(migration);
  await pool.query(migration);
  const financeMigration = readFileSync(
    'migrations/20261005_commission_finance_clarity.sql',
    'utf8',
  );
  await pool.query(financeMigration);
  await pool.query(financeMigration);
  count++;
  await replica.query(
    readFileSync('scripts/fixtures/moovs-workflow.sql', 'utf8'),
  );
  await replica.query(
    "INSERT INTO operator VALUES('moovs-qa','America/Los_Angeles'),('other-moovs','America/New_York')",
  );
  await pool.query(
    "INSERT INTO commission_operators(id,moovs_operator_id,slug,display_name,auth_password) VALUES($1,'moovs-qa','qa','QA','not-used'),($2,'other-moovs','other','Other','not-used')",
    [operator, otherOperator],
  );
  await pool.query(
    "INSERT INTO agencies(id,operator_id,moovs_company_id,name,commission_rate,commission_type,commission_base,rate_mode,portal_token) VALUES($1,$2,'company-qa','QA Agency',10,'percent','total_amount','fixed',$3),($4,$5,'other-company','Other Agency',10,'percent','total_amount','fixed',$6)",
    [agency, operator, agencyToken, otherAgency, otherOperator, 'c'.repeat(64)],
  );
  await pool.query(
    "INSERT INTO agency_client_links(agency_id,operator_id,client_key,client_type,client_id) VALUES($1,$2,'company:company-qa','company','company-qa'),($1,$2,$3,'shuttle_client',$4)",
    [agency, operator, `shuttle_client:${sc}`, sc],
  );
  await pool.query(
    "INSERT INTO agents(id,agency_id,name,email,moovs_contact_id,portal_token) VALUES($1,$2,'Booking Agent','agent@example.com','booking-contact',$3),($4,$2,'Other Agent','other@example.com','other-contact',$5)",
    [agent, agency, agentToken, otherAgent, 'd'.repeat(64)],
  );
  await replica.query(
    "INSERT INTO request VALUES($1,'moovs-qa','QA-100','company-qa','team','one_way')",
    [req],
  );
  for (const t of [trip, tripOther, tripCancelled]) {
    await replica.query('INSERT INTO trip VALUES($1,$2,NULL,NULL,NULL)', [
      t,
      req,
    ]);
    await replica.query(
      "INSERT INTO route(route_id,trip_id,public_id,base_rate_amt,tax_amt,status_slug) VALUES($1,$2,'public-qa',10000,2000,$3)",
      [
        t === trip ? route : randomUUID(),
        t,
        t === tripCancelled ? 'cancelled' : 'completed',
      ],
    );
    await replica.query(
      "INSERT INTO stop VALUES($1,0,'2026-09-30T23:59:00Z','Airport','traveler'),($1,1,'2026-10-01T00:30:00Z','Hotel',NULL)",
      [t],
    );
  }
  await replica.query(
    "INSERT INTO contact VALUES('booking-contact','Booking','Agent','agent@example.com'),('traveler','Actual','Traveler','traveler@example.com'); INSERT INTO contact_team VALUES('team','booking-contact')",
  );
  await replica.query(
    "INSERT INTO shuttle_client VALUES($1,'moovs-qa',NULL,'Shuttle-only client')",
    [sc],
  );
  await replica.query(
    "INSERT INTO shuttle_route_definition VALUES($1,'moovs-qa',NULL,'Airport route')",
    [rd],
  );
  await replica.query(
    'INSERT INTO shuttle_route_definition_version VALUES($1,$2)',
    [rv, rd],
  );
  await replica.query(
    "INSERT INTO shuttle_booking(booking_id,operator_id,external_reservation_id,shuttle_client_id,route_version_id,travel_date,booking_status) VALUES($1,'moovs-qa','QA-SHUTTLE',$2,$3,'2026-09-30','completed')",
    [shuttle, sc, rv],
  );
  await replica.query(
    'INSERT INTO shuttle_payment(booking_id,amount_in_cents,shuttle_payment_id) VALUES($1,5000,$1)',
    [shuttle],
  );
  // Naive stops, real scheduled instants and service dates must remain distinct.
  eq(
    (
      await replica.query(
        "SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='stop' AND column_name='date_time'",
        [schema],
      )
    ).rows[0].data_type,
    'timestamp without time zone',
  );
  await replica.query(
    "UPDATE stop SET date_time='2026-10-01 00:01:00' WHERE trip_id=$1 AND stop_index=0",
    [trip],
  );
  await replica.query(
    "UPDATE stop SET date_time='2026-09-30 23:59:59.999999' WHERE trip_id=$1 AND stop_index=0",
    [tripOther],
  );
  await replica.query(
    "UPDATE stop SET date_time='2026-10-02 00:00:00' WHERE trip_id=$1 AND stop_index=0",
    [tripCancelled],
  );
  await replica.query(
    "UPDATE shuttle_booking SET scheduled_pickup_time='2026-10-01T06:30:00Z' WHERE booking_id=$1",
    [shuttle],
  );
  const october = await request(
    '/fetch-reservations',
    { operator_id: 'moovs-qa', date_from: '2026-10-01', date_to: '2026-10-01' },
    200,
  );
  eq(
    october.reservations.map((r: any) => r['Trip ID']),
    [trip],
  );
  eq(october.reservations[0]['Travel Day'], '2026-10-01');
  eq(
    october.reservations[0]['Pickup Date Time'],
    '2026-10-01T00:01:00.000000Z',
  );
  const september = await request(
    '/fetch-reservations',
    { operator_id: 'moovs-qa', date_from: '2026-09-30', date_to: '2026-09-30' },
    200,
  );
  eq(september.reservations.length, 2);
  const shuttleDate = september.reservations.find(
    (r: any) => r['Trip ID'] === shuttle,
  );
  eq(shuttleDate['Travel Day'], '2026-09-30');
  eq(shuttleDate['Pickup Date Time'], '2026-10-01T06:30:00.000Z');
  const manifest = await request(
    '/workflow/period',
    { operator_id: operator, date_from: '2026-09-30', date_to: '2026-09-30' },
    200,
  );
  eq(manifest.total, 2);
  eq(manifest.metadata.complete, true);
  eq(manifest.metadata.time_zone, 'America/Los_Angeles');
  eq(
    manifest.identities.every((i: any) => i.travel_day === '2026-09-30'),
    true,
  );
  eq(
    manifest.identities.some(
      (i: any) => i.moovs_trip_id === shuttle && i.source === 'shuttle',
    ),
    true,
  );
  const periodFacts = await request(
    '/workflow/facts',
    {
      operator_id: operator,
      trip_ids: manifest.identities.map((i: any) => i.moovs_trip_id),
      include_cancelled: true,
    },
    200,
  );
  eq(periodFacts.length, 2);
  eq(
    periodFacts.find((r: any) => r.moovs_trip_id === shuttle).travel_day,
    '2026-09-30',
  );
  eq(
    periodFacts.find((r: any) => r.moovs_trip_id === shuttle).pickup_date,
    '2026-10-01T06:30:00.000Z',
  );
  const emptyManifest = await request(
    '/workflow/period',
    {
      operator_id: otherOperator,
      date_from: '2026-09-30',
      date_to: '2026-09-30',
    },
    200,
  );
  eq(emptyManifest.total, 0);
  eq(emptyManifest.identities.length, 0);
  eq(emptyManifest.metadata.complete, true);
  await replica.query(
    "INSERT INTO shuttle_booking(booking_id,operator_id,travel_date) SELECT gen_random_uuid(),'other-moovs','2026-09-30' FROM generate_series(1,25001)",
  );
  const tooLarge = await request(
    '/workflow/period',
    {
      operator_id: otherOperator,
      date_from: '2026-09-30',
      date_to: '2026-09-30',
    },
    200,
  );
  eq(tooLarge.total, 25001);
  eq(tooLarge.metadata.complete, false);
  eq(tooLarge.identities.length, 0);
  await replica.query(
    "DELETE FROM shuttle_booking WHERE operator_id='other-moovs'",
  );

  await request(
    '/workflow/period',
    { operator_id: operator, date_from: 'bad', date_to: '2026-09-30' },
    400,
  );
  await request(
    '/workflow/period',
    { operator_id: operator, date_from: '2026-10-01', date_to: '2026-09-30' },
    400,
  );
  await replica.query(
    'UPDATE shuttle_booking SET cancelled_at=now() WHERE booking_id=$1',
    [shuttle],
  );
  const cancelledManifest = await request(
    '/workflow/period',
    { operator_id: operator, date_from: '2026-09-30', date_to: '2026-09-30' },
    200,
  );
  eq(cancelledManifest.total, 2);
  const cancelledFacts = await request(
    '/workflow/facts',
    { operator_id: operator, trip_ids: [shuttle], include_cancelled: true },
    200,
  );
  eq(cancelledFacts.length, 1);
  const legacyFacts = await request(
    '/workflow/facts',
    { operator_id: operator, trip_ids: [shuttle] },
    200,
  );
  eq(legacyFacts.length, 0);
  await replica.query(
    'UPDATE shuttle_booking SET cancelled_at=NULL WHERE booking_id=$1',
    [shuttle],
  );

  const dateClient = await pool.connect();
  const dateFact = await agencyTrip(dateClient, agency, trip, operator);
  eq(dateFact.reservation.travel_day, '2026-10-01');
  eq(dateFact.reservation.pickup_date, '2026-10-01T00:01:00.000000Z');
  const shuttleFact = await agencyTrip(dateClient, agency, shuttle, operator);
  eq(shuttleFact.reservation.travel_day, '2026-09-30');
  dateClient.release();
  eq(
    typeof (await pool.query("SELECT '2026-09-30'::date AS calendar_day"))
      .rows[0].calendar_day,
    'string',
  );
  await replica.query(
    "UPDATE stop SET date_time='2026-09-30 23:59:00' WHERE stop_index=0",
  );
  await replica.query(
    'UPDATE shuttle_booking SET scheduled_pickup_time=NULL WHERE booking_id=$1',
    [shuttle],
  );
  const client = await pool.connect();
  let ctx = await agencyTrip(client, agency, trip, operator);
  eq(ctx.reservation.passenger_name, 'Actual Traveler');
  eq(ctx.reservation.booking_contact_name, 'Booking Agent');
  eq(ctx.reservation.moovs_request_id, req);
  eq(ctx.reservation.refund_amount, 0);
  const fp = commissionFingerprint(
    ctx.reservation as any,
    ctx.agency,
    agent,
    ctx.config,
  );
  client.release();
  const review = {
    operator_id: operator,
    agency_id: agency,
    moovs_trip_id: trip,
    status: 'approved',
    reason: 'Verified contact and travel',
    fingerprint: fp,
    expected_payment_date: '2026-10-15',
  };
  const body = {
    idempotency_key: randomUUID(),
    operator_id: operator,
    agency_id: agency,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    method: 'Other',
    status: 'draft',
    adjustments: 0,
    notes: 'QA close',
    items: [{ moovs_trip_id: trip, agent_id: agent }],
  };
  await request('/payouts/create-from-trips', body, 409);
  await request('/workflow/review', { ...review, fingerprint: 'stale' }, 409);
  await request('/workflow/review', review, 200);
  const w = await request(`/workflow?agency_id=${agency}`, null, 200, 'GET');
  eq(w.reviews[0].expected_payment_date, '2026-10-15');
  // Disposable-only rows: batch isolation, per-agency event limit and compatible date/amount shapes.
  await pool.query(
    "INSERT INTO commission_workflow_events(agency_id,action,actor,reason) SELECT $1,'batch-qa','qa','Synthetic batch event' FROM generate_series(1,205)",
    [agency],
  );
  await pool.query(
    "INSERT INTO commission_workflow_events(agency_id,action,actor,reason) VALUES($1,'batch-qa','qa','Other synthetic agency')",
    [otherAgency],
  );
  const batchWorkflow = await request(
    `/workflow?agency_ids=${agency},${otherAgency}`,
    null,
    200,
    'GET',
  );
  eq(Object.keys(batchWorkflow).length, 2);
  eq(batchWorkflow[agency].reviews[0].expected_payment_date, '2026-10-15');
  eq(batchWorkflow[otherAgency].reviews.length, 0);
  eq(batchWorkflow[agency].events.length, 200);
  eq(batchWorkflow[otherAgency].events.length, 1);
  eq(
    batchWorkflow[agency].events.every((e: any) => e.agency_id === agency),
    true,
  );
  eq(
    batchWorkflow[otherAgency].events.every(
      (e: any) => e.agency_id === otherAgency,
    ),
    true,
  );
  await request(
    `/workflow?agency_ids=${agency}&agency_id=${agency}`,
    null,
    400,
    'GET',
  );
  await request('/workflow?agency_ids=', null, 400, 'GET');
  await request('/workflow?agency_ids=invalid', null, 400, 'GET');
  await request(
    '/workflow?agency_ids=' +
      Array.from({ length: 51 }, () => randomUUID()).join(','),
    null,
    400,
    'GET',
  );
  await pool.query(
    "DELETE FROM commission_workflow_events WHERE action='batch-qa'",
  );

  await request(
    '/workflow/review',
    { ...review, operator_id: otherOperator },
    409,
  );
  const c2 = await pool.connect();
  const cancelled = await agencyTrip(c2, agency, tripCancelled, operator);
  c2.release();
  await request(
    '/workflow/review',
    {
      ...review,
      moovs_trip_id: tripCancelled,
      fingerprint: commissionFingerprint(
        cancelled.reservation as any,
        cancelled.agency,
        agent,
        cancelled.config,
      ),
    },
    409,
  );
  await replica.query('UPDATE route SET base_rate_amt=11000 WHERE trip_id=$1', [
    trip,
  ]);
  await request('/payouts/create-from-trips', body, 409);
  await replica.query('UPDATE route SET base_rate_amt=10000 WHERE trip_id=$1', [
    trip,
  ]);
  const all = await request(
    '/fetch-reservations',
    {
      operator_id: 'moovs-qa',
      date_from: '2026-09-30',
      date_to: '2026-09-30',
      client_keys: ['company:company-qa', `shuttle_client:${sc}`],
    },
    200,
  );
  eq(all.reservations.length, 4);
  eq(
    all.reservations.find((r: any) => r['Trip ID'] === shuttle)[
      'Refund Amount'
    ],
    0,
  );
  eq(
    all.reservations.find((r: any) => r['Trip ID'] === trip)['Request ID'],
    req,
  );
  const key = randomUUID();
  const question = {
    token: agentToken,
    moovs_trip_id: trip,
    message: 'Please explain the calculated base',
    request_key: key,
  };
  const q = await request('/internal/partner-question', question, 201);
  await request('/internal/partner-question', question, 200);
  await request(
    '/internal/partner-question',
    { ...question, message: 'A changed request' },
    409,
  );
  await request(
    '/internal/partner-question',
    { ...question, token: 'd'.repeat(64), request_key: randomUUID() },
    404,
  );
  await request(
    '/workflow/question-resolution',
    {
      operator_id: otherOperator,
      agency_id: agency,
      id: q.id,
      resolution: 'Not allowed',
    },
    409,
  );
  await request(
    '/workflow/question-resolution',
    {
      operator_id: operator,
      agency_id: agency,
      id: q.id,
      resolution: 'Base excludes gratuity',
    },
    200,
  );
  await request(
    '/workflow/question-resolution',
    {
      operator_id: operator,
      agency_id: agency,
      id: q.id,
      resolution: 'Cannot overwrite',
    },
    409,
  );
  const created = await request(
    '/payouts/create-from-trips',
    {
      ...body,
      total_commission: 999999,
      items: [
        { moovs_trip_id: trip, agent_id: agent, commission_amount: 999999 },
      ],
    },
    201,
  );
  eq(Number(created.payout.net_payout), 12);
  eq(created.payout.statement_snapshot.lines[0].commission_amount, 12);
  const operatorAttrs = await request(
    `/attributions?operator_id=${operator}`,
    null,
    200,
    'GET',
  );
  eq(operatorAttrs.length, 1);
  eq(operatorAttrs[0].moovs_trip_id, trip);
  const foreignAttrs = await request(
    `/attributions?operator_id=${otherOperator}`,
    null,
    200,
    'GET',
  );
  eq(foreignAttrs.length, 0);
  eq(
    created.payout.statement_snapshot.lines[0].booking_contact_name,
    'Booking Agent',
  );
  const snapshot = created.payout.statement_snapshot;
  await request('/payouts/create-from-trips', body, 200);
  await request('/payouts/create-from-trips', { ...body, adjustments: 1 }, 409);
  await request(
    '/payouts/create-from-trips',
    { ...body, idempotency_key: randomUUID() },
    409,
  );
  await request('/workflow/review', review, 409);
  await request(
    `/payouts/${body.idempotency_key}`,
    { net_payout: 999 },
    409,
    'PATCH',
  );
  await request(
    '/workflow/correction',
    {
      operator_id: operator,
      agency_id: agency,
      moovs_trip_id: trip,
      reason: 'Correction noted, do not rewrite',
    },
    200,
  );
  const payment = {
    operator_id: operator,
    method: 'Check',
    date_paid: '2026-10-05',
    reference_number: 'QA-EXTERNAL',
  };
  await request(
    `/payouts/${body.idempotency_key}/record-payment`,
    { ...payment, date_paid: '2026-02-30' },
    400,
  );
  await replica.query(
    "UPDATE route SET status_slug='cancelled' WHERE trip_id=$1",
    [trip],
  );
  await request(
    `/payouts/${body.idempotency_key}/record-payment`,
    payment,
    409,
  );
  await replica.query(
    "UPDATE route SET status_slug='completed' WHERE trip_id=$1",
    [trip],
  );
  await request(
    `/payouts/${body.idempotency_key}/record-payment`,
    payment,
    200,
  );
  await request(
    `/payouts/${body.idempotency_key}/void`,
    { operator_id: operator, reason: 'Paid records cannot be voided' },
    409,
  );
  await request(
    `/payouts/${body.idempotency_key}/record-payment`,
    payment,
    200,
  );
  await request(
    `/payouts/${body.idempotency_key}/record-payment`,
    { ...payment, reference_number: 'different' },
    409,
  );
  eq(
    (
      await pool.query('SELECT statement_snapshot FROM payouts WHERE id=$1', [
        body.idempotency_key,
      ])
    ).rows[0].statement_snapshot,
    snapshot,
  );
  const rules = [
    {
      id: 'exception',
      label: 'Private transfers',
      service: 'private-transfer',
      route_id: null,
      rate: 15,
      effective_from: '2026-09-01',
      effective_to: null,
    },
  ];
  await request(
    '/workflow/rules',
    {
      operator_id: operator,
      agency_id: agency,
      previous: '[]',
      rules,
      reason: 'New agreement',
    },
    200,
  );
  await request(
    '/workflow/rules',
    {
      operator_id: operator,
      agency_id: agency,
      previous: '[]',
      rules,
      reason: 'Stale write',
    },
    409,
  );
  const c3 = await pool.connect();
  const repl = await agencyTrip(c3, agency, tripOther, operator);
  c3.release();
  const replReview = {
    ...review,
    moovs_trip_id: tripOther,
    fingerprint: commissionFingerprint(
      repl.reservation as any,
      repl.agency,
      agent,
      repl.config,
    ),
  };
  await request('/workflow/review', replReview, 200);
  const prep = {
    ...body,
    idempotency_key: randomUUID(),
    items: [{ moovs_trip_id: tripOther, agent_id: agent }],
  };
  const prepared = await request('/payouts/create-from-trips', prep, 201);
  await request(
    `/payouts/${prep.idempotency_key}/void`,
    { operator_id: otherOperator, reason: 'Wrong operator' },
    409,
  );
  await request(
    `/payouts/${prep.idempotency_key}/void`,
    { operator_id: operator, reason: 'Re-review rate agreement' },
    200,
  );
  await request(
    `/payouts/${prep.idempotency_key}/void`,
    { operator_id: operator, reason: 'Re-review rate agreement' },
    200,
  );
  await request(
    `/payouts/${prep.idempotency_key}/record-payment`,
    payment,
    409,
  );
  eq(
    (
      await pool.query('SELECT statement_snapshot FROM payouts WHERE id=$1', [
        prep.idempotency_key,
      ])
    ).rows[0].statement_snapshot,
    prepared.payout.statement_snapshot,
  );
  await request('/workflow/review', replReview, 200);
  await request(
    '/payouts/create-from-trips',
    { ...prep, idempotency_key: randomUUID() },
    201,
  );
  const collision = randomUUID();
  await pool.query(
    "INSERT INTO agencies(id,operator_id,moovs_company_id,name) VALUES($1,$2,'company-qa','Duplicate mapping')",
    [collision, operator],
  );
  await request(
    '/workflow/review',
    { ...review, moovs_trip_id: tripOther },
    409,
  );
  await pool.query("UPDATE agencies SET status='inactive' WHERE id=$1", [
    collision,
  ]);
  const shClient = await pool.connect();
  const sh = await agencyTrip(shClient, agency, shuttle, operator);
  shClient.release();
  const shReview = {
    ...review,
    moovs_trip_id: shuttle,
    fingerprint: commissionFingerprint(
      sh.reservation as any,
      sh.agency,
      null,
      sh.config,
    ),
  };
  await request('/workflow/review', shReview, 200);
  const shRefund = randomUUID();
  await replica.query(
    "INSERT INTO shuttle_refund(shuttle_refund_id,status) VALUES($1,'pending')",
    [shRefund],
  );
  await replica.query(
    "INSERT INTO shuttle_booking_refund_allocation VALUES($1,'moovs-qa',$2,500)",
    [shuttle, shRefund],
  );
  const shc = await pool.connect();
  const refunded = await agencyTrip(shc, agency, shuttle, operator);
  shc.release();
  eq(refunded.reservation.refund_amount, 5);
  await request(
    '/workflow/review',
    {
      ...shReview,
      fingerprint: commissionFingerprint(
        refunded.reservation as any,
        refunded.agency,
        null,
        refunded.config,
      ),
    },
    409,
  );
  const legacyRefund = randomUUID();
  await replica.query(
    "INSERT INTO shuttle_refund(shuttle_refund_id,status,shuttle_payment_id,operator_id,refund_amount_in_cents) VALUES($1,'succeeded',$2,'moovs-qa',300)",
    [legacyRefund, shuttle],
  );
  const legacyClient = await pool.connect();
  const legacyFact = await agencyTrip(legacyClient, agency, shuttle, operator);
  legacyClient.release();
  eq(legacyFact.reservation.refund_amount, 8);
  await replica.query('DELETE FROM shuttle_payment WHERE booking_id=$1', [
    shuttle,
  ]);
  const missingPriceClient = await pool.connect();
  const missingPriceFact = await agencyTrip(
    missingPriceClient,
    agency,
    shuttle,
    operator,
  );
  missingPriceClient.release();
  eq(missingPriceFact.reservation.refund_amount, null);
  for (let i = 0; i < 11; i++)
    await request(
      '/internal/partner-question',
      { ...question, request_key: randomUUID() },
      201,
    );
  await request(
    '/internal/partner-question',
    { ...question, request_key: randomUUID() },
    429,
  );
  const dateRows = await request(
    `/commission-reservations?operator_id=${operator}&date_from=2026-09-30&date_to=2026-09-30&client_keys=company:company-qa`,
    null,
    200,
    'GET',
  );
  eq(dateRows.length, 2);
  eq(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM commission_workflow_events WHERE action='settlement.external-payment-recorded' AND agency_id=$1",
        [agency],
      )
    ).rows[0].n,
    1,
  );
  const adjustmentBody = {
    operator_id: operator,
    agency_id: agency,
    source_payout_id: body.idempotency_key,
    moovs_trip_id: trip,
    amount: -5.25,
    reason: 'Correction to commission only',
    request_key: randomUUID(),
  };
  const debit = await request('/workflow/adjustments', adjustmentBody, 201);
  await request('/workflow/adjustments', adjustmentBody, 200);
  await request(
    '/workflow/adjustments',
    { ...adjustmentBody, amount: -6 },
    409,
  );
  await request(
    '/workflow/adjustments',
    {
      ...adjustmentBody,
      request_key: randomUUID(),
      operator_id: otherOperator,
    },
    409,
  );
  await request(
    '/workflow/adjustments',
    {
      ...adjustmentBody,
      request_key: randomUUID(),
      moovs_trip_id: randomUUID(),
    },
    409,
  );
  await request(
    '/workflow/adjustments',
    {
      ...adjustmentBody,
      request_key: randomUUID(),
      source_payout_id: prep.idempotency_key,
    },
    409,
  );
  await request(
    '/workflow/adjustments',
    { ...adjustmentBody, request_key: randomUUID(), amount: 1.234 },
    400,
  );
  const credit = await request(
    '/workflow/adjustments',
    { ...adjustmentBody, request_key: randomUUID(), amount: 2 },
    201,
  );
  const cancel = await request(
    '/workflow/adjustments',
    { ...adjustmentBody, request_key: randomUUID(), amount: 3 },
    201,
  );
  await request(
    `/workflow/adjustments/${cancel.adjustment.id}/cancel`,
    {
      operator_id: operator,
      agency_id: agency,
      reason: 'Not applicable anymore',
    },
    200,
  );
  await request(
    `/workflow/adjustments/${cancel.adjustment.id}/cancel`,
    {
      operator_id: operator,
      agency_id: agency,
      reason: 'Not applicable anymore',
    },
    200,
  );
  const correctionSettlement = {
    ...body,
    idempotency_key: randomUUID(),
    items: [],
    adjustment_ids: [debit.adjustment.id, credit.adjustment.id],
    period_start: '2026-10-01',
    period_end: '2026-10-31',
  };
  await request(
    '/payouts/create-from-trips',
    {
      ...correctionSettlement,
      agency_id: otherAgency,
      operator_id: otherOperator,
    },
    409,
  );
  await request(
    '/payouts/create-from-trips',
    { ...correctionSettlement, adjustment_ids: [cancel.adjustment.id] },
    409,
  );
  const corrected = await request(
    '/payouts/create-from-trips',
    correctionSettlement,
    201,
  );
  eq(Number(corrected.payout.net_payout), -3.25);
  eq(corrected.payout.statement_snapshot.adjustment_lines.length, 2);
  eq(corrected.payout.statement_snapshot.lines.length, 0);
  await request('/payouts/create-from-trips', correctionSettlement, 200);
  await request(
    '/payouts/create-from-trips',
    { ...correctionSettlement, adjustment_ids: [debit.adjustment.id] },
    409,
  );
  await request(
    '/payouts/create-from-trips',
    { ...correctionSettlement, idempotency_key: randomUUID() },
    409,
  );
  await request(
    `/workflow/adjustments/${debit.adjustment.id}/cancel`,
    {
      operator_id: operator,
      agency_id: agency,
      reason: 'Cannot cancel allocated ledger',
    },
    409,
  );
  const wf = await request(`/workflow?agency_id=${agency}`, null, 200, 'GET');
  eq(
    wf.adjustments.find((a: any) => a.id === debit.adjustment.id)
      .applied_payout_id,
    corrected.payout.id,
  );
  await request(
    `/payouts/${corrected.payout.id}/void`,
    {
      operator_id: operator,
      reason: 'Prepare replacement correction statement',
    },
    200,
  );
  eq(
    (
      await pool.query(
        'SELECT applied_payout_id FROM commission_adjustments WHERE id=$1',
        [debit.adjustment.id],
      )
    ).rows[0].applied_payout_id,
    null,
  );
  eq(
    (
      await pool.query('SELECT statement_snapshot FROM payouts WHERE id=$1', [
        corrected.payout.id,
      ])
    ).rows[0].statement_snapshot,
    corrected.payout.statement_snapshot,
  );
  const replaced = await request(
    '/payouts/create-from-trips',
    { ...correctionSettlement, idempotency_key: randomUUID() },
    201,
  );
  await request(
    `/payouts/${replaced.payout.id}/record-payment`,
    { ...payment, reference_number: 'Commission credit offset elsewhere' },
    200,
  );
  eq(
    (
      await pool.query('SELECT statement_snapshot FROM payouts WHERE id=$1', [
        body.idempotency_key,
      ])
    ).rows[0].statement_snapshot,
    snapshot,
  );
  const racing = await request(
    '/workflow/adjustments',
    { ...adjustmentBody, request_key: randomUUID(), amount: 4 },
    201,
  );
  const attempts = await Promise.all(
    [randomUUID(), randomUUID()].map((id) =>
      app.request('http://localhost/payouts/create-from-trips', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-workflow-actor': 'operator:qa',
        },
        body: JSON.stringify({
          ...correctionSettlement,
          idempotency_key: id,
          adjustment_ids: [racing.adjustment.id],
        }),
      }),
    ),
  );
  eq(attempts.map((r) => r.status).sort(), [201, 409]);
  eq(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM commission_adjustments WHERE id=$1 AND applied_payout_id IS NOT NULL',
        [racing.adjustment.id],
      )
    ).rows[0].n,
    1,
  );
  // Old approved bookings require explicit carry-forward; future trips remain forbidden.
  const carryTrip = randomUUID();
  await replica.query('INSERT INTO trip VALUES($1,$2,NULL,NULL,NULL)', [
    carryTrip,
    req,
  ]);
  await replica.query(
    "INSERT INTO route(route_id,trip_id,base_rate_amt,status_slug) VALUES($1,$2,10000,'completed')",
    [randomUUID(), carryTrip],
  );
  await replica.query(
    "INSERT INTO stop VALUES($1,0,'2026-08-31 23:59:00','Airport','traveler')",
    [carryTrip],
  );
  const carryClient = await pool.connect();
  const carryFact = await agencyTrip(carryClient, agency, carryTrip, operator);
  carryClient.release();
  await request(
    '/workflow/review',
    {
      ...review,
      moovs_trip_id: carryTrip,
      fingerprint: commissionFingerprint(
        carryFact.reservation as any,
        carryFact.agency,
        agent,
        carryFact.config,
      ),
    },
    200,
  );
  const carryBody = {
    ...body,
    idempotency_key: randomUUID(),
    items: [{ moovs_trip_id: carryTrip, agent_id: agent }],
  };
  await request('/payouts/create-from-trips', carryBody, 400);
  const carried = await request(
    '/payouts/create-from-trips',
    { ...carryBody, include_carry_forward: true },
    201,
  );
  eq(carried.payout.statement_snapshot.lines[0].travel_day, '2026-08-31');
  eq(carried.payout.statement_snapshot.include_carry_forward, true);
  await request(
    '/payouts/create-from-trips',
    { ...carryBody, include_carry_forward: true },
    200,
  );
  await request('/payouts/create-from-trips', carryBody, 409);
  const futureTrip = randomUUID();
  await replica.query('INSERT INTO trip VALUES($1,$2,NULL,NULL,NULL)', [
    futureTrip,
    req,
  ]);
  await replica.query(
    "INSERT INTO route(route_id,trip_id,base_rate_amt,status_slug) VALUES($1,$2,10000,'completed')",
    [randomUUID(), futureTrip],
  );
  await replica.query(
    "INSERT INTO stop VALUES($1,0,'2026-10-01 00:00:00','Airport','traveler')",
    [futureTrip],
  );
  const fc = await pool.connect();
  const future = await agencyTrip(fc, agency, futureTrip, operator);
  fc.release();
  await request(
    '/workflow/review',
    {
      ...review,
      moovs_trip_id: futureTrip,
      fingerprint: commissionFingerprint(
        future.reservation as any,
        future.agency,
        agent,
        future.config,
      ),
    },
    200,
  );
  await request(
    '/payouts/create-from-trips',
    {
      ...carryBody,
      idempotency_key: randomUUID(),
      items: [{ moovs_trip_id: futureTrip, agent_id: agent }],
      include_carry_forward: true,
    },
    400,
  );
  console.log(
    `Workflow integration passed (${count} assertions) against disposable loopback PostgreSQL. No cloud/provider calls.`,
  );
} finally {
  await pool?.end();
  await replica?.end();
  await admin.end();
}
