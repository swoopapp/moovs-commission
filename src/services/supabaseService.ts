import { EDGE_FUNCTION_URLS } from '../config/env';

// --- Types ---

export interface RawOperator {
  operator_id: string;
  name: string;
  email: string;
  name_slug: string;
  custom_domain: string | null;
  plan: string | null;
  status: string;
  is_active: boolean;
}

interface FetchOperatorResponse {
  data: RawOperator;
}

// --- HTTP Helpers ---

async function getJson<T>(url: string, params?: Record<string, string>): Promise<T> {
  const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${url}${queryString}`);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// --- Edge Function Callers ---

export async function fetchOperator(operatorId: string): Promise<RawOperator> {
  const response = await getJson<FetchOperatorResponse>(
    EDGE_FUNCTION_URLS.fetchOperators,
    { operator_id: operatorId }
  );
  return response.data;
}
