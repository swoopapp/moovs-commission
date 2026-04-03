import { config } from '../config/env';
import { Agency } from '../types/commission';

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

// --- Input type (omit auto-generated fields) ---

export type CreateAgencyInput = Omit<Agency, 'id' | 'created_at' | 'updated_at' | 'portal_token'>;

// --- Lookups ---

export async function fetchAgencies(operatorId: string): Promise<Agency[]> {
  const res = await fetch(`${API}/agencies?operator_id=${encodeURIComponent(operatorId)}`);
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

  let url = `${API}/agencies?operator_id=${encodeURIComponent(operatorId)}&limit=${limit}&offset=${offset}`;

  if (options?.search) {
    url += `&search=${encodeURIComponent(options.search)}`;
  }
  if (options?.matchedOnly) {
    url += `&matched_only=true`;
  }
  if (options?.unmatchedOnly) {
    url += `&unmatched_only=true`;
  }

  const res = await fetch(url);
  return handleResponse<PaginatedAgencies>(res, 'fetchAgenciesPaginated');
}

export async function fetchLinkedCompanyIds(operatorId: string): Promise<Set<string>> {
  const res = await fetch(`${API}/agencies/linked-companies/${encodeURIComponent(operatorId)}`);
  const rows = await handleResponse<Array<{ moovs_company_id: string }>>(res, 'fetchLinkedCompanyIds');
  return new Set(rows.map((r) => r.moovs_company_id));
}

export async function fetchAgencyById(id: string): Promise<Agency | null> {
  const res = await fetch(`${API}/agencies/${encodeURIComponent(id)}`);
  const rows = await handleResponse<Agency[]>(res, 'fetchAgencyById');
  return rows[0] ?? null;
}

export async function fetchAgencyByToken(token: string): Promise<Agency | null> {
  const res = await fetch(`${API}/agencies/by-token/${encodeURIComponent(token)}`);
  const rows = await handleResponse<Agency[]>(res, 'fetchAgencyByToken');
  return rows[0] ?? null;
}

// --- CRUD ---

export async function createAgency(data: CreateAgencyInput): Promise<Agency> {
  const res = await fetch(`${API}/agencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<Agency[]>(res, 'createAgency');
  if (!rows[0]) throw new Error('createAgency: no row returned');
  return rows[0];
}

export async function updateAgency(id: string, updates: Partial<Agency>): Promise<Agency> {
  const res = await fetch(`${API}/agencies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const rows = await handleResponse<Agency[]>(res, 'updateAgency');
  if (!rows[0]) throw new Error('updateAgency: no row returned');
  return rows[0];
}

export async function deleteAgency(id: string): Promise<void> {
  const res = await fetch(`${API}/agencies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleVoidResponse(res, 'deleteAgency');
}
