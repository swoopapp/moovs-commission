import { config } from '../config/env';
import { Reservation } from '../types/commission';

const API = config.apiBaseUrl;

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} - ${body}`);
  }
  return response.json() as Promise<T>;
}


// --- Lookups ---

interface FetchReservationsOptions {
  agencyId?: string;
  dateFrom?: string;
  dateTo?: string;
  companyId?: string;
  clientKey?: string;
  limit?: number;
  offset?: number;
}

export async function fetchReservations(
  operatorId: string,
  options?: FetchReservationsOptions,
): Promise<Reservation[]> {
  let url = `${API}/commission-reservations?operator_id=${encodeURIComponent(operatorId)}`;

  if (options?.dateFrom) {
    url += `&date_from=${encodeURIComponent(options.dateFrom)}`;
  }
  if (options?.dateTo) {
    url += `&date_to=${encodeURIComponent(options.dateTo)}`;
  }
  if (options?.companyId) {
    url += `&company_id=${encodeURIComponent(options.companyId)}`;
  }
  if (options?.clientKey) {
    url += `&client_key=${encodeURIComponent(options.clientKey)}`;
  }
  if (options?.limit) {
    url += `&limit=${encodeURIComponent(String(options.limit))}`;
  }
  if (options?.offset) {
    url += `&offset=${encodeURIComponent(String(options.offset))}`;
  }

  const res = await fetch(url);
  return handleResponse<Reservation[]>(res, 'fetchReservations');
}

type RawMoovsReservation = Record<string, unknown>;

function money(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => text(item))
    .filter((item): item is string => Boolean(item))));
}

function liveId(operatorId: string, moovsTripId: string): string {
  return `live:${operatorId}:${moovsTripId}`;
}

export function isLiveReservationId(id: string): boolean {
  return id.startsWith('live:');
}

function transformLiveReservation(raw: RawMoovsReservation, operatorId: string): Reservation | null {
  const moovsTripId = text(raw['Trip ID']);
  if (!moovsTripId) return null;

  const baseRate = money(raw['Base Rate']);
  const totalAmount = money(raw['Total Amount ($)']);
  const gratuity = money(raw['Driver Gratuity Amount']);

  return {
    id: liveId(operatorId, moovsTripId),
    operator_id: operatorId,
    moovs_trip_id: moovsTripId,
    moovs_company_id: text(raw['Company ID']),
    order_number: text(raw['Order Number']),
    confirmation_number: text(raw['Confirmation Number']),
    pickup_date: text(raw['Pickup Date Time']),
    pickup_location: text(raw['Pickup Address']),
    dropoff_location: text(raw['Dropoff Address']),
    passenger_name: text(raw['Passenger Contact Full Name']),
    booking_contact_id: text(raw['Booking Contact ID']),
    booking_contact_name: text(raw['Booking Contact Full Name']),
    booking_contact_email: text(raw['Booking Contact Email']),
    vehicle_type: text(raw['Vehicle Name']),
    trip_type: text(raw['Trip Type']) ?? text(raw['Source']),
    base_rate_amount: baseRate,
    total_amount: totalAmount,
    total_with_gratuity: Math.round((totalAmount + gratuity) * 100) / 100,
    trip_status: text(raw['Status Slug']),
    client_keys: textArray(raw['Client Keys']),
    synced_at: new Date().toISOString(),
  };
}

export async function fetchLiveReservations(
  localOperatorId: string,
  moovsOperatorId: string,
  options?: FetchReservationsOptions,
): Promise<Reservation[]> {
  const res = await fetch(`${API}/fetch-reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operator_id: moovsOperatorId,
      date_from: options?.dateFrom,
      date_to: options?.dateTo,
      company_id: options?.companyId,
      client_key: options?.clientKey,
      limit: options?.limit,
      offset: options?.offset,
    }),
  });
  const data = await handleResponse<{ reservations?: RawMoovsReservation[] }>(res, 'fetchLiveReservations');
  return (data.reservations ?? [])
    .map((raw) => transformLiveReservation(raw, localOperatorId))
    .filter((row): row is Reservation => Boolean(row));
}

/**
 * Read live Moovs trips, overlay any existing local snapshot IDs, and include local-only snapshots.
 * Live rows win for display freshness; local IDs are preserved so existing attributions/payouts still join.
 */
export async function fetchCurrentReservations(
  localOperatorId: string,
  moovsOperatorId: string,
  options?: FetchReservationsOptions,
): Promise<Reservation[]> {
  const persistedOptions = options
    ? {
        agencyId: options.agencyId,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        companyId: options.companyId,
        clientKey: options.clientKey,
      }
    : undefined;

  const [liveRows, persistedRows] = await Promise.all([
    fetchLiveReservations(localOperatorId, moovsOperatorId, options).catch((err) => {
      console.warn('Live Moovs reservation fetch failed; falling back to persisted snapshots', err);
      return [] as Reservation[];
    }),
    fetchReservations(localOperatorId, persistedOptions),
  ]);

  const persistedByTripId = new Map(persistedRows.map((row) => [row.moovs_trip_id, row]));
  const merged = liveRows.map((live) => {
    const persisted = persistedByTripId.get(live.moovs_trip_id);
    return persisted ? { ...live, id: persisted.id, synced_at: persisted.synced_at } : live;
  });

  const isPagedLiveFetch = Boolean(options?.limit || options?.offset);
  if (!isPagedLiveFetch || liveRows.length === 0) {
    const liveTripIds = new Set(liveRows.map((row) => row.moovs_trip_id));
    for (const persisted of persistedRows) {
      if (!liveTripIds.has(persisted.moovs_trip_id)) merged.push(persisted);
    }
  }

  return merged.sort((a, b) => (b.pickup_date || '').localeCompare(a.pickup_date || ''));
}

export async function upsertReservations(reservations: Reservation[]): Promise<Reservation[]> {
  if (reservations.length === 0) return [];
  const payload = reservations.map(({ id: _id, synced_at: _syncedAt, ...row }) => row);
  const res = await fetch(`${API}/commission-reservations/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation[]>(res, 'upsertReservations');
}

export async function fetchUnattributedReservations(operatorId: string): Promise<Reservation[]> {
  // Fetch all reservations for the operator -- caller will filter out those with attributions
  return fetchReservations(operatorId);
}

export async function fetchReservationsByIds(ids: string[]): Promise<Reservation[]> {
  if (ids.length === 0) return [];
  const idList = ids.map(encodeURIComponent).join(',');
  const res = await fetch(`${API}/commission-reservations/by-ids?ids=${idList}`);
  return handleResponse<Reservation[]>(res, 'fetchReservationsByIds');
}
