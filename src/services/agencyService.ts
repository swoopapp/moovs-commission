import { config } from '../config/env';
import { Agency } from '../types/commission';

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

// --- Input type (omit auto-generated fields) ---

export type CreateAgencyInput = Omit<Agency, 'id' | 'created_at' | 'updated_at' | 'portal_token'>;

// --- Lookups ---

export async function fetchAgencies(operatorId: string): Promise<Agency[]> {
  const url = `${BASE_REST_URL}/agencies?operator_id=eq.${encodeURIComponent(operatorId)}&order=created_at.desc`;
  const res = await fetch(url, { headers: headers({ 'Range': '0-9999' }) });
  return handleResponse<Agency[]>(res, 'fetchAgencies');
}

export interface PaginatedAgencies {
  agencies: Agency[];
  total: number;
}

export async function fetchAgenciesPaginated(
  operatorId: string,
  options?: { offset?: number; limit?: number; search?: string; matchedOnly?: boolean; unmatchedOnly?: boolean },
): Promise<PaginatedAgencies> {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;

  let url = `${BASE_REST_URL}/agencies?operator_id=eq.${encodeURIComponent(operatorId)}&order=name.asc&limit=${limit}&offset=${offset}`;

  if (options?.search) {
    url += `&name=ilike.*${encodeURIComponent(options.search)}*`;
  }
  if (options?.matchedOnly) {
    url += `&moovs_company_id=not.is.null`;
  }
  if (options?.unmatchedOnly) {
    url += `&moovs_company_id=is.null`;
  }

  const res = await fetch(url, {
    headers: headers({ 'Prefer': 'count=exact' }),
  });

  const data = await res.json() as Agency[];
  const contentRange = res.headers.get('content-range') || '';
  const totalMatch = contentRange.match(/\/(\d+)/);
  const total = totalMatch ? parseInt(totalMatch[1]) : data.length;

  return { agencies: data, total };
}

export async function fetchLinkedCompanyIds(operatorId: string): Promise<Set<string>> {
  const url = `${BASE_REST_URL}/agencies?operator_id=eq.${encodeURIComponent(operatorId)}&moovs_company_id=not.is.null&select=moovs_company_id`;
  const res = await fetch(url, { headers: headers({ 'Range': '0-9999' }) });
  const rows = await handleResponse<Array<{ moovs_company_id: string }>>(res, 'fetchLinkedCompanyIds');
  return new Set(rows.map((r) => r.moovs_company_id));
}

export async function fetchAgencyById(id: string): Promise<Agency | null> {
  const url = `${BASE_REST_URL}/agencies?id=eq.${encodeURIComponent(id)}&limit=1`;
  const res = await fetch(url, { headers: headers() });
  const rows = await handleResponse<Agency[]>(res, 'fetchAgencyById');
  return rows[0] ?? null;
}

export async function fetchAgencyByToken(token: string): Promise<Agency | null> {
  const url = `${BASE_REST_URL}/agencies?portal_token=eq.${encodeURIComponent(token)}&limit=1`;
  const res = await fetch(url, { headers: headers() });
  const rows = await handleResponse<Agency[]>(res, 'fetchAgencyByToken');
  return rows[0] ?? null;
}

// --- CRUD ---

export async function createAgency(data: CreateAgencyInput): Promise<Agency> {
  const url = `${BASE_REST_URL}/agencies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<Agency[]>(res, 'createAgency');
  if (!rows[0]) throw new Error('createAgency: no row returned');
  return rows[0];
}

export async function updateAgency(id: string, updates: Partial<Agency>): Promise<Agency> {
  const url = `${BASE_REST_URL}/agencies?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  const rows = await handleResponse<Agency[]>(res, 'updateAgency');
  if (!rows[0]) throw new Error('updateAgency: no row returned');
  return rows[0];
}

export async function deleteAgency(id: string): Promise<void> {
  const url = `${BASE_REST_URL}/agencies?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleVoidResponse(res, 'deleteAgency');
}
