import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { ensureCommissionTables } from './appDb.js';

// Existing routes (Moovs production read replica)
import operators from './routes/operators.js';
import companies from './routes/companies.js';
import contacts from './routes/contacts.js';
import reservations from './routes/reservations.js';

// Commission CRUD routes (prototype-db)
import commissionOperators from './routes/commissionOperators.js';
import agencies from './routes/agencies.js';
import agentsCrud from './routes/agentsCrud.js';
import commissionReservations from './routes/commissionReservations.js';
import attributions from './routes/attributions.js';
import payoutsCrud from './routes/payoutsCrud.js';
import upload from './routes/upload.js';
import migrate from './routes/migrate.js';

const app = new Hono();

// CORS is handled by API Gateway — do NOT add Hono cors() middleware (causes double headers)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Debug endpoints (Moovs read replica)
import { query as dbQuery } from './db.js';
app.get('/debug-schema', async (c) => {
  const table = c.req.query('table') || 'shuttle_booking';
  const r = await dbQuery(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'swoop' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return c.json({ table, columns: r.rows });
});
app.get('/debug-query', async (c) => {
  const sql = c.req.query('sql');
  if (!sql) return c.json({ error: 'Missing sql param' }, 400);
  const r = await dbQuery(sql);
  return c.json({ rows: r.rows, count: r.rowCount });
});

// Existing routes (Moovs data)
app.route('/', operators);
app.route('/', companies);
app.route('/', contacts);
app.route('/', reservations);

// Commission CRUD routes
app.route('/', commissionOperators);
app.route('/', agencies);
app.route('/', agentsCrud);
app.route('/', commissionReservations);
app.route('/', attributions);
app.route('/', payoutsCrud);
app.route('/', upload);
app.route('/', migrate);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Ensure tables on cold start
let tablesReady = false;
const originalHandler = handle(app);

export const handler = async (event: any, context: any) => {
  if (!tablesReady) {
    try {
      await ensureCommissionTables();
      tablesReady = true;
    } catch (err) {
      console.error('Failed to ensure commission tables:', err);
    }
  }
  return originalHandler(event, context);
};
