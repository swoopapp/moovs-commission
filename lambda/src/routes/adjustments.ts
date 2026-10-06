import { Hono } from 'hono';
import { getAppPool } from '../appDb.js';
import { loadAgencyContext, audit } from '../workflowContext.js';
const app = new Hono(),
  UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.post('/workflow/adjustments', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (
    !b ||
    !UUID.test(b.agency_id ?? '') ||
    !UUID.test(b.source_payout_id ?? '') ||
    !UUID.test(b.request_key ?? '') ||
    typeof b.amount !== 'number' ||
    !Number.isFinite(b.amount) ||
    b.amount === 0 ||
    Math.abs(b.amount) > 1000000 ||
    Math.abs(b.amount * 100 - Math.round(b.amount * 100)) > 0.000001 ||
    typeof b.reason !== 'string' ||
    b.reason.trim().length < 3 ||
    b.reason.length > 2000 ||
    (b.moovs_trip_id != null &&
      (typeof b.moovs_trip_id !== 'string' || b.moovs_trip_id.length > 100))
  )
    return c.json(
      {
        error:
          'Valid source statement, signed amount, reason and request key required',
      },
      400,
    );
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    await loadAgencyContext(client, b.agency_id, b.operator_id);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      b.request_key,
    ]);
    const existing = (
      await client.query(
        'SELECT * FROM commission_adjustments WHERE request_key=$1',
        [b.request_key],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.agency_id !== b.agency_id ||
        existing.source_payout_id !== b.source_payout_id ||
        Number(existing.amount) !== b.amount ||
        existing.reason !== b.reason.trim() ||
        (existing.moovs_trip_id ?? null) !== (b.moovs_trip_id ?? null)
      )
        throw new Error('Request key conflict');
      await client.query('COMMIT');
      return c.json({ adjustment: existing }, 200);
    }
    const source = (
      await client.query(
        "SELECT * FROM payouts WHERE id=$1 AND agency_id=$2 AND operator_id=$3 AND status='paid' FOR SHARE",
        [b.source_payout_id, b.agency_id, b.operator_id],
      )
    ).rows[0];
    if (!source?.statement_snapshot)
      throw new Error('Source statement not found');
    if (
      b.moovs_trip_id &&
      !source.statement_snapshot.lines.some(
        (l: any) => l.moovs_trip_id === b.moovs_trip_id,
      )
    )
      throw new Error('Booking not in source statement');
    const actor = c.req.header('x-workflow-actor') || 'admin';
    const row = (
      await client.query(
        'INSERT INTO commission_adjustments(agency_id,source_payout_id,moovs_trip_id,amount,reason,actor,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          b.agency_id,
          b.source_payout_id,
          b.moovs_trip_id ?? null,
          b.amount,
          b.reason.trim(),
          actor,
          b.request_key,
        ],
      )
    ).rows[0];
    await audit(
      client,
      b.agency_id,
      b.moovs_trip_id ?? null,
      'adjustment.created',
      actor,
      b.reason.trim(),
      {
        adjustment_id: row.id,
        source_payout_id: b.source_payout_id,
        amount: b.amount,
      },
    );
    await client.query('COMMIT');
    return c.json({ adjustment: row }, 201);
  } catch {
    await client.query('ROLLBACK');
    return c.json(
      {
        error: 'Adjustment unavailable in agency scope or request key conflict',
      },
      409,
    );
  } finally {
    client.release();
  }
});
app.post('/workflow/adjustments/:id/cancel', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (
    !b ||
    !UUID.test(b.agency_id ?? '') ||
    !UUID.test(c.req.param('id')) ||
    typeof b.reason !== 'string' ||
    b.reason.trim().length < 3 ||
    b.reason.length > 2000
  )
    return c.json({ error: 'Cancellation reason required' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    await loadAgencyContext(client, b.agency_id, b.operator_id);
    const r = (
      await client.query(
        'SELECT * FROM commission_adjustments WHERE id=$1 AND agency_id=$2 FOR UPDATE',
        [c.req.param('id'), b.agency_id],
      )
    ).rows[0];
    if (!r || r.applied_payout_id) throw new Error('Not pending');
    if (!r.cancelled_at) {
      await client.query(
        'UPDATE commission_adjustments SET cancelled_at=now() WHERE id=$1',
        [r.id],
      );
      await audit(
        client,
        b.agency_id,
        r.moovs_trip_id,
        'adjustment.cancelled',
        c.req.header('x-workflow-actor') || 'admin',
        b.reason.trim(),
        { adjustment_id: r.id },
      );
    }
    await client.query('COMMIT');
    return c.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return c.json(
      { error: 'Only unapplied adjustments may be cancelled' },
      409,
    );
  } finally {
    client.release();
  }
});
export default app;
