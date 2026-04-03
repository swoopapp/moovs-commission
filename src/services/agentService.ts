import { config } from '../config/env';
import { Agent } from '../types/commission';

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

export type CreateAgentInput = Omit<Agent, 'id' | 'created_at' | 'portal_token'>;

// --- Lookups ---

export async function fetchAgents(agencyId: string): Promise<Agent[]> {
  const res = await fetch(`${API}/agents?agency_id=${encodeURIComponent(agencyId)}`);
  return handleResponse<Agent[]>(res, 'fetchAgents');
}

export async function fetchAgentsByOperator(_operatorId: string, agencyIds: string[]): Promise<Agent[]> {
  const ids = agencyIds.map(encodeURIComponent).join(',');
  const res = await fetch(`${API}/agents?agency_ids=${ids}`);
  return handleResponse<Agent[]>(res, 'fetchAgentsByOperator');
}

export async function fetchAgentByToken(token: string): Promise<Agent | null> {
  const res = await fetch(`${API}/agents/by-token/${encodeURIComponent(token)}`);
  const rows = await handleResponse<Agent[]>(res, 'fetchAgentByToken');
  return rows[0] ?? null;
}

// --- CRUD ---

export async function createAgent(data: CreateAgentInput): Promise<Agent> {
  const res = await fetch(`${API}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const rows = await handleResponse<Agent[]>(res, 'createAgent');
  if (!rows[0]) throw new Error('createAgent: no row returned');
  return rows[0];
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
  const res = await fetch(`${API}/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const rows = await handleResponse<Agent[]>(res, 'updateAgent');
  if (!rows[0]) throw new Error('updateAgent: no row returned');
  return rows[0];
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${API}/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleVoidResponse(res, 'deleteAgent');
}
