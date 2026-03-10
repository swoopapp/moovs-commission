import { config } from '../config/env';
import { Payout, PayoutReservation } from '../types/commission';

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

async function handleVoidResponse(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context}: ${response.status} ${response.statusText} — ${body}`);
  }
}

// --- Input type ---

export type CreatePayoutInput = Omit<Payout, 'id' | 'created_at' | 'updated_at'>;

// --- Lookups ---

export async function fetchPayoutsByOperator(operatorId: string): Promise<Payout[]> {
  const url = `${BASE_REST_URL}/payouts?operator_id=eq.${encodeURIComponent(operatorId)}&order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<Payout[]>(res, 'fetchPayoutsByOperator');
}

export async function fetchPayoutsByAgency(agencyId: string): Promise<Payout[]> {
  const url = `${BASE_REST_URL}/payouts?agency_id=eq.${encodeURIComponent(agencyId)}&order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<Payout[]>(res, 'fetchPayoutsByAgency');
}

export async function fetchPayoutReservationsByPayouts(payoutIds: string[]): Promise<PayoutReservation[]> {
  if (payoutIds.length === 0) return [];
  const idList = payoutIds.map(encodeURIComponent).join(',');
  const url = `${BASE_REST_URL}/payout_reservations?payout_id=in.(${idList})`;
  const res = await fetch(url, { headers: headers() });
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
  const url = `${BASE_REST_URL}/payouts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
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
  const url = `${BASE_REST_URL}/payout_reservations`;
  const rows = reservationIds.map((rid) => ({
    payout_id: payoutId,
    reservation_id: rid,
  }));
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  return handleVoidResponse(res, 'createPayoutReservations');
}

export async function updatePayout(id: string, updates: Partial<Payout>): Promise<Payout> {
  const url = `${BASE_REST_URL}/payouts?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  const rows = await handleResponse<Payout[]>(res, 'updatePayout');
  if (!rows[0]) throw new Error('updatePayout: no row returned');
  return rows[0];
}
