import { Hono } from 'hono';
import { query } from '../db.js';

const app = new Hono();

// POST /fetch-contacts { operator_id, company_id? }
app.post('/fetch-contacts', async (c) => {
  try {
    const { operator_id, company_id } = await c.req.json();

    if (!operator_id) {
      return c.json({ success: false, error: 'operator_id is required' }, 400);
    }

    const params: any[] = [operator_id];
    let companyFilter = '';

    if (company_id) {
      params.push(company_id);
      companyFilter = ` AND c.company_id = $${params.length}`;
    }

    const result = await query(
      `SELECT
        c.contact_id,
        c.company_id,
        c.first_name,
        c.last_name,
        c.email,
        c.mobile_phone,
        c.company_position,
        c.home_address,
        c.work_address,
        c.created_at,
        c.updated_at
      FROM contact c
      WHERE c.operator_id = $1
        AND c.removed_at IS NULL${companyFilter}
      ORDER BY c.last_name ASC, c.first_name ASC`,
      params
    );

    const contacts = result.rows.map((row) => ({
      contact_id: row.contact_id,
      company_id: row.company_id || null,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      email: row.email || null,
      mobile_phone: row.mobile_phone || null,
      position: row.company_position || null,
      home_address: row.home_address || null,
      work_address: row.work_address || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }));

    return c.json({
      success: true,
      operator_id,
      company_id: company_id || null,
      count: contacts.length,
      contacts,
    });
  } catch (err: any) {
    console.error('Error fetching contacts:', err);
    return c.json({ success: false, error: 'Internal Server Error' }, 500);
  }
});

export default app;
