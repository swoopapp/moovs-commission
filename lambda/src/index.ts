import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';

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
import authorization from './routes/authorization.js';
import { getAdminSecret, getDashboardSecret, safeSecretEqual } from './config.js';

const app = new Hono();

// CORS is handled by API Gateway — do NOT add Hono cors() middleware (causes double headers)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('*', async (c, next) => {
  const explicitLocalBypass = (
    process.env.ALLOW_UNAUTHENTICATED_LOCAL_DEV === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
  if (explicitLocalBypass) {
    await next();
    return;
  }

  const path = new URL(c.req.url).pathname;
  if (path === '/health') {
    await next();
    return;
  }

  if (safeSecretEqual(c.req.header('x-dashboard-secret'), getDashboardSecret())) {
    await next();
    return;
  }

  if (safeSecretEqual(c.req.header('x-admin-secret'), getAdminSecret())) {
    await next();
    return;
  }

  return c.json({ error: 'Unauthorized' }, 401);
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
app.route('/', authorization);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Schema changes are applied through reviewed migrations, never during request
// cold starts. Concurrent DDL here previously amplified traffic spikes into
// database contention and API failures.
export const handler = handle(app);
