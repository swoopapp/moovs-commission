// src/services/operatorBrandingService.ts
import { config } from '../config/env';
import { OperatorBranding } from '../types/operatorBranding';

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

export async function fetchBrandingBySlug(slug: string): Promise<OperatorBranding | null> {
  const url = `${BASE_REST_URL}/operator_branding?slug=eq.${encodeURIComponent(slug)}&limit=1`;
  const res = await fetch(url, { headers: headers() });
  const rows = await handleResponse<OperatorBranding[]>(res, 'fetchBrandingBySlug');
  return rows[0] ?? null;
}

export async function fetchAllBrandings(): Promise<OperatorBranding[]> {
  const url = `${BASE_REST_URL}/operator_branding?order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<OperatorBranding[]>(res, 'fetchAllBrandings');
}

// --- CRUD ---

export async function createBranding(
  data: Pick<OperatorBranding, 'operator_id' | 'slug' | 'auth_password'> &
    Partial<Pick<OperatorBranding, 'display_name' | 'logo_url' | 'primary_color' | 'secondary_color' | 'sso_provider' | 'sso_config'>>,
): Promise<OperatorBranding> {
  const url = `${BASE_REST_URL}/operator_branding`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<OperatorBranding[]>(res, 'createBranding');
  if (!rows[0]) throw new Error('createBranding: no row returned');
  return rows[0];
}

export async function updateBranding(
  id: string,
  updates: Partial<Pick<OperatorBranding, 'display_name' | 'logo_url' | 'primary_color' | 'secondary_color' | 'auth_password' | 'sso_provider' | 'sso_config' | 'slug'>>,
): Promise<OperatorBranding> {
  const url = `${BASE_REST_URL}/operator_branding?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  const rows = await handleResponse<OperatorBranding[]>(res, 'updateBranding');
  if (!rows[0]) throw new Error('updateBranding: no row returned');
  return rows[0];
}

export async function deleteBranding(id: string): Promise<void> {
  const url = `${BASE_REST_URL}/operator_branding?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleVoidResponse(res, 'deleteBranding');
}
