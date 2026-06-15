import { Hono } from 'hono';
import { appQuery } from '../appDb.js';

const app = new Hono();

type ClientLinkInput = {
  client_key?: unknown;
  client_type?: unknown;
  client_id?: unknown;
  display_name_snapshot?: unknown;
  is_primary?: unknown;
};

function normalizeClientLink(input: ClientLinkInput) {
  const clientType = typeof input.client_type === 'string' ? input.client_type.trim() : '';
  const clientId = typeof input.client_id === 'string' ? input.client_id.trim() : '';
  const clientKey = typeof input.client_key === 'string' && input.client_key.trim()
    ? input.client_key.trim()
    : clientType && clientId
      ? `${clientType}:${clientId}`
      : '';

  if (!clientKey || !clientType || !clientId) return null;
  if (!['company', 'shuttle_client'].includes(clientType)) return null;

  return {
    client_key: clientKey,
    client_type: clientType,
    client_id: clientId,
    display_name_snapshot: typeof input.display_name_snapshot === 'string' && input.display_name_snapshot.trim()
      ? input.display_name_snapshot.trim()
      : null,
    is_primary: input.is_primary === true,
  };
}

function companyClientLink(companyId: string | null | undefined, displayName?: string | null) {
  if (!companyId) return null;
  return {
    client_key: `company:${companyId}`,
    client_type: 'company',
    client_id: companyId,
    display_name_snapshot: displayName || null,
    is_primary: true,
  };
}

async function syncAgencyClientLinks(agencyId: string, operatorId: string, links: ReturnType<typeof normalizeClientLink>[]) {
  const normalized = links.filter((link): link is NonNullable<typeof link> => Boolean(link));
  await appQuery('DELETE FROM agency_client_links WHERE agency_id = $1', [agencyId]);
  if (normalized.length === 0) return;

  for (let i = 0; i < normalized.length; i += 1) {
    const link = normalized[i];
    await appQuery(
      `INSERT INTO agency_client_links
        (agency_id, operator_id, client_key, client_type, client_id, display_name_snapshot, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agency_id, client_key)
       DO UPDATE SET
        client_type = EXCLUDED.client_type,
        client_id = EXCLUDED.client_id,
        display_name_snapshot = EXCLUDED.display_name_snapshot,
        is_primary = EXCLUDED.is_primary,
        updated_at = now()`,
      [
        agencyId,
        operatorId,
        link.client_key,
        link.client_type,
        link.client_id,
        link.display_name_snapshot,
        link.is_primary || i === 0,
      ],
    );
  }
}

async function attachClientLinks<T extends { id: string }>(rows: T[]): Promise<Array<T & { client_links: any[] }>> {
  if (rows.length === 0) return rows.map((row) => ({ ...row, client_links: [] }));
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const linksR = await appQuery(
    `SELECT * FROM agency_client_links WHERE agency_id IN (${placeholders}) ORDER BY is_primary DESC, display_name_snapshot ASC NULLS LAST, client_key ASC`,
    ids,
  );
  const byAgency = new Map<string, any[]>();
  for (const link of linksR.rows) {
    const agencyId = link.agency_id;
    if (!byAgency.has(agencyId)) byAgency.set(agencyId, []);
    byAgency.get(agencyId)!.push(link);
  }
  return rows.map((row) => ({ ...row, client_links: byAgency.get(row.id) || [] }));
}

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
    if (matchedOnly) conditions.push(`EXISTS (SELECT 1 FROM agency_client_links acl WHERE acl.agency_id = agencies.id)`);
    if (unmatchedOnly) conditions.push(`NOT EXISTS (SELECT 1 FROM agency_client_links acl WHERE acl.agency_id = agencies.id)`);

    const where = conditions.join(' AND ');
    const allowedSelectFields = new Set([
      'id', 'operator_id', 'moovs_company_id', 'name', 'type', 'commission_rate',
      'commission_type', 'commission_base', 'rate_mode', 'price_mode', 'contact_name', 'contact_email',
      'contact_phone', 'address', 'city', 'state', 'zip_code', 'country',
      'market_segment', 'payment_terms', 'contract_start', 'contract_end',
      'status', 'portal_token', 'notes', 'last_synced_at', 'created_at', 'updated_at',
    ]);
    const fields = selectOnly
      ? selectOnly.split(',').map((f) => f.trim()).filter(Boolean)
      : [];
    if (fields.some((field) => !allowedSelectFields.has(field))) {
      return c.json({ error: 'Invalid select field' }, 400);
    }
    const selectClause = fields.length ? fields.join(', ') : '*';

    if (limit > 0) {
      // Paginated mode: return { agencies, total }
      const countR = await appQuery(`SELECT COUNT(*) FROM agencies WHERE ${where}`, params);
      const total = parseInt(countR.rows[0].count);

      const dataR = await appQuery(
        `SELECT ${selectClause} FROM agencies WHERE ${where} ORDER BY name ASC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );
      return c.json({ agencies: await attachClientLinks(dataR.rows), total });
    }

    // Unpaginated
    const r = await appQuery(
      `SELECT ${selectClause} FROM agencies WHERE ${where} ORDER BY created_at DESC`,
      params,
    );
    return c.json(await attachClientLinks(r.rows));
  } catch (err: any) {
    console.error('Error fetching agencies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/by-token/:token
app.get('/agencies/by-token/:token', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM agencies WHERE portal_token = $1 LIMIT 1', [c.req.param('token')]);
    return c.json(await attachClientLinks(r.rows));
  } catch (err: any) {
    console.error('Error fetching agency by token:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/linked-companies/:operatorId
app.get('/agencies/linked-companies/:operatorId', async (c) => {
  try {
    const r = await appQuery(
      `SELECT moovs_company_id FROM agencies WHERE operator_id = $1 AND moovs_company_id IS NOT NULL
       UNION
       SELECT client_id AS moovs_company_id FROM agency_client_links WHERE operator_id = $1 AND client_type = 'company'`,
      [c.req.param('operatorId')],
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching linked companies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/linked-clients/:operatorId
app.get('/agencies/linked-clients/:operatorId', async (c) => {
  try {
    const r = await appQuery(
      `SELECT ('company:' || moovs_company_id) AS client_key, 'company' AS client_type, moovs_company_id AS client_id
       FROM agencies
       WHERE operator_id = $1 AND moovs_company_id IS NOT NULL
       UNION
       SELECT client_key, client_type, client_id
       FROM agency_client_links
       WHERE operator_id = $1`,
      [c.req.param('operatorId')],
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching linked clients:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /agencies/:id
app.get('/agencies/:id', async (c) => {
  try {
    const r = await appQuery('SELECT * FROM agencies WHERE id = $1', [c.req.param('id')]);
    return c.json(await attachClientLinks(r.rows));
  } catch (err: any) {
    console.error('Error fetching agency:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /agencies/:id/regenerate-token
app.post('/agencies/:id/regenerate-token', async (c) => {
  try {
    const r = await appQuery(
      `UPDATE agencies SET portal_token = encode(gen_random_bytes(32), 'hex') WHERE id = $1 RETURNING *`,
      [c.req.param('id')],
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error regenerating agency portal token:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// POST /agencies
app.post('/agencies', async (c) => {
  try {
    const body = await c.req.json();
    const fields = [
      'operator_id', 'moovs_company_id', 'name', 'type', 'commission_rate', 'commission_type',
      'commission_base', 'rate_mode', 'price_mode', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city',
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
    const agency = r.rows[0];
    const bodyLinks = Array.isArray(body.client_links)
      ? body.client_links.map(normalizeClientLink)
      : [companyClientLink(agency.moovs_company_id, agency.name)];
    await syncAgencyClientLinks(agency.id, agency.operator_id, bodyLinks);
    return c.json(await attachClientLinks([agency]), 201);
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
      'rate_mode', 'price_mode',
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
    const shouldSyncClientLinks = Array.isArray(body.client_links) || 'moovs_company_id' in body;
    if (sets.length === 0 && !shouldSyncClientLinks) return c.json({ error: 'No fields to update' }, 400);

    vals.push(id);
    const r = sets.length > 0
      ? await appQuery(
          `UPDATE agencies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
          vals,
        )
      : await appQuery('SELECT * FROM agencies WHERE id = $1', [id]);
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    const agency = r.rows[0];
    if (shouldSyncClientLinks) {
      const bodyLinks = Array.isArray(body.client_links)
        ? body.client_links.map(normalizeClientLink)
        : [companyClientLink(agency.moovs_company_id, agency.name)];
      await syncAgencyClientLinks(agency.id, agency.operator_id, bodyLinks);
    }
    return c.json(await attachClientLinks([agency]));
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
