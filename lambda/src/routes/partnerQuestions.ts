import { Hono } from 'hono';
import { getAppPool } from '../appDb.js';
import { agencyTrip } from '../workflowContext.js';
import { agentMatch } from '../../../src/lib/commission-workflow.ts';
const app = new Hono();
app.post('/internal/partner-question', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (
    !b ||
    typeof b.token !== 'string' ||
    b.token.length < 24 ||
    b.token.length > 128 ||
    typeof b.message !== 'string' ||
    b.message.trim().length < 3 ||
    b.message.length > 2000 ||
    typeof b.moovs_trip_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.request_key ?? '',
    )
  )
    return c.json({ error: 'Invalid question' }, 400);
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    let agency = (
      await client.query(
        "SELECT id FROM agencies WHERE portal_token=$1 AND status='active'",
        [b.token],
      )
    ).rows[0];
    let agent: any = null;
    if (!agency) {
      agent = (
        await client.query(
          "SELECT ag.* FROM agents ag JOIN agencies a ON a.id=ag.agency_id WHERE ag.portal_token=$1 AND ag.status='active' AND a.status='active'",
          [b.token],
        )
      ).rows[0];
      if (agent) agency = { id: agent.agency_id };
    }
    if (!agency) {
      await client.query('ROLLBACK');
      return c.json({ error: 'Not found' }, 404);
    }
    const submittedBy = agent ? `agent:${agent.id}` : `agency:${agency.id}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      submittedBy,
    ]);
    const existing = (
      await client.query(
        'SELECT id,moovs_trip_id,message FROM commission_questions WHERE submitted_by=$1 AND request_key=$2',
        [submittedBy, b.request_key],
      )
    ).rows[0];
    if (existing) {
      await client.query('COMMIT');
      return existing.moovs_trip_id === b.moovs_trip_id &&
        existing.message === b.message.trim()
        ? c.json({ id: existing.id }, 200)
        : c.json({ error: 'Request key conflict' }, 409);
    }
    const ctx = await agencyTrip(client, agency.id, b.moovs_trip_id);
    if (
      agent &&
      agentMatch(ctx.reservation, ctx.agents).agent?.id !== agent.id
    ) {
      await client.query('ROLLBACK');
      return c.json({ error: 'Not found' }, 404);
    }
    const count = (
      await client.query(
        "SELECT COUNT(*)::int AS n FROM commission_questions WHERE submitted_by=$1 AND created_at>now()-interval '1 hour'",
        [submittedBy],
      )
    ).rows[0].n;
    if (count >= 12) {
      await client.query('ROLLBACK');
      return c.json({ error: 'Too many questions. Try again later.' }, 429);
    }
    const result = await client.query(
      'INSERT INTO commission_questions(agency_id,agent_id,moovs_trip_id,submitted_by,request_key,message) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [
        agency.id,
        agent?.id ?? null,
        b.moovs_trip_id,
        submittedBy,
        b.request_key,
        b.message.trim(),
      ],
    );
    await client.query('COMMIT');
    return c.json({ id: result.rows[0].id }, 201);
  } catch {
    await client.query('ROLLBACK');
    return c.json({ error: 'Booking unavailable for this partner.' }, 409);
  } finally {
    client.release();
  }
});
export default app;
