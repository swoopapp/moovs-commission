import { EDGE_FUNCTION_URLS } from '../config/env';
import { demoAgencies, isDemoMoovsOperatorId } from '../demoData';

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
  if (isDemoMoovsOperatorId(moovsOperatorId)) {
    const q = options.search?.trim().toLowerCase();
    let companies: MoovsCompany[] = demoAgencies.map((agency) => {
      const link = agency.client_links?.[0];
      return {
        company_id: link?.client_id ?? agency.moovs_company_id ?? agency.id,
        name: agency.name,
        email: agency.contact_email,
        phone_number: agency.contact_phone,
        address: agency.address,
        state: agency.state,
        postal_code: agency.zip_code,
        website_url: null,
        logo_url: null,
        description: agency.market_segment,
        created_at: agency.created_at,
        updated_at: agency.updated_at,
        source: link?.client_type ?? 'company',
        client_key: link?.client_key,
        client_type: link?.client_type ?? 'company',
        client_id: link?.client_id ?? agency.moovs_company_id ?? agency.id,
      };
    });
    if (q) companies = companies.filter((company) => company.name.toLowerCase().includes(q));
    return {
      companies: companies.slice(offset, offset + limit),
      total: companies.length,
      limit,
      offset,
    };
  }
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
