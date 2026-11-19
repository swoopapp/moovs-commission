import { validateRules } from '../../../src/lib/commission-rules.ts';
import { Hono } from 'hono';
import { appQuery } from '../appDb.js';
import {
  RouteRefusal,
  appTransaction,
  lockLiveAgency,
  lockOperatorMapping,
} from '../workflowContext.js';

const app = new Hono();
type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
// Archive and restore are audited lifecycle actions; the profile status field can never enter that state.
const STATUS_NOT_EDITABLE = {
  error: 'Use Archive to archive an agency.',
  code: 'STATUS_NOT_EDITABLE',
};

function validateCommissionFields(
  body: Record<string, any>,
  fallbackType: string = 'percent',
): string | null {
  const type = 'commission_type' in body ? body.commission_type : fallbackType;
  if (!['percent', 'flat'].includes(type)) return 'commission_type must be percent or flat';
  if (!('commission_rate' in body)) return null;
  const rate = body.commission_rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    return 'commission_rate must be a finite number';
  }
  if (rate < 0) return 'commission_rate cannot be negative';
  if (type === 'percent' && rate > 100) {
    return 'Percent commission_rate must be between 0 and 100';
  }
  return null;
}

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

async function syncAgencyClientLinks(agencyId: string, operatorId: string, links: ReturnType<typeof normalizeClientLink>[], query: Query = appQuery) {
  const normalized = links.filter((link): link is NonNullable<typeof link> => Boolean(link));
  await query('DELETE FROM agency_client_links WHERE agency_id = $1', [agencyId]);
  if (normalized.length === 0) return;

  for (let i = 0; i < normalized.length; i += 1) {
    const link = normalized[i];
    await query(
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
    // An archived agency has no portal, even if an old link is still stored on its row.
    const r = await appQuery("SELECT * FROM agencies WHERE portal_token = $1 AND status <> 'archived' LIMIT 1", [c.req.param('token')]);
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
// Retired: it replaced a link with no revision check, no archived check and no audit.
app.post('/agencies/:id/regenerate-token', (c) =>
  c.json(
    {
      error: 'Issue a new partner link from the agency lifecycle actions.',
      code: 'USE_LIFECYCLE',
    },
    409,
  ),
);

// POST /agencies
app.post('/agencies', async (c) => {
  try {
    const body = await c.req.json();
    const validationError = validateCommissionFields(body);
    if (validationError) return c.json({ error: validationError }, 400);
    if (body.status === 'archived') return c.json(STATUS_NOT_EDITABLE, 400);
    const fields = [
      'operator_id', 'moovs_company_id', 'name', 'type', 'commission_rate', 'commission_type',
      'commission_base', 'rate_mode', 'price_mode', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city',
      'state', 'zip_code', 'country', 'market_segment', 'payment_terms', 'contract_start',
      'contract_end', 'status', 'notes', 'last_synced_at',
    ];
    const present = fields.filter((f) => f in body);
    const vals = present.map((f) => body[f]);
    const placeholders = present.map((_, i) => `$${i + 1}`);

    // One transaction under the operator row FOR UPDATE: a restore checks that no other active agency claims its
    // clients, so a new agency and its client links must not appear halfway through that check.
    const agency = await appTransaction(async (client) => {
      await lockOperatorMapping(client, 'operator', body.operator_id, 'UPDATE');
      const created = (await client.query(
        `INSERT INTO agencies (${present.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals,
      )).rows[0];
      const bodyLinks = Array.isArray(body.client_links)
        ? body.client_links.map(normalizeClientLink)
        : [companyClientLink(created.moovs_company_id, created.name)];
      await syncAgencyClientLinks(created.id, created.operator_id, bodyLinks, (text, params) => client.query(text, params));
      return created;
    });
    return c.json(await attachClientLinks([agency]), 201);
  } catch (err: any) {
    if (err instanceof RouteRefusal) return c.json(err.body, err.status);
    console.error('Error creating agency:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /agencies/:id
app.patch('/agencies/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    if (body.status === 'archived') return c.json(STATUS_NOT_EDITABLE, 400);
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

    // The archived test, the validations and every write share one transaction under the agency row lock,
    // so an edit can neither race an archive nor quietly reactivate an archived agency.
    const agency = await appTransaction(async (client) => {
      // FOR UPDATE, as the native editors take it: a writer that goes on to lock the agency FOR UPDATE must not
      // share the operator row with money writers, or the three can queue in a cycle behind a waiting archive.
      await lockOperatorMapping(client, 'agency', id, 'UPDATE');
      const current = await lockLiveAgency(client, id, 'UPDATE');
      if ('commission_type' in body) {
        const rulesError = validateRules(current.commission_rules ?? [], body.commission_type);
        if (rulesError) throw new RouteRefusal(400, { error: rulesError });
      }
      if ('commission_rate' in body || 'commission_type' in body) {
        const validationError = validateCommissionFields(body, current.commission_type);
        if (validationError) throw new RouteRefusal(400, { error: validationError });
        if (body.commission_type === 'percent' && !('commission_rate' in body)) {
          const existingRate = Number(current.commission_rate);
          if (!Number.isFinite(existingRate) || existingRate < 0 || existingRate > 100) {
            throw new RouteRefusal(400, { error: 'Existing commission_rate is invalid for percent commissions' });
          }
        }
      }
      const row = sets.length > 0
        ? (await client.query(
            `UPDATE agencies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
            vals,
          )).rows[0]
        : current;
      if (shouldSyncClientLinks) {
        const bodyLinks = Array.isArray(body.client_links)
          ? body.client_links.map(normalizeClientLink)
          : [companyClientLink(row.moovs_company_id, row.name)];
        await syncAgencyClientLinks(row.id, row.operator_id, bodyLinks, (text, params) => client.query(text, params));
      }
      return row;
    });
    return c.json(await attachClientLinks([agency]));
  } catch (err: any) {
    if (err instanceof RouteRefusal) return c.json(err.body, err.status);
    console.error('Error updating agency:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /agencies/:id
// Retired: the delete cascaded into payouts. Agencies are archived, never deleted.
app.delete('/agencies/:id', (c) =>
  c.json(
    { error: 'Agencies cannot be deleted. Archive the agency instead.', code: 'DELETE_DISABLED' },
    409,
  ),
);

export default app;
