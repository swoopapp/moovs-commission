import { config } from '../config/env';
import { Agency, Reservation, ReservationAttribution } from '../types/commission';
import type { RouteRateConfig } from '../types/commissionOperator';
import { calculateCommission as calcCommission } from '../lib/commission-calc';
import {
  demoReadOnlyError,
  getDemoAttributionsByAgency,
  getDemoAttributionsByReservations,
  isDemoAgencyId,
  isDemoReservationId,
} from '../demoData';

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
  if (reservationIds.some(isDemoReservationId)) return getDemoAttributionsByReservations(reservationIds);

  const idList = reservationIds.map(encodeURIComponent).join(',');
  const res = await fetch(`${API}/attributions?reservation_ids=${idList}`);
  return handleResponse<ReservationAttribution[]>(res, 'fetchAttributionsByReservations');
}

export async function fetchAttributionsByAgency(
  agencyId: string,
): Promise<ReservationAttribution[]> {
  if (isDemoAgencyId(agencyId)) return getDemoAttributionsByAgency(agencyId);
  const res = await fetch(`${API}/attributions?agency_id=${encodeURIComponent(agencyId)}`);
  return handleResponse<ReservationAttribution[]>(res, 'fetchAttributionsByAgency');
}

// --- CRUD ---

export async function createAttribution(
  data: CreateAttributionInput,
): Promise<ReservationAttribution> {
  if (isDemoAgencyId(data.agency_id) || isDemoReservationId(data.reservation_id)) throw demoReadOnlyError('Creating attributions');
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
  if (data.some((row) => isDemoAgencyId(row.agency_id) || isDemoReservationId(row.reservation_id))) {
    throw demoReadOnlyError('Creating attributions');
  }

  const res = await fetch(`${API}/attributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<ReservationAttribution[]>(res, 'createAttributions');
}

// --- Commission calculation ---
// Delegates to the shared engine so the browser and the portal API stay in sync.

export function calculateCommission(
  reservation: Reservation,
  agency: Agency,
  routeConfig?: RouteRateConfig | null,
): number {
  return calcCommission(reservation, agency, routeConfig);
}
