/**
 * Migration script: Supabase → AWS RDS (via Lambda /migrate-data endpoint)
 *
 * This script runs LOCALLY because the Lambda VPC can't reach Supabase.
 * It reads from Supabase PostgREST, then POSTs data to the Lambda which inserts into RDS.
 *
 * Usage: npx tsx scripts/migrate-to-rds.ts
 *
 * Required env vars (or edit the constants below):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, LAMBDA_API_URL
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mylhldsyxkmzkksgifgt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const LAMBDA_API_URL = process.env.LAMBDA_API_URL || 'https://wvx7dgl297.execute-api.us-east-1.amazonaws.com';

if (!SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_ANON_KEY env var (get from Amplify variables d3p7e6jzxrmmm3)');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
  };
}

// Table-specific ordering columns
const ORDER_COLUMNS: Record<string, string> = {
  commission_operators: 'created_at',
  agencies: 'created_at',
  agents: 'created_at',
  commission_reservations: 'synced_at',
  reservation_attributions: 'attributed_at',
  payouts: 'created_at',
};

async function fetchTable(table: string): Promise<any[]> {
  const orderCol = ORDER_COLUMNS[table];
  const allRows: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  console.log(`  Reading ${table} from Supabase...`);

  while (true) {
    let url = `${REST}/${table}?limit=${pageSize}&offset=${offset}`;
    if (orderCol) url += `&order=${orderCol}.asc`;

    const res = await fetch(url, { headers: supabaseHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to read ${table}: ${res.status} ${body}`);
    }
    const rows = await res.json();
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    offset += pageSize;
    console.log(`    ...fetched ${allRows.length} so far, getting more...`);
  }

  console.log(`  Got ${allRows.length} rows from ${table}`);
  return allRows;
}

async function pushToRDS(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) {
    console.log(`  Skipping ${table} (no rows)`);
    return;
  }

  // Send in batches of 50 to avoid payload limits
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`  Pushing ${batch.length} rows to ${table} (batch ${Math.floor(i / batchSize) + 1})...`);

    const res = await fetch(`${LAMBDA_API_URL}/migrate-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, rows: batch }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to push ${table}: ${res.status} ${body}`);
    }

    const result = await res.json();
    console.log(`  ${result.inserted} rows inserted into ${table}`);
  }
}

async function migrateLogo(logoUrl: string): Promise<string | null> {
  if (!logoUrl || !logoUrl.includes('supabase')) return logoUrl;

  try {
    console.log(`  Migrating logo: ${logoUrl}`);
    const imgRes = await fetch(logoUrl);
    if (!imgRes.ok) {
      console.warn(`  Failed to download logo: ${imgRes.status}`);
      return logoUrl;
    }

    const contentType = imgRes.headers.get('content-type') || 'image/png';
    const buffer = await imgRes.arrayBuffer();
    const ext = contentType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
    const filename = `migrated-${Date.now()}.${ext}`;

    // Create a FormData-like body for the upload
    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', blob, filename);

    const uploadRes = await fetch(`${LAMBDA_API_URL}/upload-logo`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      console.warn(`  Failed to upload logo to S3: ${uploadRes.status} ${body}`);
      return logoUrl;
    }

    const { url } = await uploadRes.json();
    console.log(`  Logo migrated to: ${url}`);
    return url;
  } catch (err) {
    console.warn(`  Logo migration failed:`, err);
    return logoUrl;
  }
}

async function main() {
  console.log('=== Supabase → RDS Migration ===\n');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Lambda:   ${LAMBDA_API_URL}\n`);

  // Order matters: parent tables first due to foreign keys
  const tables = [
    'commission_operators',
    'agencies',
    'agents',
    'commission_reservations',
    'reservation_attributions',
    'payouts',
  ];

  console.log('Step 1: Reading all data from Supabase...\n');

  const data: Record<string, any[]> = {};
  for (const table of tables) {
    data[table] = await fetchTable(table);
  }
  // payout_reservations has no ordering column
  data['payout_reservations'] = await fetchTable('payout_reservations');

  // Step 2: Migrate logos from Supabase Storage to S3
  console.log('\nStep 2: Migrating logos to S3...\n');
  for (const op of data['commission_operators']) {
    if (op.logo_url && op.logo_url.includes('supabase')) {
      const newUrl = await migrateLogo(op.logo_url);
      op.logo_url = newUrl;
    }
  }

  // Step 3: Push data to RDS via Lambda
  console.log('\nStep 3: Pushing data to RDS...\n');
  for (const table of [...tables, 'payout_reservations']) {
    await pushToRDS(table, data[table]);
  }

  console.log('\n=== Migration complete ===');

  // Summary
  console.log('\nSummary:');
  for (const [table, rows] of Object.entries(data)) {
    console.log(`  ${table}: ${rows.length} rows`);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
