import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawReservation {
  [key: string]: unknown;
}

interface CommissionOperator {
  id: string;
  moovs_operator_id: string | null;
  name: string;
}

interface Agency {
  id: string;
  operator_id: string;
  moovs_company_id: string | null;
  commission_rate: number;
  commission_type: 'percent' | 'flat';
  commission_base: 'base_rate' | 'total_amount' | 'total_with_gratuity';
}

interface OperatorSyncResult {
  operator_id: string;
  operator_name: string;
  trips_synced: number;
  trips_attributed: number;
  error?: string;
}

// --- Helpers ---

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function serviceHeaders(serviceRoleKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function transformToReservation(raw: RawReservation, operatorId: string) {
  const totalAmount = Number(raw['Total Amount ($)']) || 0;
  const gratuity = Number(raw['Driver Gratuity Amount']) || 0;
  return {
    operator_id: operatorId,
    moovs_trip_id: String(raw['Trip ID'] || ''),
    moovs_company_id: raw['Company ID'] ? String(raw['Company ID']) : null,
    order_number: raw['Order Number'] ? String(raw['Order Number']) : null,
    confirmation_number: raw['Confirmation Number'] ? String(raw['Confirmation Number']) : null,
    pickup_date: raw['Pickup Date Time'] ? String(raw['Pickup Date Time']) : null,
    pickup_location: raw['Pickup Address'] ? String(raw['Pickup Address']) : null,
    dropoff_location: raw['Dropoff Address'] ? String(raw['Dropoff Address']) : null,
    passenger_name: raw['Passenger Contact Full Name'] ? String(raw['Passenger Contact Full Name']) : null,
    vehicle_type: raw['Vehicle Name'] ? String(raw['Vehicle Name']) : null,
    trip_type: raw['Trip Type'] ? String(raw['Trip Type']) : null,
    base_rate_amount: Number(raw['Base Rate']) || 0,
    total_amount: totalAmount,
    total_with_gratuity: totalAmount + gratuity,
    trip_status: raw['Status Slug'] ? String(raw['Status Slug']) : null,
    synced_at: new Date().toISOString(),
  };
}

function calculateCommission(
  reservation: { base_rate_amount: number; total_amount: number; total_with_gratuity: number },
  agency: Agency,
): number {
  if (agency.commission_type === 'flat') return agency.commission_rate;
  const rate = agency.commission_rate / 100;
  switch (agency.commission_base) {
    case 'base_rate':
      return Math.round(reservation.base_rate_amount * rate * 100) / 100;
    case 'total_amount':
      return Math.round(reservation.total_amount * rate * 100) / 100;
    case 'total_with_gratuity':
      return Math.round(reservation.total_with_gratuity * rate * 100) / 100;
    default:
      return Math.round(reservation.total_amount * rate * 100) / 100;
  }
}

// --- Main sync logic for a single operator ---

async function syncOperator(
  operator: CommissionOperator,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<OperatorSyncResult> {
  const result: OperatorSyncResult = {
    operator_id: operator.id,
    operator_name: operator.name,
    trips_synced: 0,
    trips_attributed: 0,
  };

  if (!operator.moovs_operator_id) {
    result.error = 'No moovs_operator_id configured';
    return result;
  }

  // 1. Fetch reservations from the fetch-reservations edge function (rolling 7-day window)
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 7);
  const dateFromStr = dateFrom.toISOString().split('T')[0];

  console.log(`[${operator.name}] Fetching reservations since ${dateFromStr}...`);

  const fetchRes = await fetch(`${supabaseUrl}/functions/v1/fetch-reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      operator_id: operator.moovs_operator_id,
      date_from: dateFromStr,
    }),
  });

  if (!fetchRes.ok) {
    const errText = await fetchRes.text();
    result.error = `fetch-reservations failed: ${fetchRes.status} — ${errText}`;
    console.error(`[${operator.name}] ${result.error}`);
    return result;
  }

  const data = await fetchRes.json();
  const rawReservations: RawReservation[] = data.reservations || [];

  console.log(`[${operator.name}] Got ${rawReservations.length} raw reservations`);

  // 2. Transform to commission_reservations schema
  const reservations = rawReservations
    .filter((r: RawReservation) => r['Trip ID'])
    .map((r: RawReservation) => transformToReservation(r, operator.id));

  if (reservations.length === 0) {
    console.log(`[${operator.name}] No reservations to upsert`);
    return result;
  }

  // 3. Upsert into commission_reservations via PostgREST
  const upsertUrl = `${supabaseUrl}/rest/v1/commission_reservations?on_conflict=operator_id,moovs_trip_id`;
  const upsertRes = await fetch(upsertUrl, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(reservations),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    result.error = `Upsert failed: ${upsertRes.status} — ${errText}`;
    console.error(`[${operator.name}] ${result.error}`);
    return result;
  }

  result.trips_synced = reservations.length;
  console.log(`[${operator.name}] Upserted ${reservations.length} reservations`);

  // 4. Auto-attribute: fetch agencies for this operator
  const agenciesUrl = `${supabaseUrl}/rest/v1/agencies?operator_id=eq.${encodeURIComponent(operator.id)}&select=id,operator_id,moovs_company_id,commission_rate,commission_type,commission_base`;
  const agenciesRes = await fetch(agenciesUrl, {
    headers: serviceHeaders(serviceRoleKey),
  });

  if (!agenciesRes.ok) {
    const errText = await agenciesRes.text();
    result.error = `Fetch agencies failed: ${agenciesRes.status} — ${errText}`;
    console.error(`[${operator.name}] ${result.error}`);
    return result;
  }

  const agencies: Agency[] = await agenciesRes.json();
  const agencyByCompanyId = new Map<string, Agency>();
  for (const agency of agencies) {
    if (agency.moovs_company_id) {
      agencyByCompanyId.set(agency.moovs_company_id, agency);
    }
  }

  if (agencyByCompanyId.size === 0) {
    console.log(`[${operator.name}] No agencies with moovs_company_id, skipping attribution`);
    return result;
  }

  // 5. For reservations with matching agencies, look up their DB IDs and create attributions
  //    We need the actual reservation IDs from the database after upsert
  const tripIds = reservations
    .filter(r => r.moovs_company_id && agencyByCompanyId.has(r.moovs_company_id))
    .map(r => r.moovs_trip_id);

  if (tripIds.length === 0) {
    console.log(`[${operator.name}] No reservations matched agencies`);
    return result;
  }

  // Fetch the upserted reservations by moovs_trip_id to get their DB IDs
  const tripIdFilter = tripIds.map(encodeURIComponent).join(',');
  const dbReservationsUrl = `${supabaseUrl}/rest/v1/commission_reservations?operator_id=eq.${encodeURIComponent(operator.id)}&moovs_trip_id=in.(${tripIdFilter})&select=id,moovs_trip_id,moovs_company_id,base_rate_amount,total_amount,total_with_gratuity`;
  const dbReservationsRes = await fetch(dbReservationsUrl, {
    headers: serviceHeaders(serviceRoleKey),
  });

  if (!dbReservationsRes.ok) {
    const errText = await dbReservationsRes.text();
    result.error = `Fetch DB reservations failed: ${dbReservationsRes.status} — ${errText}`;
    console.error(`[${operator.name}] ${result.error}`);
    return result;
  }

  const dbReservations: Array<{
    id: string;
    moovs_trip_id: string;
    moovs_company_id: string | null;
    base_rate_amount: number;
    total_amount: number;
    total_with_gratuity: number;
  }> = await dbReservationsRes.json();

  // Check which reservations already have attributions so we don't duplicate
  const dbResIds = dbReservations.map(r => r.id);
  if (dbResIds.length === 0) {
    console.log(`[${operator.name}] No DB reservations found for attribution`);
    return result;
  }

  const resIdFilter = dbResIds.map(encodeURIComponent).join(',');
  const existingAttribUrl = `${supabaseUrl}/rest/v1/reservation_attributions?reservation_id=in.(${resIdFilter})&select=reservation_id`;
  const existingAttribRes = await fetch(existingAttribUrl, {
    headers: serviceHeaders(serviceRoleKey),
  });

  const existingAttribs: Array<{ reservation_id: string }> = existingAttribRes.ok
    ? await existingAttribRes.json()
    : [];
  const alreadyAttributed = new Set(existingAttribs.map(a => a.reservation_id));

  // Build new attributions
  const attributions: Array<{
    reservation_id: string;
    agency_id: string;
    agent_id: null;
    commission_rate: number;
    commission_type: string;
    commission_base: string;
    commission_amount: number;
  }> = [];

  for (const dbRes of dbReservations) {
    if (!dbRes.moovs_company_id) continue;
    if (alreadyAttributed.has(dbRes.id)) continue;

    const agency = agencyByCompanyId.get(dbRes.moovs_company_id);
    if (!agency) continue;

    const commissionAmount = calculateCommission(dbRes, agency);
    attributions.push({
      reservation_id: dbRes.id,
      agency_id: agency.id,
      agent_id: null,
      commission_rate: agency.commission_rate,
      commission_type: agency.commission_type,
      commission_base: agency.commission_base,
      commission_amount: commissionAmount,
    });
  }

  if (attributions.length > 0) {
    const attribUrl = `${supabaseUrl}/rest/v1/reservation_attributions`;
    const attribRes = await fetch(attribUrl, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify(attributions),
    });

    if (!attribRes.ok) {
      const errText = await attribRes.text();
      result.error = `Attribution insert failed: ${attribRes.status} — ${errText}`;
      console.error(`[${operator.name}] ${result.error}`);
      // Don't return — we still synced trips successfully
    } else {
      result.trips_attributed = attributions.length;
      console.log(`[${operator.name}] Created ${attributions.length} attributions`);
    }
  } else {
    console.log(`[${operator.name}] All matching reservations already attributed`);
  }

  return result;
}

// --- Edge function handler ---

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    console.log('=== auto-sync-trips started ===');
    const startTime = Date.now();

    // 1. Fetch all commission operators
    const operatorsUrl = `${supabaseUrl}/rest/v1/commission_operators?select=id,moovs_operator_id,name`;
    const operatorsRes = await fetch(operatorsUrl, {
      headers: serviceHeaders(serviceRoleKey),
    });

    if (!operatorsRes.ok) {
      const errText = await operatorsRes.text();
      throw new Error(`Failed to fetch operators: ${operatorsRes.status} — ${errText}`);
    }

    const operators: CommissionOperator[] = await operatorsRes.json();
    console.log(`Found ${operators.length} commission operators`);

    // 2. Sync each operator (sequentially to avoid overwhelming Metabase)
    const results: OperatorSyncResult[] = [];
    for (const operator of operators) {
      try {
        const result = await syncOperator(operator, supabaseUrl, serviceRoleKey);
        results.push(result);
      } catch (err) {
        console.error(`[${operator.name}] Unexpected error:`, err);
        results.push({
          operator_id: operator.id,
          operator_name: operator.name,
          trips_synced: 0,
          trips_attributed: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Build summary
    const totalSynced = results.reduce((sum, r) => sum + r.trips_synced, 0);
    const totalAttributed = results.reduce((sum, r) => sum + r.trips_attributed, 0);
    const errors = results.filter(r => r.error);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`=== auto-sync-trips completed in ${elapsed}s ===`);
    console.log(`Operators: ${operators.length}, Trips synced: ${totalSynced}, Attributed: ${totalAttributed}, Errors: ${errors.length}`);

    return new Response(JSON.stringify({
      success: true,
      elapsed_seconds: Number(elapsed),
      summary: {
        operators_total: operators.length,
        operators_synced: results.filter(r => !r.error).length,
        operators_failed: errors.length,
        total_trips_synced: totalSynced,
        total_trips_attributed: totalAttributed,
      },
      details: results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('auto-sync-trips fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
