import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

const RESERVATION_FIELDS = [
  'operator_id',
  'moovs_trip_id',
  'moovs_company_id',
  'order_number',
  'confirmation_number',
  'pickup_date',
  'pickup_location',
  'dropoff_location',
  'passenger_name',
  'vehicle_type',
  'trip_type',
  'base_rate_amount',
  'total_amount',
  'total_with_gratuity',
  'trip_status',
  'client_keys',
];

// GET /commission-reservations — ?operator_id required, ?date_from, ?date_to, ?company_id, ?client_key, ?limit, ?offset
app.get('/commission-reservations', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    if (!operatorId) return c.json({ error: 'Missing operator_id' }, 400);

    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const companyId = c.req.query('company_id');
    const clientKey = c.req.query('client_key');
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

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
    if (companyId) {
      conditions.push(`moovs_company_id = $${idx++}`);
      params.push(companyId);
    }
    if (clientKey) {
      const [clientType, clientId] = clientKey.split(':');
      if (!clientType || !clientId || !['company', 'shuttle_client'].includes(clientType)) {
        return c.json({ error: 'Invalid client_key' }, 400);
      }
      conditions.push(`client_keys @> ARRAY[$${idx++}]::text[]`);
      params.push(clientKey);
    }

    const parsedLimit = Number.parseInt(limitParam ?? '', 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 250)
      : null;
    const parsedOffset = Number.parseInt(offsetParam ?? '0', 10);
    const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    let paginationSql = '';
    if (safeLimit !== null) {
      paginationSql = ` LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(safeLimit, safeOffset);
    }

    const r = await appQuery(
      `SELECT * FROM commission_reservations WHERE ${conditions.join(' AND ')} ORDER BY pickup_date DESC${paginationSql}`,
      params,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching commission reservations:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /commission-reservations/upsert — snapshot live Moovs reservations into the app DB.
// Accepts a single reservation object or an array. Used when creating attribution/payout state.
app.post('/commission-reservations/upsert', async (c) => {
  try {
    const body = await c.req.json();
    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0) return c.json([]);

    const rows: any[] = [];
    for (const item of items) {
      if (!item.operator_id || !item.moovs_trip_id) {
        return c.json({ error: 'Missing operator_id or moovs_trip_id' }, 400);
      }

      const values = RESERVATION_FIELDS.map((field) => {
        if (field === 'client_keys') {
          if (Array.isArray(item.client_keys)) return item.client_keys.filter(Boolean);
          if (item.moovs_company_id) return [`company:${item.moovs_company_id}`];
          return [];
        }
        return item[field] ?? null;
      });
      const placeholders = RESERVATION_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
      const updates = RESERVATION_FIELDS
        .filter((field) => !['operator_id', 'moovs_trip_id'].includes(field))
        .map((field) => `${field} = EXCLUDED.${field}`);

      const r = await appQuery(
        `INSERT INTO commission_reservations (${RESERVATION_FIELDS.join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (operator_id, moovs_trip_id)
         DO UPDATE SET ${updates.join(', ')}, synced_at = now()
         RETURNING *`,
        values,
      );
      rows.push(r.rows[0]);
    }

    return c.json(rows, 201);
  } catch (err: any) {
    console.error('Error upserting commission reservations:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
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
