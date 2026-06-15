import { Hono } from 'hono';
import crypto from 'crypto';
import { appQuery } from '../appDb.js';
import { query as moovsQuery } from '../db.js';
import { getAdminSecret, hasAdminSecret } from '../config.js';

const app = new Hono();

type CommissionOperatorRow = Record<string, any> & {
  moovs_operator_id?: string | null;
  logo_url?: string | null;
};

function requireAdmin(c: any) {
  return hasAdminSecret(c.req.header('x-admin-secret'));
}

function generatePortalToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function hashPortalToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function portalTokenEncryptionKey(): Buffer {
  const secret = process.env.OPERATOR_PORTAL_TOKEN_ENCRYPTION_SECRET || getAdminSecret();
  if (!secret) {
    throw new Error('Portal token encryption is not configured');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPortalToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', portalTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function decryptPortalToken(encrypted: string): string {
  const [version, ivText, tagText, ciphertextText] = encrypted.split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Unsupported portal token ciphertext');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    portalTokenEncryptionKey(),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function safeOperator(row: Record<string, any>) {
  const { portal_token_hash, portal_token_ciphertext, ...rest } = row;
  return {
    ...rest,
    portal_token_copyable: Boolean(portal_token_ciphertext),
  };
}

function safeOperators(rows: Array<Record<string, any>>) {
  return rows.map(safeOperator);
}

async function fetchMoovsLogos(moovsOperatorIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(moovsOperatorIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const r = await moovsQuery(
    `SELECT operator_id, company_logo_url FROM operator WHERE operator_id IN (${placeholders})`,
    ids,
  );

  const logos = new Map<string, string | null>();
  for (const row of r.rows) {
    logos.set(row.operator_id, row.company_logo_url || null);
  }
  return logos;
}

// logo_url is sourced from Moovs operator.company_logo_url on reads.
// The commission_operators.logo_url column is kept only for legacy compatibility.
async function withMoovsLogos<T extends CommissionOperatorRow>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const ids = rows.map((row) => row.moovs_operator_id).filter((id): id is string => Boolean(id));
  const logos = await fetchMoovsLogos(ids);

  return rows.map((row) => ({
    ...row,
    logo_url: row.moovs_operator_id ? logos.get(row.moovs_operator_id) ?? null : null,
  }));
}

// GET /commission-operators — list all, or ?slug=X for single lookup
app.get('/commission-operators', async (c) => {
  try {
    const slug = c.req.query('slug');
    if (!slug && !requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    if (slug) {
      const r = await appQuery('SELECT * FROM commission_operators WHERE slug = $1 LIMIT 1', [slug]);
      return c.json(safeOperators(await withMoovsLogos(r.rows)));
    }
    const r = await appQuery('SELECT * FROM commission_operators ORDER BY created_at DESC');
    return c.json(safeOperators(await withMoovsLogos(r.rows)));
  } catch (err: any) {
    console.error('Error fetching commission operators:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /commission-operators/:id
app.get('/commission-operators/:id', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const r = await appQuery('SELECT * FROM commission_operators WHERE id = $1', [c.req.param('id')]);
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    const [row] = await withMoovsLogos(r.rows);
    return c.json(safeOperator(row));
  } catch (err: any) {
    console.error('Error fetching commission operator:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /commission-operators/portal-token/verify
app.post('/commission-operators/portal-token/verify', async (c) => {
  try {
    const { slug, token } = await c.req.json();
    if (!slug || !token) return c.json({ error: 'Missing slug or token' }, 400);

    const r = await appQuery(
      `SELECT * FROM commission_operators
       WHERE slug = $1
         AND portal_token_hash = $2
         AND portal_token_enabled = true
         AND status = 'active'
         AND (portal_token_expires_at IS NULL OR portal_token_expires_at > now())
       LIMIT 1`,
      [slug, hashPortalToken(String(token))],
    );

    if (r.rows.length === 0) return c.json({ error: 'Invalid token' }, 401);

    await appQuery(
      `UPDATE commission_operators SET portal_token_last_used_at = now(), updated_at = now() WHERE id = $1`,
      [r.rows[0].id],
    );

    const [row] = await withMoovsLogos(r.rows);
    return c.json(safeOperator(row));
  } catch (err: any) {
    console.error('Error verifying commission operator portal token:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /commission-operators/:id/portal-token
// Admin-only copy endpoint. The list/read endpoints never expose the recoverable token.
app.get('/commission-operators/:id/portal-token', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const r = await appQuery(
      `SELECT * FROM commission_operators WHERE id = $1 LIMIT 1`,
      [c.req.param('id')],
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);

    const row = r.rows[0];
    if (!row.portal_token_enabled || !row.portal_token_hash) {
      return c.json({ error: 'Secure portal link is not enabled' }, 404);
    }
    if (!row.portal_token_ciphertext) {
      return c.json(
        { error: 'This secure portal link was created before copy support and cannot be recovered. Replace it once to enable future copying.' },
        409,
      );
    }

    const token = decryptPortalToken(row.portal_token_ciphertext);
    if (hashPortalToken(token) !== row.portal_token_hash) {
      return c.json({ error: 'Stored secure portal link failed integrity check' }, 409);
    }

    const [withLogo] = await withMoovsLogos([row]);
    return c.json({ ...safeOperator(withLogo), portal_token: token });
  } catch (err: any) {
    console.error('Error copying commission operator portal token:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// POST /commission-operators/:id/portal-token
app.post('/commission-operators/:id/portal-token', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const token = generatePortalToken();
    const encryptedToken = encryptPortalToken(token);
    const r = await appQuery(
      `UPDATE commission_operators
       SET portal_token_hash = $1,
           portal_token_ciphertext = $2,
           portal_token_enabled = true,
           portal_token_expires_at = $3,
           portal_token_created_at = now(),
           portal_token_last_used_at = NULL,
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [hashPortalToken(token), encryptedToken, body?.expires_at || null, id],
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    const [row] = await withMoovsLogos(r.rows);
    return c.json({ ...safeOperator(row), portal_token: token });
  } catch (err: any) {
    console.error('Error generating commission operator portal token:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /commission-operators/:id/portal-token
app.delete('/commission-operators/:id/portal-token', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const r = await appQuery(
      `UPDATE commission_operators
       SET portal_token_hash = NULL,
           portal_token_ciphertext = NULL,
           portal_token_enabled = false,
           portal_token_expires_at = NULL,
           portal_token_last_used_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [c.req.param('id')],
    );
    if (r.rowCount === 0) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  } catch (err: any) {
    console.error('Error revoking commission operator portal token:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

function normalizeRouteRateConfig(body: any) {
  const src = body && typeof body === 'object' ? body : {};
  const defaultRate = typeof src.default_rate === 'number' && Number.isFinite(src.default_rate) ? src.default_rate : null;
  const routesIn = src.routes && typeof src.routes === 'object' ? src.routes : {};
  const routes: Record<string, { route_id: string; name: string | null; rate: number }> = {};
  for (const [key, val] of Object.entries(routesIn)) {
    const v = val as any;
    const routeId = String(v?.route_id ?? key);
    const rate = typeof v?.rate === 'number' && Number.isFinite(v.rate) ? v.rate : null;
    if (!routeId || rate === null) continue;
    routes[routeId] = { route_id: routeId, name: typeof v?.name === 'string' ? v.name : null, rate };
  }
  return { default_rate: defaultRate, routes };
}

// PATCH /commission-operators/:id/route-rates
// Operator-managed shuttle route rate config. Not admin-gated at the lambda layer; the
// Next proxy enforces operator-session ownership (same model as the open agencies CRUD).
app.patch('/commission-operators/:id/route-rates', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const cfg = normalizeRouteRateConfig(body);
    const r = await appQuery(
      `UPDATE commission_operators SET route_rate_config = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(cfg), id],
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(safeOperators(await withMoovsLogos(r.rows)));
  } catch (err: any) {
    console.error('Error updating commission operator route rates:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// POST /commission-operators
app.post('/commission-operators', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const { moovs_operator_id, slug, display_name, auth_password, primary_color, secondary_color, contact_email, contact_phone, status } = body;
    const r = await appQuery(
      `INSERT INTO commission_operators (moovs_operator_id, slug, display_name, auth_password, logo_url, primary_color, secondary_color, contact_email, contact_phone, status)
       VALUES ($1, $2, $3, COALESCE($4, encode(gen_random_bytes(32), 'hex')), $5, $6, $7, $8, $9, COALESCE($10, 'active'))
       RETURNING *`,
      [moovs_operator_id, slug, display_name, auth_password, null, primary_color, secondary_color, contact_email, contact_phone, status],
    );
    return c.json(safeOperators(await withMoovsLogos(r.rows)), 201);
  } catch (err: any) {
    console.error('Error creating commission operator:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /commission-operators/:id
app.patch('/commission-operators/:id', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    const id = c.req.param('id');
    const body = await c.req.json();
    // logo_url is intentionally excluded — it is pulled from Moovs operator.company_logo_url.
    const allowedFields = ['display_name', 'slug', 'auth_password', 'primary_color', 'secondary_color', 'contact_email', 'contact_phone', 'status'];
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

    sets.push('updated_at = now()');
    vals.push(id);
    const r = await appQuery(
      `UPDATE commission_operators SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(safeOperators(await withMoovsLogos(r.rows)));
  } catch (err: any) {
    console.error('Error updating commission operator:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// DELETE /commission-operators/:id
app.delete('/commission-operators/:id', async (c) => {
  try {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
    await appQuery('DELETE FROM commission_operators WHERE id = $1', [c.req.param('id')]);
    return c.body(null, 204);
  } catch (err: any) {
    console.error('Error deleting commission operator:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
