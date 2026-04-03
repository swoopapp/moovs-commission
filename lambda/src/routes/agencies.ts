import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// GET /agencies — ?operator_id required, ?search, ?matched_only, ?unmatched_only, ?limit, ?offset
app.get('/agencies', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    if (!operatorId) return c.json({ error: 'Missing operator_id' }, 400);

    const search = c.req.query('search');
    const matchedOnly = c.req.query('matched_only') === 'true';
    const unmatchedOnly = c.req.query('unmatched_only') === 'true';
    const limit = parseInt(c.req.query('limit') || '0') || 0;
    const offset = parseInt(c.req.query('offset') || '0') || 0;
    const selectOnly = c.req.query('select');

    const conditions = ['operator_id = $1'];
    const params: any[] = [operatorId];
    let idx = 2;

    if (search) {
      conditions.push(`name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (matchedOnly) conditions.push('moovs_company_id IS NOT NULL');
    if (unmatchedOnly) conditions.push('moovs_company_id IS NULL');

    const where = conditions.join(' AND ');
    const fields = selectOnly || '*';

    if (limit > 0) {
      // Paginated mode: return { agencies, total }
      const countR = await appQuery(`SELECT COUNT(*) FROM agencies WHERE ${where}`, params);
      const total = parseInt(countR.rows[0].count);

      const dataR = await appQuery(
        `SELECT ${fields} FROM agencies WHERE ${where} ORDER BY name ASC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );
      return c.json({ agencies: dataR.rows, total });
    }

    // Unpaginated
    const r = await appQuery(
      `SELECT ${fields} FROM agencies WHERE ${where} ORDER BY created_at DESC`,
      params,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching agencies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/by-token/:token
app.get('/agencies/by-token/:token', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM agencies WHERE portal_token = $1 LIMIT 1', [c.req.param('token')]);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching agency by token:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/linked-companies/:operatorId
app.get('/agencies/linked-companies/:operatorId', async (c) => {
  try {
    const r = await appQuery(
      'SELECT moovs_company_id FROM agencies WHERE operator_id = $1 AND moovs_company_id IS NOT NULL',
      [c.req.param('operatorId')],
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching linked companies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/:id
app.get('/agencies/:id', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM agencies WHERE id = $1', [c.req.param('id')]);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching agency:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /agencies
app.post('/agencies', async (c) => {
  try {
    const body = await c.req.json();
    const fields = [
      'operator_id', 'moovs_company_id', 'name', 'type', 'commission_rate', 'commission_type',
      'commission_base', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city',
      'state', 'zip_code', 'country', 'market_segment', 'payment_terms', 'contract_start',
      'contract_end', 'status', 'notes', 'last_synced_at',
    ];
    const present = fields.filter((f) => f in body);
    const vals = present.map((f) => body[f]);
    const placeholders = present.map((_, i) => `$${i + 1}`);

    const r = await appQuery(
      `INSERT INTO agencies (${present.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      vals,
    );
    return c.json(r.rows, 201);
  } catch (err: any) {
    console.error('Error creating agency:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /agencies/:id
app.patch('/agencies/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = [
      'moovs_company_id', 'name', 'type', 'commission_rate', 'commission_type', 'commission_base',
      'contact_name', 'contact_email', 'contact_phone', 'address', 'city', 'state', 'zip_code',
      'country', 'market_segment', 'payment_terms', 'contract_start', 'contract_end', 'status',
      'notes', 'last_synced_at',
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
      `UPDATE agencies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error updating agency:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /agencies/:id
app.delete('/agencies/:id', async (c) => {
  try {
    await appQuery('DELETE FROM agencies WHERE id = $1', [c.req.param('id')]);
    return c.body(null, 204);
  } catch (err: any) {
    console.error('Error deleting agency:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
