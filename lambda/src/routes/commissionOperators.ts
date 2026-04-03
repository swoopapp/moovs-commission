import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// GET /commission-operators — list all, or ?slug=X for single lookup
app.get('/commission-operators', async (c) => {
  try {
    const slug = c.req.query('slug');
    if (slug) {
      const r = await appQuery('SELECT * FROM commission_operators WHERE slug = $1 LIMIT 1', [slug]);
      return c.json(r.rows);
    }
    const r = await appQuery('SELECT * FROM commission_operators ORDER BY created_at DESC');
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching commission operators:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /commission-operators/:id
app.get('/commission-operators/:id', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM commission_operators WHERE id = $1', [c.req.param('id')]);
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows[0]);
  } catch (err: any) {
    console.error('Error fetching commission operator:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /commission-operators
app.post('/commission-operators', async (c) => {
  try {
    const body = await c.req.json();
    const { moovs_operator_id, slug, display_name, auth_password, logo_url, primary_color, secondary_color, contact_email, contact_phone, status } = body;
    const r = await appQuery(
      `INSERT INTO commission_operators (moovs_operator_id, slug, display_name, auth_password, logo_url, primary_color, secondary_color, contact_email, contact_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'active'))
       RETURNING *`,
      [moovs_operator_id, slug, display_name, auth_password, logo_url, primary_color, secondary_color, contact_email, contact_phone, status],
    );
    return c.json(r.rows, 201);
  } catch (err: any) {
    console.error('Error creating commission operator:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /commission-operators/:id
app.patch('/commission-operators/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = ['display_name', 'slug', 'auth_password', 'logo_url', 'primary_color', 'secondary_color', 'contact_email', 'contact_phone', 'status'];
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
      `UPDATE commission_operators SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error updating commission operator:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /commission-operators/:id
app.delete('/commission-operators/:id', async (c) => {
  try {
    await appQuery('DELETE FROM commission_operators WHERE id = $1', [c.req.param('id')]);
    return c.body(null, 204);
  } catch (err: any) {
    console.error('Error deleting commission operator:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
