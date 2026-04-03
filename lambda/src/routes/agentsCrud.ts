import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

// GET /agents — ?agency_id=X or ?agency_ids=X,Y,Z
app.get('/agents', async (c) => {
  try {
    const agencyId = c.req.query('agency_id');
    const agencyIds = c.req.query('agency_ids');

    if (agencyIds) {
      const ids = agencyIds.split(',').filter(Boolean);
      if (ids.length === 0) return c.json([]);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const r = await appQuery(
        `SELECT * FROM agents WHERE agency_id IN (${placeholders}) ORDER BY created_at DESC`,
        ids,
      );
      return c.json(r.rows);
    }

    if (agencyId) {
      const r = await appQuery('SELECT * FROM agents WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId]);
      return c.json(r.rows);
    }

    return c.json({ error: 'Missing agency_id or agency_ids' }, 400);
  } catch (err: any) {
    console.error('Error fetching agents:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agents/by-token/:token
app.get('/agents/by-token/:token', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM agents WHERE portal_token = $1 LIMIT 1', [c.req.param('token')]);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching agent by token:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /agents
app.post('/agents', async (c) => {
  try {
    const body = await c.req.json();
    const { agency_id, name, email, phone, role, department, status } = body;
    const r = await appQuery(
      `INSERT INTO agents (agency_id, name, email, phone, role, department, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'agent'), $6, COALESCE($7, 'active'))
       RETURNING *`,
      [agency_id, name, email, phone, role, department, status],
    );
    return c.json(r.rows, 201);
  } catch (err: any) {
    console.error('Error creating agent:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /agents/:id
app.patch('/agents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = ['name', 'email', 'phone', 'role', 'department', 'status'];
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
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error updating agent:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /agents/:id
app.delete('/agents/:id', async (c) => {
  try {
    await appQuery('DELETE FROM agents WHERE id = $1', [c.req.param('id')]);
    return c.body(null, 204);
  } catch (err: any) {
    console.error('Error deleting agent:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
