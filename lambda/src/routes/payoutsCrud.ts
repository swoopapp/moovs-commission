import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// GET /payouts — ?operator_id=X or ?agency_id=X
app.get('/payouts', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    const agencyId = c.req.query('agency_id');

    if (operatorId) {
      const r = await appQuery('SELECT * FROM payouts WHERE operator_id = $1 ORDER BY created_at DESC', [operatorId]);
      return c.json(r.rows);
    }
    if (agencyId) {
      const r = await appQuery('SELECT * FROM payouts WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId]);
      return c.json(r.rows);
    }
    return c.json({ error: 'Missing operator_id or agency_id' }, 400);
  } catch (err: any) {
    console.error('Error fetching payouts:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /payouts
app.post('/payouts', async (c) => {
  try {
    const body = await c.req.json();
    const {
      operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
      total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid,
    } = body;
    const r = await appQuery(
      `INSERT INTO payouts (operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
        total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, 'draft'), $13, $14)
       RETURNING *`,
      [operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
       total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid],
    );
    return c.json(r.rows, 201);
  } catch (err: any) {
    console.error('Error creating payout:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /payouts/:id
app.patch('/payouts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = [
      'period_start', 'period_end', 'total_trips', 'total_revenue', 'total_commission',
      'adjustments', 'net_payout', 'method', 'reference_number', 'status', 'notes', 'date_paid',
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (field in body) {
        sets.push(`${field} = $${idx++}`);
        vals.push(body[field]);
      }
    }
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

    vals.push(id);
    const r = await appQuery(
      `UPDATE payouts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error updating payout:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// --- Payout Reservations ---

// GET /payout-reservations — ?payout_ids=X,Y,Z
app.get('/payout-reservations', async (c) => {
  try {
    const payoutIds = c.req.query('payout_ids');
    if (!payoutIds) return c.json({ error: 'Missing payout_ids' }, 400);
    const ids = payoutIds.split(',').filter(Boolean);
    if (ids.length === 0) return c.json([]);

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const r = await appQuery(
      `SELECT * FROM payout_reservations WHERE payout_id IN (${placeholders})`,
      ids,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching payout reservations:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /payout-reservations — { payout_id, reservation_ids: string[] }
app.post('/payout-reservations', async (c) => {
  try {
    const { payout_id, reservation_ids } = await c.req.json();
    if (!payout_id || !reservation_ids?.length) return c.json({ error: 'Missing payout_id or reservation_ids' }, 400);

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const rid of reservation_ids) {
      values.push(`($${idx++}, $${idx++})`);
      params.push(payout_id, rid);
    }

    await appQuery(
      `INSERT INTO payout_reservations (payout_id, reservation_id) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`,
      params,
    );
    return c.json({ success: true }, 201);
  } catch (err: any) {
    console.error('Error creating payout reservations:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

export default app;
