import { config } from '../config/env';
import { Agent } from '../types/commission';

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

export type CreateAgentInput = Omit<Agent, 'id' | 'created_at' | 'portal_token'>;

// --- Lookups ---

export async function fetchAgents(agencyId: string): Promise<Agent[]> {
  const url = `${BASE_REST_URL}/agents?agency_id=eq.${encodeURIComponent(agencyId)}&order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<Agent[]>(res, 'fetchAgents');
}

export async function fetchAgentsByOperator(_operatorId: string, agencyIds: string[]): Promise<Agent[]> {
  const ids = agencyIds.map(encodeURIComponent).join(',');
  const url = `${BASE_REST_URL}/agents?agency_id=in.(${ids})&order=created_at.desc`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse<Agent[]>(res, 'fetchAgentsByOperator');
}

export async function fetchAgentByToken(token: string): Promise<Agent | null> {
  const url = `${BASE_REST_URL}/agents?portal_token=eq.${encodeURIComponent(token)}&limit=1`;
  const res = await fetch(url, { headers: headers() });
  const rows = await handleResponse<Agent[]>(res, 'fetchAgentByToken');
  return rows[0] ?? null;
}

// --- CRUD ---

export async function createAgent(data: CreateAgentInput): Promise<Agent> {
  const url = `${BASE_REST_URL}/agents`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<Agent[]>(res, 'createAgent');
  if (!rows[0]) throw new Error('createAgent: no row returned');
  return rows[0];
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
  const url = `${BASE_REST_URL}/agents?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(updates),
  });
  const rows = await handleResponse<Agent[]>(res, 'updateAgent');
  if (!rows[0]) throw new Error('updateAgent: no row returned');
  return rows[0];
}

export async function deleteAgent(id: string): Promise<void> {
  const url = `${BASE_REST_URL}/agents?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleVoidResponse(res, 'deleteAgent');
}
