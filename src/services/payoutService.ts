import { config } from '../config/env';
import { Payout, PayoutReservation } from '../types/commission';

const API = config.apiBaseUrl;

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} - ${body}`);
  }
  return response.json() as Promise<T>;
}

async function handleVoidResponse(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} - ${body}`);
  }
}

// --- Input type ---

export type CreatePayoutInput = Omit<Payout, 'id' | 'created_at' | 'updated_at'>;

// --- Lookups ---

export async function fetchPayoutsByOperator(operatorId: string): Promise<Payout[]> {
  const res = await fetch(`${API}/payouts?operator_id=${encodeURIComponent(operatorId)}`);
  return handleResponse<Payout[]>(res, 'fetchPayoutsByOperator');
}

export async function fetchPayoutsByAgency(agencyId: string): Promise<Payout[]> {
  const res = await fetch(`${API}/payouts?agency_id=${encodeURIComponent(agencyId)}`);
  return handleResponse<Payout[]>(res, 'fetchPayoutsByAgency');
}

export async function fetchPayoutReservationsByPayouts(payoutIds: string[]): Promise<PayoutReservation[]> {
  if (payoutIds.length === 0) return [];
  const idList = payoutIds.map(encodeURIComponent).join(',');
  const res = await fetch(`${API}/payout-reservations?payout_ids=${idList}`);
  return handleResponse<PayoutReservation[]>(res, 'fetchPayoutReservationsByPayouts');
}

export async function fetchAllPayoutReservations(agencyId: string): Promise<PayoutReservation[]> {
  // First get all payouts for this agency, then get their reservation links
  const payouts = await fetchPayoutsByAgency(agencyId);
  if (payouts.length === 0) return [];
  return fetchPayoutReservationsByPayouts(payouts.map((p) => p.id));
}

// --- CRUD ---

export async function createPayout(data: CreatePayoutInput): Promise<Payout> {
  const res = await fetch(`${API}/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<Payout[]>(res, 'createPayout');
  if (!rows[0]) throw new Error('createPayout: no row returned');
  return rows[0];
}

export async function createPayoutReservations(
  payoutId: string,
  reservationIds: string[],
): Promise<void> {
  if (reservationIds.length === 0) return;
  const res = await fetch(`${API}/payout-reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payout_id: payoutId, reservation_ids: reservationIds }),
  });
  return handleVoidResponse(res, 'createPayoutReservations');
}

export async function updatePayout(id: string, updates: Partial<Payout>): Promise<Payout> {
  const res = await fetch(`${API}/payouts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const rows = await handleResponse<Payout[]>(res, 'updatePayout');
  if (!rows[0]) throw new Error('updatePayout: no row returned');
  return rows[0];
}
