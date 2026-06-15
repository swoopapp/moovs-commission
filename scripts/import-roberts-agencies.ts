/**
 * One-off importer: load the condensed Roberts Hawaii agency list into the commission app.
 *
 * Source: "Agency List - Moovs 04.30.26.xlsx" (Sheet1, condensed). Rows embedded below so the
 * script is reproducible without the spreadsheet on disk. Addresses are intentionally skipped.
 *
 * What it does:
 *   - Resolves the operator by slug.
 *   - Creates one agency per unique (Account Name + DBA), merging duplicate price-book rows.
 *   - rate_mode = 'standard' (inherits operator route rates); commission_rate = fallback (default 20).
 *   - price_mode defaults from payment terms (Prepay -> net, Billable -> gross).
 *   - Applies the 4 highlighted specials as overrides.
 *   - Seeds the operator's default route rate (only if route config is still empty).
 *   - Idempotent: skips agencies whose name already exists for the operator.
 *
 * Usage:
 *   DRY RUN (default, no writes):  npx tsx scripts/import-roberts-agencies.ts --operator <slug>
 *   COMMIT:                        npx tsx scripts/import-roberts-agencies.ts --operator <slug> --commit
 *
 * Env / flags:
 *   --operator <slug>   (or OPERATOR_SLUG)   required
 *   --api <url>         (or LAMBDA_API_URL)   default below
 *   --default-rate <n>  (or DEFAULT_RATE)     default 20  (Oahu standard)
 *   --commit                                  actually write (otherwise dry run)
 *   DASHBOARD_SECRET                          optional x-dashboard-secret header
 */

const API = arg('api') || process.env.LAMBDA_API_URL || 'https://wvx7dgl297.execute-api.us-east-1.amazonaws.com';
const SLUG = arg('operator') || process.env.OPERATOR_SLUG || '';
const DEFAULT_RATE = Number(arg('default-rate') || process.env.DEFAULT_RATE || 20);
const COMMIT = process.argv.includes('--commit');
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || '';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (DASHBOARD_SECRET) h['x-dashboard-secret'] = DASHBOARD_SECRET;
  return h;
}

interface RawRow {
  account: string;
  dba: string;
  pricebook: string;
  special?: string;
  terms: string;
}

// Sheet1 rows 2-71 (Account, DBA, Price Book, Special, Payment Terms).
const ROWS: RawRow[] = [
  { account: '18 Services Bellows AFS', dba: 'Bellows AFS', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: '2330 Kalakaua Owner LP', dba: 'HGI Waikiki Beach', pricebook: 'AS26', terms: 'Prepay' },
  { account: '2375 Ala Wai Property', dba: 'Wayfinder Waikiki', pricebook: 'AS26', terms: 'Prepay' },
  { account: '2570 Kalakaua Owner LP', dba: 'The Twin Fin (fka Aston Waikiki Beach Hotel)', pricebook: 'AS26', terms: 'Prepay' },
  { account: '2586 Kalakaua Owner LP', dba: 'Park Shore Waikiki', pricebook: 'AS26', terms: 'Prepay' },
  { account: '2885 DH Management LLC', dba: 'Lotus Honolulu at Diamond Head', pricebook: 'AS26', terms: 'Prepay' },
  { account: '2885 DH Management LLC', dba: 'Lotus Honolulu at Diamond Head', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'AI Aloha Information LLC', dba: 'Aloha-Tickets', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'Aloha VIP Tours, Inc.', dba: '', pricebook: 'UA26', special: 'Special Airport Transfers', terms: 'Billing (Net 30)' },
  { account: 'Ambassador Hotel, L.P.', dba: 'Romer Waikiki at the Ambassador', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Aqua-Aston Hospitality', dba: '', pricebook: 'AS26', terms: 'Billing (Net 30)' },
  { account: 'Blue Hawaiian Activities', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Destination Hawaii, Inc.', dba: '', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'Easy-Go Inc.', dba: 'Tours4Fun', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'EF International Language School', dba: '', pricebook: 'AS26', terms: 'Billing (Net 30)' },
  { account: 'Embassy Suites by Hilton Waikiki Beach Walk', dba: '', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Embassy Suites by Hilton Waikiki Beach Walk', dba: '', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'ES Holdings LLC', dba: 'Go Hawaii Tours', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'Explore Hawaii Tour, Inc', dba: '', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'Fusion Holidays', dba: '', pricebook: 'UC26', terms: 'Prepay; CC on File' },
  { account: 'Getyourguide, AG', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Group Voyagers, Inc.', dba: 'Globus Cosmos', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Halekulani Corporation', dba: 'Halekulani', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Halekulani Corporation', dba: 'Halepuna Waikiki by Halekulani', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'HawaiiDiscount.com', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Hawaii HIS Corp - US market', dba: 'Global inbound Westbound division (HIS World)', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'Hawaii Tours LLC', dba: 'pearlharborhawaii.com', pricebook: 'UB26', terms: 'Prepay' },
  { account: 'Hawaii Travel, LLC', dba: 'Hawaii.com', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Hawaii Travel And Tours.Com, LLC', dba: 'AdventureMaui.com/AdventureInHawaii.com', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'Headout Inc', dba: 'Headout Inc.', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Helloworld Services Pty Ltd', dba: '', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'HH Pacific Beach LP', dba: 'Alohilani Resort Waikiki Beach', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Hilton Grand Vacations Co.', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Hotel Renew', dba: 'Hotel Renew Management LLC', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'House of Travel Group', dba: '', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Institute of Intensive English', dba: '', pricebook: 'AS26', terms: 'Prepay; CC on File' },
  { account: 'International Tours & Vacation Planning LLC', dba: 'Daniel Hawaii Tours & Activities', pricebook: 'UC26', special: 'Prepay at Gross with commission back', terms: 'Prepay' },
  { account: 'International Travel Service', dba: 'Ultimate Vacations', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'Irongate Azrep, LLC', dba: "Ka La'i Waikiki Beach", pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Joint Base Pearl Harbor-Hickam MWR ITT', dba: 'MWR NEX Mall ITT', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Juan Carlos Bianchetti', dba: 'Ole Tours Hawaii', pricebook: 'UC26', terms: 'Prepay; CC on File' },
  { account: 'Kahala Hotel Investors, LLC', dba: 'The Kahala Hotel & Resort', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'KLOOK Travel Technology Limited', dba: '', pricebook: 'UA26', terms: 'Prepay' },
  { account: 'Kyo-ya Inc, LLC', dba: 'Sheraton Maui Resort & Spa', pricebook: 'AS26', special: 'Maui Only', terms: 'Billing (Net 30)' },
  { account: 'Maui Concierge Service, Inc', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'MC&A, Inc.', dba: 'MC&A, Inc.', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'MCCS Camp Smith ITT', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Musement', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'MWR Schofield Barracks LTS', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'New World Travel', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'North America Travel Service', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'OLS Hotels & Resorts', dba: '', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Our World Ltd', dba: 'Our Pacific', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'Overman Hawaii International', dba: 'Overman Hawaii', pricebook: 'UB26', terms: 'Other' },
  { account: 'Pacific Islands Institute', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'Pleasant Holidays, LLC', dba: '', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Project Expedition LLC', dba: 'Project Expedition', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'Reserve America', dba: 'Tripster', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'RJLC Waikiki Lessee, LLC', dba: 'Courtyard Waikiki Beach', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Romer House Waikiki', dba: 'HCI 415 Nahua Owner LP', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Rycroft Holdings LLC', dba: 'Pagoda Hotel', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Shore Excursions Group, LLC', dba: '', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Springboard Hospitality', dba: 'Ohia Waikiki Hotel', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Sun Islands Hawaii', dba: '', pricebook: 'UC26', terms: 'Billing (Net 30)' },
  { account: 'The Laylow Waikiki, Autograph Collection', dba: '', pricebook: 'AS26', terms: 'Prepay' },
  { account: 'Travalco USA, Inc.', dba: '', pricebook: 'UC26', terms: 'Prepay' },
  { account: 'Travelscape, LLC (Expedia.com)', dba: 'Expedia.com', pricebook: 'UA26', special: 'Special Waikiki & Kahala Airport', terms: 'Billing (Net 30)' },
  { account: 'Viator', dba: '', pricebook: 'UA26', terms: 'Billing (Net 30)' },
  { account: 'VSE Pacific, Inc.', dba: 'Hawaii Activity Planners', pricebook: 'UB26', terms: 'Billing (Net 30)' },
  { account: 'Waikiki Malia', dba: 'Lucky Hotels, LLC,', pricebook: 'AS26', terms: 'Prepay' },
];

function defaultPriceMode(terms: string): 'gross' | 'net' {
  return /prepay/i.test(terms) ? 'net' : 'gross';
}

interface AgencyPayload {
  operator_id: string;
  name: string;
  type: string;
  commission_rate: number;
  commission_type: 'percent';
  commission_base: 'total_amount';
  rate_mode: 'standard' | 'fixed';
  price_mode: 'gross' | 'net';
  payment_terms: string | null;
  status: 'active';
  notes: string;
  moovs_company_id: null;
  client_links: never[];
}

// Per-account overrides for the 4 highlighted specials.
function applySpecial(account: string, payload: AgencyPayload): string[] {
  const notes: string[] = [];
  switch (account) {
    case 'Kyo-ya Inc, LLC': // Sheraton Maui Resort & Spa — Maui Only
      payload.rate_mode = 'fixed';
      payload.commission_rate = 15;
      notes.push('SPECIAL: Maui Only — fixed 15%.');
      break;
    case 'International Tours & Vacation Planning LLC': // Prepay at Gross with commission back
      payload.price_mode = 'gross';
      notes.push('SPECIAL: Prepay at gross with commission back — price display forced to GROSS.');
      break;
    case 'Aloha VIP Tours, Inc.':
      notes.push('SPECIAL: Special Airport Transfers — review rate setup (left at standard).');
      break;
    case 'Travelscape, LLC (Expedia.com)':
      notes.push('SPECIAL: Special Waikiki & Kahala Airport — review rate setup (left at standard).');
      break;
  }
  return notes;
}

async function main() {
  if (!SLUG) {
    console.error('Missing --operator <slug> (or OPERATOR_SLUG env).');
    process.exit(1);
  }
  console.log(`Mode: ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`API:  ${API}`);
  console.log(`Operator slug: ${SLUG}\n`);

  // Resolve operator
  const opRes = await fetch(`${API}/commission-operators?slug=${encodeURIComponent(SLUG)}`, { headers: headers() });
  if (!opRes.ok) throw new Error(`Operator lookup failed: ${opRes.status} ${await opRes.text()}`);
  const operators = (await opRes.json()) as Array<Record<string, any>>;
  const operator = operators[0];
  if (!operator) throw new Error(`No operator found for slug "${SLUG}"`);
  console.log(`Operator: ${operator.display_name} (id=${operator.id})\n`);

  // Existing agencies (idempotency by name)
  const exRes = await fetch(`${API}/agencies?operator_id=${encodeURIComponent(operator.id)}`, { headers: headers() });
  if (!exRes.ok) throw new Error(`Agency list failed: ${exRes.status} ${await exRes.text()}`);
  const existing = (await exRes.json()) as Array<{ name: string }>;
  const existingNames = new Set(existing.map((a) => a.name.trim().toLowerCase()));

  // Group rows by account+dba, merging price books
  const groups = new Map<string, { rows: RawRow[] }>();
  for (const row of ROWS) {
    const key = `${row.account.trim().toLowerCase()}||${row.dba.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { rows: [] });
    groups.get(key)!.rows.push(row);
  }

  let created = 0;
  let skipped = 0;
  const planned: AgencyPayload[] = [];

  for (const { rows } of groups.values()) {
    const first = rows[0];
    const name = first.account.trim();
    if (existingNames.has(name.toLowerCase())) {
      skipped++;
      console.log(`SKIP (exists): ${name}`);
      continue;
    }
    const priceBooks = [...new Set(rows.map((r) => r.pricebook).filter(Boolean))];
    const terms = rows.find((r) => r.terms)?.terms || 'Other';
    const dba = first.dba.trim();
    const special = rows.find((r) => r.special)?.special;

    const payload: AgencyPayload = {
      operator_id: operator.id,
      name,
      type: 'Other',
      commission_rate: DEFAULT_RATE,
      commission_type: 'percent',
      commission_base: 'total_amount',
      rate_mode: 'standard',
      price_mode: defaultPriceMode(terms),
      payment_terms: terms,
      status: 'active',
      notes: '',
      moovs_company_id: null,
      client_links: [],
    };

    const noteParts: string[] = ['Imported from Agency List 04.30.26.'];
    if (dba) noteParts.push(`DBA: ${dba}.`);
    if (priceBooks.length) noteParts.push(`Price book(s): ${priceBooks.join(', ')}.`);
    if (special) noteParts.push(`Special request: ${special}.`);
    noteParts.push(...applySpecial(name, payload));
    payload.notes = noteParts.join(' ');

    planned.push(payload);
  }

  console.log(`\nPlanned: ${planned.length} new agencies, ${skipped} skipped (already exist).\n`);

  for (const payload of planned) {
    const tag = `${payload.name} [${payload.rate_mode}/${payload.price_mode}/${payload.commission_rate}%]`;
    if (!COMMIT) {
      console.log(`WOULD CREATE: ${tag}`);
      continue;
    }
    const res = await fetch(`${API}/agencies`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`FAILED: ${payload.name} -> ${res.status} ${await res.text()}`);
      continue;
    }
    created++;
    console.log(`CREATED: ${tag}`);
  }

  // Seed operator default route rate (only if config is still empty)
  const cfg = operator.route_rate_config || {};
  const isEmpty = (cfg.default_rate == null) && (!cfg.routes || Object.keys(cfg.routes).length === 0);
  if (isEmpty) {
    if (!COMMIT) {
      console.log(`\nWOULD SEED route default rate = ${DEFAULT_RATE}% (operator config currently empty).`);
    } else {
      const res = await fetch(`${API}/commission-operators/${encodeURIComponent(operator.id)}/route-rates`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ default_rate: DEFAULT_RATE, routes: {} }),
      });
      if (!res.ok) console.error(`Route rate seed FAILED: ${res.status} ${await res.text()}`);
      else console.log(`\nSEEDED route default rate = ${DEFAULT_RATE}%.`);
    }
  } else {
    console.log('\nRoute rate config already set — leaving as is.');
  }

  console.log(`\nDone. ${COMMIT ? `Created ${created}, skipped ${skipped}.` : 'Dry run complete — re-run with --commit to write.'}`);
  console.log('Reminder: agencies are unlinked. Attach Moovs client links and set Maui/Kauai route rates (15%) in the editor.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
