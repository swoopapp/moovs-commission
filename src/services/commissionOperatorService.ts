// src/services/commissionOperatorService.ts
import { config } from '../config/env';
import { CommissionOperator } from '../types/commissionOperator';

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

// --- Lookups ---

export async function fetchOperatorBySlug(slug: string): Promise<CommissionOperator | null> {
  const res = await fetch(`${API}/commission-operators?slug=${encodeURIComponent(slug)}`);
  const rows = await handleResponse<CommissionOperator[]>(res, 'fetchOperatorBySlug');
  return rows[0] ?? null;
}

export async function fetchAllOperators(): Promise<CommissionOperator[]> {
  const res = await fetch(`${API}/commission-operators`);
  return handleResponse<CommissionOperator[]>(res, 'fetchAllOperators');
}

// --- CRUD ---

export async function createOperator(
  data: Pick<CommissionOperator, 'moovs_operator_id' | 'slug' | 'display_name' | 'auth_password'> &
    Partial<Pick<CommissionOperator, 'logo_url' | 'primary_color' | 'secondary_color' | 'contact_email' | 'contact_phone' | 'status'>>,
): Promise<CommissionOperator> {
  const res = await fetch(`${API}/commission-operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${API}/commission-operators/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const rows = await handleResponse<CommissionOperator[]>(res, 'updateOperator');
  if (!rows[0]) throw new Error('updateOperator: no row returned');
  return rows[0];
}

export async function deleteOperator(id: string): Promise<void> {
  const res = await fetch(`${API}/commission-operators/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleVoidResponse(res, 'deleteOperator');
}
