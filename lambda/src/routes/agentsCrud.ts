import { Hono } from 'hono';
import { appQuery } from '../appDb.js';
import {
  RouteRefusal,
  appTransaction,
  lockLiveAgency,
  lockOperatorMapping,
} from '../workflowContext.js';

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
    // An agent of an archived agency has no portal. Suspended agencies and inactive agents are unchanged.
    const r = await appQuery(
      "SELECT ag.* FROM agents ag JOIN agencies a ON a.id = ag.agency_id WHERE ag.portal_token = $1 AND a.status <> 'archived' LIMIT 1",
      [c.req.param('token')],
    );
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
    const { agency_id, moovs_contact_id, name, email, phone, role, department, status } = body;
    // The insert default would mint a portal link, so an archived agency must refuse under its row lock.
    const rows = await appTransaction(async (client) => {
      await lockOperatorMapping(client, 'agency', agency_id);
      await lockLiveAgency(client, agency_id);
      return (await client.query(
        `INSERT INTO agents (agency_id, moovs_contact_id, name, email, phone, role, department, status)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'agent'), $7, COALESCE($8, 'active'))
         RETURNING *`,
        [agency_id, moovs_contact_id, name, email, phone, role, department, status],
      )).rows;
    });
    return c.json(rows, 201);
  } catch (err: any) {
    if (err instanceof RouteRefusal) return c.json(err.body, err.status);
    console.error('Error creating agent:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /agents/:id
app.patch('/agents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = ['moovs_contact_id', 'name', 'email', 'phone', 'role', 'department', 'status'];
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
    const rows = await appTransaction(async (client) => {
      await lockOperatorMapping(client, 'agent', id);
      const agent = (await client.query('SELECT agency_id FROM agents WHERE id = $1', [id])).rows[0];
      if (!agent) throw new RouteRefusal(404, { error: 'Not found' });
      await lockLiveAgency(client, agent.agency_id);
      return (await client.query(
        `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals,
      )).rows;
    });
    if (rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(rows);
  } catch (err: any) {
    if (err instanceof RouteRefusal) return c.json(err.body, err.status);
    console.error('Error updating agent:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /agents/:id
// Retired: agents are deactivated, never deleted, so settlement and question history keeps its agent.
app.delete('/agents/:id', (c) =>
  c.json(
    { error: 'Agents cannot be deleted. Deactivate the agent instead.', code: 'DELETE_DISABLED' },
    409,
  ),
);

export default app;
