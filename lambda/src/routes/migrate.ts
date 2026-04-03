import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// POST /migrate-data — accepts { table, rows } and bulk inserts into RDS
// Called by local migration script since Lambda can't reach Supabase from VPC
app.post('/migrate-data', async (c) => {
  try {
    const { table, rows } = await c.req.json();
    if (!table || !rows?.length) return c.json({ error: 'Missing table or rows' }, 400);

    const allowed = [
      'commission_operators', 'agencies', 'agents', 'commission_reservations',
      'reservation_attributions', 'payouts', 'payout_reservations',
    ];
    if (!allowed.includes(table)) return c.json({ error: `Table "${table}" not allowed` }, 400);

    let inserted = 0;
    for (const row of rows) {
      const keys = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = keys.map((_, i) => `$${i + 1}`);

      await appQuery(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
        vals,
      );
      inserted++;
    }

    return c.json({ success: true, table, inserted });
  } catch (err: any) {
    console.error('Error migrating data:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

export default app;
