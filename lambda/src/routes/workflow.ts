import { fetchAuthoritativeReservations } from '../moovsReservationFacts.js';
import { Hono } from 'hono';
import { appQuery, getAppPool } from '../appDb.js';
import { agencyTrip, loadAgencyContext, audit } from '../workflowContext.js';
import {
  commissionFingerprint,
  agentMatch,
  eligibilityIssues,
} from '../../../src/lib/commission-workflow.ts';
import { validateRules, validDate } from '../../../src/lib/commission-rules.ts';
const app = new Hono();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasonFor = (v: unknown) =>
  typeof v === 'string' && v.trim().length >= 3 && v.trim().length <= 2000
    ? v.trim()
    : null;
// Actor is overwritten by the authenticated Next.js proxy, never taken from the browser.
function actorFor(c: any) {
  return c.req.header('x-workflow-actor') || 'admin';
}
app.get('/workflow', async (c) => {
  const agencyId = c.req.query('agency_id');
  const batch = c.req.query('agency_ids');
  const ids =
    batch !== undefined ? [...new Set(batch.split(','))] : [agencyId ?? ''];
  if (
    (batch !== undefined && agencyId !== undefined) ||
    !ids.length ||
    ids.length > 50 ||
    ids.some((id) => !UUID.test(id))
  )
    return c.json({ error: 'Invalid agency scope' }, 400);
  const [reviews, adjustments, events, questions] = await Promise.all([
    appQuery(
      'SELECT * FROM commission_reviews WHERE agency_id=ANY($1::uuid[])',
      [ids],
    ),
    appQuery(
      'SELECT * FROM commission_adjustments WHERE agency_id=ANY($1::uuid[]) ORDER BY created_at DESC',
      [ids],
    ),
    appQuery(
      `SELECT id,agency_id,moovs_trip_id,action,actor,reason,created_at FROM
      (SELECT *,row_number() OVER (PARTITION BY agency_id ORDER BY created_at DESC,id DESC) AS rank
       FROM commission_workflow_events WHERE agency_id=ANY($1::uuid[])) e
      WHERE rank<=200 ORDER BY created_at DESC,id DESC`,
      [ids],
    ),
    appQuery(
      'SELECT id,agency_id,agent_id,moovs_trip_id,message,status,resolution,created_at,resolved_at FROM commission_questions WHERE agency_id=ANY($1::uuid[]) ORDER BY created_at DESC',
      [ids],
    ),
  ]);
  const result = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        reviews: [] as any[],
        events: [] as any[],
        questions: [] as any[],
        adjustments: [] as any[],
      },
    ]),
  );
  for (const r of reviews.rows)
    result[r.agency_id].reviews.push({
      ...r,
      expected_payment_date:
        r.expected_payment_date instanceof Date
          ? r.expected_payment_date.toISOString().slice(0, 10)
          : r.expected_payment_date,
    });
  for (const r of adjustments.rows)
    result[r.agency_id].adjustments.push({ ...r, amount: Number(r.amount) });
  for (const r of events.rows) result[r.agency_id].events.push(r);
  for (const r of questions.rows) result[r.agency_id].questions.push(r);
  return c.json(batch !== undefined ? result : result[ids[0]]);
});
app.post('/workflow/review', async (c) => {
  const b = await c.req.json().catch(() => null),
    reason = reasonFor(b?.reason);
  if (
    !b ||
    !UUID.test(b.agency_id ?? '') ||
    typeof b.moovs_trip_id !== 'string' ||
    !['approved', 'held', 'rejected'].includes(b.status) ||
    !reason ||
    typeof b.fingerprint !== 'string' ||
    b.fingerprint.length > 8000 ||
    (b.expected_payment_date && !validDate(b.expected_payment_date))
  )
    return c.json({ error: 'Invalid review or reason' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${b.agency_id}:${b.moovs_trip_id}`,
    ]);
    const ctx = await agencyTrip(
      client,
      b.agency_id,
      b.moovs_trip_id,
      b.operator_id,
    );
    const agentId = agentMatch(ctx.reservation, ctx.agents).agent?.id ?? null;
    const fingerprint = commissionFingerprint(
      ctx.reservation,
      ctx.agency,
      agentId,
      ctx.config,
    );
    if (fingerprint !== b.fingerprint) {
      await client.query('ROLLBACK');
      return c.json(
        { error: 'Booking/rate changed. Reload before reviewing.' },
        409,
      );
    }
    const linked = await client.query(
      `SELECT 1 FROM payout_reservations pr JOIN commission_reservations cr ON cr.id=pr.reservation_id JOIN payouts p ON p.id=pr.payout_id WHERE p.status<>'void' AND cr.operator_id=$1 AND cr.moovs_trip_id=$2`,
      [ctx.agency.operator_id, b.moovs_trip_id],
    );
    if (linked.rowCount) {
      await client.query('ROLLBACK');
      return c.json(
        {
          error:
            'Already in a settlement. Record a correction note; do not rewrite its approval.',
        },
        409,
      );
    }
    const issues = eligibilityIssues(ctx.reservation, ctx.agency, ctx.agents);
    if (b.status === 'approved' && issues.length) {
      await client.query('ROLLBACK');
      return c.json({ error: issues.join(' ') }, 409);
    }
    const actor = actorFor(c);
    await client.query(
      `INSERT INTO commission_reviews(agency_id,moovs_trip_id,status,reason,fingerprint,expected_payment_date,actor) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(agency_id,moovs_trip_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,fingerprint=EXCLUDED.fingerprint,expected_payment_date=EXCLUDED.expected_payment_date,actor=EXCLUDED.actor,updated_at=now()`,
      [
        b.agency_id,
        b.moovs_trip_id,
        b.status,
        reason,
        fingerprint,
        b.expected_payment_date || null,
        actor,
      ],
    );
    await audit(
      client,
      b.agency_id,
      b.moovs_trip_id,
      `commission.${b.status}`,
      actor,
      reason,
      { fingerprint },
    );
    await client.query('COMMIT');
    return c.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return c.json({ error: 'Review could not be saved in agency scope.' }, 409);
  } finally {
    client.release();
  }
});
app.post('/workflow/rules', async (c) => {
  const b = await c.req.json().catch(() => null),
    reason = reasonFor(b?.reason);
  if (
    !b ||
    !UUID.test(b.agency_id ?? '') ||
    !reason ||
    typeof b.previous !== 'string'
  )
    return c.json({ error: 'Invalid rule request' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    const current = (
      await client.query(
        'SELECT * FROM agencies WHERE id=$1 AND operator_id=$2 FOR UPDATE',
        [b.agency_id, b.operator_id],
      )
    ).rows[0];
    if (!current) throw new Error('scope');
    const err = validateRules(b.rules, current.commission_type);
    if (err) {
      await client.query('ROLLBACK');
      return c.json({ error: err }, 400);
    }
    if (JSON.stringify(current.commission_rules) !== b.previous) {
      await client.query('ROLLBACK');
      return c.json({ error: 'Rules changed. Reload before saving.' }, 409);
    }
    await client.query(
      'UPDATE agencies SET commission_rules=$1,updated_at=now() WHERE id=$2',
      [JSON.stringify(b.rules), b.agency_id],
    );
    await audit(
      client,
      b.agency_id,
      null,
      'rules.updated',
      actorFor(c),
      reason,
      { before: current.commission_rules, after: b.rules },
    );
    await client.query('COMMIT');
    return c.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return c.json({ error: 'Rules could not be saved.' }, 409);
  } finally {
    client.release();
  }
});
app.post('/workflow/question-resolution', async (c) => {
  const b = await c.req.json().catch(() => null),
    reason = reasonFor(b?.resolution);
  if (!b || !UUID.test(b.agency_id ?? '') || !UUID.test(b.id ?? '') || !reason)
    return c.json({ error: 'Resolution required' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    await loadAgencyContext(client, b.agency_id, b.operator_id);
    const q = (
      await client.query(
        "UPDATE commission_questions SET status='resolved',resolution=$1,resolved_at=now() WHERE id=$2 AND agency_id=$3 AND status='open' RETURNING *",
        [reason, b.id, b.agency_id],
      )
    ).rows[0];
    if (!q) throw new Error('already resolved');
    await audit(
      client,
      b.agency_id,
      q.moovs_trip_id,
      'question.resolved',
      actorFor(c),
      reason,
      { question_id: q.id },
    );
    await client.query('COMMIT');
    return c.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return c.json({ error: 'Question not open in agency scope.' }, 409);
  } finally {
    client.release();
  }
});
app.post('/workflow/correction', async (c) => {
  const b = await c.req.json().catch(() => null),
    reason = reasonFor(b?.reason);
  if (
    !b ||
    !UUID.test(b.agency_id ?? '') ||
    typeof b.moovs_trip_id !== 'string' ||
    !reason
  )
    return c.json({ error: 'Correction reason required' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    await loadAgencyContext(client, b.agency_id, b.operator_id);
    const linked = await client.query(
      `SELECT p.id FROM payouts p JOIN payout_reservations pr ON pr.payout_id=p.id JOIN commission_reservations cr ON cr.id=pr.reservation_id WHERE p.agency_id=$1 AND cr.moovs_trip_id=$2`,
      [b.agency_id, b.moovs_trip_id],
    );
    if (!linked.rowCount) throw new Error('not settled');
    await audit(
      client,
      b.agency_id,
      b.moovs_trip_id,
      'settlement.correction-noted',
      actorFor(c),
      reason,
      { payout_id: linked.rows[0].id },
    );
    await client.query('COMMIT');
    return c.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return c.json({ error: 'Settlement not found in scope.' }, 409);
  } finally {
    client.release();
  }
});
export default app;

app.post('/workflow/facts', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (
    !b ||
    typeof b.operator_id !== 'string' ||
    !Array.isArray(b.trip_ids) ||
    b.trip_ids.length > 1000 ||
    b.trip_ids.some((id: unknown) => typeof id !== 'string' || id.length > 100)
  )
    return c.json({ error: 'Invalid fact request' }, 400);
  const co = (
    await appQuery(
      'SELECT moovs_operator_id FROM commission_operators WHERE id=$1',
      [b.operator_id],
    )
  ).rows[0];
  if (!co) return c.json({ error: 'Operator not found' }, 404);
  const rows = await fetchAuthoritativeReservations(
    b.operator_id,
    co.moovs_operator_id,
    b.trip_ids,
    { includeCancelled: b.include_cancelled === true },
  );
  return c.json(
    rows.map((r) => ({
      ...r,
      id: `live:${b.operator_id}:${r.moovs_trip_id}`,
      synced_at: new Date().toISOString(),
    })),
  );
});
