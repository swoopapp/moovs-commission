import { Hono } from 'hono';
import { appQuery } from '../appDb.js';
import { hasAdminSecret } from '../config.js';

const app = new Hono();
const MAX_IDS_PER_RESOURCE = 250;

type OwnershipRequest = {
  agencies?: unknown;
  agents?: unknown;
  reservations?: unknown;
  payouts?: unknown;
};

function normalizeIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const ids = Array.from(new Set(value.map((id) => (
    typeof id === 'string' ? id.trim() : ''
  )).filter(Boolean)));

  if (ids.length > MAX_IDS_PER_RESOURCE) return null;
  return ids;
}

// This endpoint exists only for the trusted Next.js BFF. It lets the BFF resolve
// ownership for opaque, ID-addressed resources before forwarding an operator
// session request. Browser callers never receive the admin secret required here.
app.post('/internal/ownership', async (c) => {
  if (!hasAdminSecret(c.req.header('x-admin-secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json<OwnershipRequest>();
    const agencies = normalizeIds(body.agencies);
    const agents = normalizeIds(body.agents);
    const reservations = normalizeIds(body.reservations);
    const payouts = normalizeIds(body.payouts);

    if (!agencies || !agents || !reservations || !payouts) {
      return c.json({ error: `Ownership lookups accept at most ${MAX_IDS_PER_RESOURCE} string IDs per resource` }, 400);
    }

    const result = await appQuery(
      `SELECT
         'agency'::text AS resource,
         a.id::text AS id,
         a.operator_id::text AS operator_id,
         a.id::text AS agency_id
       FROM agencies a
       WHERE a.id::text = ANY($1::text[])

       UNION ALL

       SELECT
         'agent'::text AS resource,
         ag.id::text AS id,
         a.operator_id::text AS operator_id,
         ag.agency_id::text AS agency_id
       FROM agents ag
       JOIN agencies a ON a.id = ag.agency_id
       WHERE ag.id::text = ANY($2::text[])

       UNION ALL

       SELECT
         'reservation'::text AS resource,
         r.id::text AS id,
         r.operator_id::text AS operator_id,
         NULL::text AS agency_id
       FROM commission_reservations r
       WHERE r.id::text = ANY($3::text[])

       UNION ALL

       SELECT
         'payout'::text AS resource,
         p.id::text AS id,
         p.operator_id::text AS operator_id,
         p.agency_id::text AS agency_id
       FROM payouts p
       WHERE p.id::text = ANY($4::text[])`,
      [agencies, agents, reservations, payouts],
    );

    return c.json({ records: result.rows });
  } catch (err) {
    console.error('Error resolving resource ownership:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
