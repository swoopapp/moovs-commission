import { Hono } from 'hono';
import { query } from '../db.js';

const app = new Hono();

// POST /fetch-companies { operator_id, search?, limit?, offset? }
// Returns both regular companies AND shuttle clients in one unified list
app.post('/fetch-companies', async (c) => {
  try {
    const body = await c.req.json();
    const { operator_id, search } = body;

    if (!operator_id) {
      return c.json({ error: 'operator_id is required' }, 400);
    }

    const limit = Math.min(Math.max(parseInt(String(body.limit ?? 25), 10) || 25, 1), 100);
    const offset = Math.max(parseInt(String(body.offset ?? 0), 10) || 0, 0);
    const searchText = String(search || '').trim();
    const params: any[] = [operator_id];
    let searchSql = '';
    if (searchText) {
      params.push(`%${searchText}%`);
      searchSql = ` AND (name ILIKE $2 OR email ILIKE $2)`;
    }

    params.push(limit, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const result = await query(
      `WITH unified AS (
        SELECT
          c.company_id::text AS company_id,
          ('company:' || c.company_id::text) AS client_key,
          'company'::text AS client_type,
          c.company_id::text AS client_id,
          c.name,
          c.email,
          c.phone_number,
          c.address,
          c.state,
          c.postal_code,
          c.website_url,
          c.company_logo_url AS logo_url,
          c.description,
          c.created_at,
          c.updated_at,
          'company'::text AS source
        FROM company c
        WHERE c.operator_id = $1
          AND c.removed_at IS NULL
          ${searchSql.replaceAll('name', 'c.name').replaceAll('email', 'c.email')}

        UNION ALL

        SELECT
          sc.shuttle_client_id::text AS company_id,
          ('shuttle_client:' || sc.shuttle_client_id::text) AS client_key,
          'shuttle_client'::text AS client_type,
          sc.shuttle_client_id::text AS client_id,
          sc.name,
          sc.email,
          sc.phone AS phone_number,
          NULL::text AS address,
          NULL::text AS state,
          NULL::text AS postal_code,
          NULL::text AS website_url,
          NULL::text AS logo_url,
          sc.description,
          sc.created_at,
          sc.updated_at,
          'shuttle_client'::text AS source
        FROM shuttle_client sc
        WHERE sc.operator_id = $1
          AND sc.removed_at IS NULL
          ${searchSql.replaceAll('name', 'sc.name').replaceAll('email', 'sc.email')}
      )
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM unified
      ORDER BY LOWER(COALESCE(name, '')) ASC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params,
    );

    const companies = result.rows.map((row) => ({
      company_id: row.company_id,
      client_key: row.client_key,
      client_type: row.client_type,
      client_id: row.client_id,
      name: row.name || null,
      email: row.email || null,
      phone_number: row.phone_number || null,
      address: row.address || null,
      state: row.state || null,
      postal_code: row.postal_code || null,
      website_url: row.website_url || null,
      logo_url: row.logo_url || null,
      description: row.description || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      source: row.source,
    }));

    return c.json({
      success: true,
      operator_id,
      count: companies.length,
      total: result.rows[0]?.total_count || 0,
      limit,
      offset,
      companies,
    });
  } catch (err: any) {
    console.error('Error fetching companies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
