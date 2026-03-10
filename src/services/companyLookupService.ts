import { config, EDGE_FUNCTION_URLS } from '../config/env';

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
}

interface FetchCompaniesResponse {
  success: boolean;
  operator_id: string;
  count: number;
  companies: MoovsCompany[];
}

/**
 * Fetch all Moovs companies for an operator via the fetch-companies edge function.
 * Uses the Moovs operator UUID (not the commission_operators.id).
 */
export async function fetchMoovsCompanies(moovsOperatorId: string): Promise<MoovsCompany[]> {
  const res = await fetch(EDGE_FUNCTION_URLS.fetchCompanies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
    },
    body: JSON.stringify({ operator_id: moovsOperatorId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetchMoovsCompanies failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data: FetchCompaniesResponse = await res.json();
  return data.companies || [];
}
