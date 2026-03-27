import { Hono } from 'hono';
import { query } from '../db.js';

const app = new Hono();

// POST /fetch-companies { operator_id }
// Returns both regular companies AND shuttle clients in one unified list
app.post('/fetch-companies', async (c) => {
  try {
    const { operator_id } = await c.req.json();

    if (!operator_id) {
      return c.json({ error: 'operator_id is required' }, 400);
    }

    // Query 1: Regular companies
    const companiesResult = await query(
      `SELECT
        c.company_id,
        c.name,
        c.email,
        c.phone_number,
        c.address,
        c.state,
        c.postal_code,
        c.website_url,
        c.company_logo_url,
        c.description,
        c.created_at,
        c.updated_at
      FROM company c
      WHERE c.operator_id = $1
        AND c.removed_at IS NULL
      ORDER BY c.name ASC`,
      [operator_id]
    );

    // Query 2: Shuttle clients (may or may not link to a company)
    const shuttleClientsResult = await query(
      `SELECT
        sc.shuttle_client_id,
        sc.company_id,
        sc.name,
        sc.email,
        sc.phone,
        sc.description,
        sc.created_at,
        sc.updated_at
      FROM shuttle_client sc
      WHERE sc.operator_id = $1
        AND sc.removed_at IS NULL
      ORDER BY sc.name ASC`,
      [operator_id]
    );

    // Build set of company_ids already in the regular list
    const seenCompanyIds = new Set<string>();

    const companies = companiesResult.rows.map((row) => {
      seenCompanyIds.add(row.company_id);
      return {
        company_id: row.company_id,
        name: row.name || null,
        email: row.email || null,
        phone_number: row.phone_number || null,
        address: row.address || null,
        state: row.state || null,
        postal_code: row.postal_code || null,
        website_url: row.website_url || null,
        logo_url: row.company_logo_url || null,
        description: row.description || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        source: 'company' as const,
      };
    });

    // Add shuttle clients — if they have a company_id that's already in the list, skip (no dupe)
    for (const row of shuttleClientsResult.rows) {
      if (row.company_id && seenCompanyIds.has(row.company_id)) {
        continue;
      }

      companies.push({
        company_id: row.company_id || row.shuttle_client_id,
        name: row.name || null,
        email: row.email || null,
        phone_number: row.phone || null,
        address: null,
        state: null,
        postal_code: null,
        website_url: null,
        logo_url: null,
        description: row.description || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        source: 'shuttle_client' as const,
      });

      if (row.company_id) {
        seenCompanyIds.add(row.company_id);
      }
    }

    // Sort combined list by name
    companies.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return c.json({
      success: true,
      operator_id,
      count: companies.length,
      companies,
    });
  } catch (err: any) {
    console.error('Error fetching companies:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
