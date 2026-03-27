import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import operators from './routes/operators.js';
import companies from './routes/companies.js';
import contacts from './routes/contacts.js';
import reservations from './routes/reservations.js';

const app = new Hono();

// CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Debug endpoints
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

// Routes
app.route('/', operators);
app.route('/', companies);
app.route('/', contacts);
app.route('/', reservations);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export const handler = handle(app);
