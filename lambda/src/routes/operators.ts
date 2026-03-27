import { Hono } from 'hono';
import { query } from '../db.js';

const app = new Hono();

// GET /fetch-operators?operator_id=UUID
app.get('/fetch-operators', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    if (!operatorId) {
      return c.json({ error: 'Missing operator_id' }, 400);
    }

    const result = await query(
      `SELECT
        o.operator_id,
        o.name,
        o.general_email,
        o.voice_phone_number,
        o.address,
        o.website_url,
        o.company_logo_url,
        o.timezone_id,
        o.plan,
        o.name_slug,
        o.created_at,
        (SELECT COUNT(*) FROM vehicle v WHERE v.operator_id = o.operator_id AND v.removed_at IS NULL) as vehicles_total,
        (SELECT COUNT(*) FROM driver d WHERE d.operator_id = o.operator_id AND d.removed_at IS NULL) as drivers_count,
        (SELECT COUNT(*) FROM request r WHERE r.operator_id = o.operator_id) as total_reservations,
        (SELECT COUNT(*) FROM request r2
         WHERE r2.operator_id = o.operator_id
           AND r2.created_at >= NOW() - INTERVAL '30 days') as last_30_days_reservations
      FROM operator o
      WHERE o.operator_id = $1`,
      [operatorId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Operator not found' }, 404);
    }

    const op = result.rows[0];

    return c.json({
      success: true,
      operator: {
        operator_id: op.operator_id,
        name: op.name,
        status: 'active',
        is_active: true,
        email: op.general_email || '',
        name_slug: op.name_slug || '',
        plan: op.plan || null,
        logo_url: op.company_logo_url || null,
        address: op.address || '',
        phone_formatted: op.voice_phone_number || '',
        website: op.website_url || '',
        timezone: op.timezone_id || 'America/New_York',
        vehicles_total: parseInt(op.vehicles_total) || 0,
        drivers_count: parseInt(op.drivers_count) || 0,
        total_reservations: parseInt(op.total_reservations) || 0,
        last_30_days_reservations: parseInt(op.last_30_days_reservations) || 0,
        created_date: op.created_at,
      },
    });
  } catch (err: any) {
    console.error('Error fetching operator:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
