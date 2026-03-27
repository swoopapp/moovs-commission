import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  pool = new Pool({
    host: process.env.DB_HOST || 'database-production-read-replica.c4xzucffjf3i.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: process.env.DB_NAME || 'production',
    user: process.env.DB_USER || 'swoopuser',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 60000,
  });

  // Set search_path on each new connection
  pool.on('connect', (client) => {
    client.query('SET search_path TO swoop');
  });

  return pool;
}

export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  const p = await getPool();
  return p.query(text, params);
}
