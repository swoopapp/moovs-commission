// src/services/commissionOperatorService.ts
import { config } from '../config/env';
import { CommissionOperator } from '../types/commissionOperator';

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

// --- Lookups ---

export async function fetchOperatorBySlug(slug: string): Promise<CommissionOperator | null> {
  const url = `${BASE_REST_URL}/commission_operators?slug=eq.${encodeURIComponent(slug)}&limit=1`;
  const res = await fetch(url, { headers: headers() });
  const rows = await handleResponse<CommissionOperator[]>(res, 'fetchOperatorBySlug');
  return rows[0] ?? null;
}

export async function fetchAllOperators(): Promise<CommissionOperator[]> {
  const url = `${BASE_REST_URL}/commission_operators?order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<CommissionOperator[]>(res, 'fetchAllOperators');
}

// --- CRUD ---

export async function createOperator(
  data: Pick<CommissionOperator, 'moovs_operator_id' | 'slug' | 'display_name' | 'auth_password'> &
    Partial<Pick<CommissionOperator, 'logo_url' | 'primary_color' | 'secondary_color' | 'contact_email' | 'contact_phone' | 'status'>>,
): Promise<CommissionOperator> {
  const url = `${BASE_REST_URL}/commission_operators`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<CommissionOperator[]>(res, 'createOperator');
  if (!rows[0]) throw new Error('createOperator: no row returned');
  return rows[0];
}

export async function updateOperator(
  id: string,
  updates: Partial<Pick<CommissionOperator, 'display_name' | 'logo_url' | 'primary_color' | 'secondary_color' | 'auth_password' | 'slug' | 'contact_email' | 'contact_phone' | 'status'>>,
): Promise<CommissionOperator> {
  const url = `${BASE_REST_URL}/commission_operators?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  const rows = await handleResponse<CommissionOperator[]>(res, 'updateOperator');
  if (!rows[0]) throw new Error('updateOperator: no row returned');
  return rows[0];
}

export async function deleteOperator(id: string): Promise<void> {
  const url = `${BASE_REST_URL}/commission_operators?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleVoidResponse(res, 'deleteOperator');
}
