import { config } from '../config/env';
import { Reservation } from '../types/commission';

const BASE_REST_URL = `${config.supabaseUrl}/rest/v1`;

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} — ${body}`);
  }
  return response.json() as Promise<T>;
}


// --- Lookups ---

interface FetchReservationsOptions {
  agencyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchReservations(
  operatorId: string,
  options?: FetchReservationsOptions,
): Promise<Reservation[]> {
  let url = `${BASE_REST_URL}/commission_reservations?operator_id=eq.${encodeURIComponent(operatorId)}&order=pickup_date.desc`;

  if (options?.dateFrom) {
    url += `&pickup_date=gte.${encodeURIComponent(options.dateFrom)}`;
  }
  if (options?.dateTo) {
    url += `&pickup_date=lte.${encodeURIComponent(options.dateTo)}`;
  }

  const res = await fetch(url, { headers: headers() });
  return handleResponse<Reservation[]>(res, 'fetchReservations');
}

export async function fetchUnattributedReservations(operatorId: string): Promise<Reservation[]> {
  // Fetch all reservations for the operator — caller will filter out those with attributions
  return fetchReservations(operatorId);
}

export async function fetchReservationsByIds(ids: string[]): Promise<Reservation[]> {
  if (ids.length === 0) return [];
  const idList = ids.map(encodeURIComponent).join(',');
  const url = `${BASE_REST_URL}/commission_reservations?id=in.(${idList})&order=pickup_date.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<Reservation[]>(res, 'fetchReservationsByIds');
}

