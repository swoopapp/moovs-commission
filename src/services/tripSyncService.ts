import { config, EDGE_FUNCTION_URLS } from '../config/env';
import type { Reservation, Agency } from '../types/commission';
import { upsertReservations } from './reservationService';
import { calculateCommission } from './attributionService';
import { fetchAgencies } from './agencyService';

interface SyncOptions {
  operatorId: string;        // commission_operators.id — used for Supabase storage
  moovsOperatorId: string;   // Moovs UUID — used for Metabase edge function
  dateFrom?: string;
  dateTo?: string;
}

export interface SyncResult {
  synced: number;
  attributed: number;
  unmatched: number;
}

interface RawReservation {
  [key: string]: unknown;
}

function transformToReservation(raw: RawReservation, operatorId: string): Omit<Reservation, 'id'> {
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

export async function syncTrips(options: SyncOptions): Promise<SyncResult> {
  const { operatorId, moovsOperatorId, dateFrom, dateTo } = options;

  // 1. Fetch from Metabase via existing edge function (uses Moovs UUID)
  const body: Record<string, unknown> = { operator_id: moovsOperatorId };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;

  const res = await fetch(EDGE_FUNCTION_URLS.fetchReservations, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Trip sync failed: ${res.status}`);
  const data = await res.json();
  const rawReservations: RawReservation[] = data.reservations || [];

  // 2. Transform to our schema
  const reservations = rawReservations
    .filter((r: RawReservation) => r['Trip ID'])
    .map((r: RawReservation) => transformToReservation(r, operatorId));

  if (reservations.length === 0) return { synced: 0, attributed: 0, unmatched: 0 };

  // 3. Upsert into commission_reservations
  await upsertReservations(reservations);

  // 4. Auto-attribute: match moovs_company_id to agencies
  const agencies = await fetchAgencies(operatorId);
  const agencyByCompanyId = new Map<string, Agency>();
  for (const agency of agencies) {
    if (agency.moovs_company_id) {
      agencyByCompanyId.set(agency.moovs_company_id, agency);
    }
  }

  // For each reservation with a company_id, check if there's a matching agency
  const attributionsToCreate = [];
  let unmatched = 0;

  for (const reservation of reservations) {
    if (!reservation.moovs_company_id) {
      unmatched++;
      continue;
    }
    const agency = agencyByCompanyId.get(reservation.moovs_company_id);
    if (!agency) {
      unmatched++;
      continue;
    }
    // Calculate commission for matched reservations
    const commissionAmount = calculateCommission(reservation as Reservation, agency);
    attributionsToCreate.push({
      moovs_trip_id: reservation.moovs_trip_id,
      agency,
      commissionAmount,
    });
  }

  // Note: auto-attribution will be done in a second pass after we can look up
  // the reservation IDs from the database. Return counts for now.

  return {
    synced: reservations.length,
    attributed: attributionsToCreate.length,
    unmatched,
  };
}
