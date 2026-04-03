import { config } from '../config/env';
import { Agency, Reservation, ReservationAttribution } from '../types/commission';

const API = config.apiBaseUrl;

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} - ${body}`);
  }
  return response.json() as Promise<T>;
}

// --- Input type (omit auto-generated fields) ---

export type CreateAttributionInput = Omit<ReservationAttribution, 'id' | 'attributed_at'>;

// --- Lookups ---

export async function fetchAttributionsByReservations(
  reservationIds: string[],
): Promise<ReservationAttribution[]> {
  if (reservationIds.length === 0) return [];

  const idList = reservationIds.map(encodeURIComponent).join(',');
  const res = await fetch(`${API}/attributions?reservation_ids=${idList}`);
  return handleResponse<ReservationAttribution[]>(res, 'fetchAttributionsByReservations');
}

export async function fetchAttributionsByAgency(
  agencyId: string,
): Promise<ReservationAttribution[]> {
  const res = await fetch(`${API}/attributions?agency_id=${encodeURIComponent(agencyId)}`);
  return handleResponse<ReservationAttribution[]>(res, 'fetchAttributionsByAgency');
}

// --- CRUD ---

export async function createAttribution(
  data: CreateAttributionInput,
): Promise<ReservationAttribution> {
  const res = await fetch(`${API}/attributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<ReservationAttribution[]>(res, 'createAttribution');
  if (!rows[0]) throw new Error('createAttribution: no row returned');
  return rows[0];
}

export async function createAttributions(
  data: CreateAttributionInput[],
): Promise<ReservationAttribution[]> {
  if (data.length === 0) return [];

  const res = await fetch(`${API}/attributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<ReservationAttribution[]>(res, 'createAttributions');
}

// --- Commission calculation ---

export function calculateCommission(reservation: Reservation, agency: Agency): number {
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
