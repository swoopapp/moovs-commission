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

  const res = await fetch(url);
  return handleResponse<Reservation[]>(res, 'fetchReservations');
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
