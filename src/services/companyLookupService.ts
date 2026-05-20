import { EDGE_FUNCTION_URLS } from '../config/env';

export interface MoovsCompany {
  company_id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  state: string | null;
  postal_code: string | null;
  website_url: string | null;
  logo_url: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  source?: 'company' | 'shuttle_client';
  client_key?: string;
  client_type?: 'company' | 'shuttle_client';
  client_id?: string;
}

interface FetchCompaniesResponse {
  success: boolean;
  operator_id: string;
  count: number;
  total?: number;
  limit?: number;
  offset?: number;
  companies: MoovsCompany[];
}

export interface FetchMoovsCompaniesOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface FetchMoovsCompaniesResult {
  companies: MoovsCompany[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch all Moovs companies for an operator via the fetch-companies edge function.
 * Uses the Moovs operator UUID (not the commission_operators.id).
 */
export async function fetchMoovsCompanies(
  moovsOperatorId: string,
  options: FetchMoovsCompaniesOptions = {},
): Promise<FetchMoovsCompaniesResult> {
  const limit = options.limit ?? 25;
  const offset = options.offset ?? 0;
  const res = await fetch(EDGE_FUNCTION_URLS.fetchCompanies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operator_id: moovsOperatorId,
      search: options.search?.trim() || undefined,
      limit,
      offset,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetchMoovsCompanies failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data: FetchCompaniesResponse = await res.json();
  const companies = (data.companies || []).map((company) => ({
    ...company,
    name: company.name || 'Unnamed company',
  }));
  return {
    companies,
    total: data.total ?? data.count ?? 0,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
}
