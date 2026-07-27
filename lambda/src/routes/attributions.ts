import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

function validateAttribution(item: Record<string, any>): string | null {
  if (!item.reservation_id || !item.agency_id) return 'Missing reservation_id or agency_id';
  if (!['percent', 'flat'].includes(item.commission_type)) return 'Invalid commission_type';
  if (!['base_rate', 'total_amount', 'total_with_gratuity'].includes(item.commission_base)) {
    return 'Invalid commission_base';
  }
  if (typeof item.commission_rate !== 'number' || !Number.isFinite(item.commission_rate)) {
    return 'commission_rate must be a finite number';
  }
  if (
    item.commission_rate < 0
    || (item.commission_type === 'percent' && item.commission_rate > 100)
  ) {
    return item.commission_type === 'percent'
      ? 'Percent commission_rate must be between 0 and 100'
      : 'Flat commission_rate cannot be negative';
  }
  if (typeof item.commission_amount !== 'number' || !Number.isFinite(item.commission_amount) || item.commission_amount < 0) {
    return 'commission_amount must be a non-negative finite number';
  }
  return null;
}

// GET /attributions — ?reservation_ids=X,Y,Z or ?agency_id=X
app.get('/attributions', async (c) => {
  try {
    const reservationIds = c.req.query('reservation_ids');
    const agencyId = c.req.query('agency_id');

    if (reservationIds) {
      const ids = reservationIds.split(',').filter(Boolean);
      if (ids.length === 0) return c.json([]);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const r = await appQuery(
        `SELECT * FROM reservation_attributions WHERE reservation_id IN (${placeholders})`,
        ids,
      );
      return c.json(r.rows);
    }

    if (agencyId) {
      const r = await appQuery(
        'SELECT * FROM reservation_attributions WHERE agency_id = $1 ORDER BY attributed_at DESC',
        [agencyId],
      );
      return c.json(r.rows);
    }

    return c.json({ error: 'Missing reservation_ids or agency_id' }, 400);
  } catch (err: any) {
    console.error('Error fetching attributions:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /attributions — single object or array
app.post('/attributions', async (c) => {
  try {
    const body = await c.req.json();
    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0) return c.json([]);
    for (const item of items) {
      const validationError = validateAttribution(item);
      if (validationError) return c.json({ error: validationError }, 400);
    }

    const rows: any[] = [];
    for (const item of items) {
      const r = await appQuery(
        `INSERT INTO reservation_attributions (reservation_id, agency_id, agent_id, commission_rate, commission_type, commission_base, commission_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (reservation_id)
         DO UPDATE SET
           agency_id = EXCLUDED.agency_id,
           agent_id = EXCLUDED.agent_id,
           commission_rate = EXCLUDED.commission_rate,
           commission_type = EXCLUDED.commission_type,
           commission_base = EXCLUDED.commission_base,
           commission_amount = EXCLUDED.commission_amount
         RETURNING *`,
        [item.reservation_id, item.agency_id, item.agent_id, item.commission_rate, item.commission_type, item.commission_base, item.commission_amount],
      );
      rows.push(r.rows[0]);
    }
    return c.json(rows, 201);
  } catch (err: any) {
    console.error('Error creating attributions:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

export default app;
