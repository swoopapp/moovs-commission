import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// GET /commission-reservations — ?operator_id required, ?date_from, ?date_to
app.get('/commission-reservations', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    if (!operatorId) return c.json({ error: 'Missing operator_id' }, 400);

    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');

    const conditions = ['operator_id = $1'];
    const params: any[] = [operatorId];
    let idx = 2;

    if (dateFrom) {
      conditions.push(`pickup_date >= $${idx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`pickup_date <= $${idx++}`);
      params.push(dateTo);
    }

    const r = await appQuery(
      `SELECT * FROM commission_reservations WHERE ${conditions.join(' AND ')} ORDER BY pickup_date DESC`,
      params,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching commission reservations:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /commission-reservations/by-ids?ids=X,Y,Z
app.get('/commission-reservations/by-ids', async (c) => {
  try {
    const idsParam = c.req.query('ids');
    if (!idsParam) return c.json([]);
    const ids = idsParam.split(',').filter(Boolean);
    if (ids.length === 0) return c.json([]);

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const r = await appQuery(
      `SELECT * FROM commission_reservations WHERE id IN (${placeholders}) ORDER BY pickup_date DESC`,
      ids,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching reservations by ids:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
