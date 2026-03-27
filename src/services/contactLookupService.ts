import { EDGE_FUNCTION_URLS } from '../config/env';

export interface MoovsContact {
  contact_id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_phone: string | null;
  position: string | null;
  home_address: string | null;
  work_address: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FetchContactsResponse {
  success: boolean;
  operator_id: string;
  company_id: string | null;
  count: number;
  contacts: MoovsContact[];
  error?: string;
}

/**
 * Fetch contacts from the Metabase Contact table via the fetch-contacts edge function.
 * Returns all contacts for an operator, optionally filtered to a specific company.
 */
export async function fetchMoovsContacts(
  moovsOperatorId: string,
  companyId?: string,
): Promise<FetchContactsResponse> {
  const body: Record<string, string> = { operator_id: moovsOperatorId };
  if (companyId) body.company_id = companyId;

  const res = await fetch(EDGE_FUNCTION_URLS.fetchContacts, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetch-contacts failed (${res.status}): ${text}`);
  }

  return res.json();
}
