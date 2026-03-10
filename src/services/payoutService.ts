import { config } from '../config/env';
import { Payout } from '../types/commission';

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
