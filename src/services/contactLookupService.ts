import { EDGE_FUNCTION_URLS } from '../config/env';
import { demoAgents, isDemoMoovsOperatorId } from '../demoData';

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
  if (isDemoMoovsOperatorId(moovsOperatorId)) {
    const contacts = demoAgents
      .filter((agent) => !companyId || agent.agency_id.includes(companyId) || agent.moovs_contact_id === companyId)
      .map((agent) => ({
        contact_id: agent.moovs_contact_id ?? agent.id,
        company_id: agent.agency_id,
        first_name: agent.name.split(' ')[0] ?? null,
        last_name: agent.name.split(' ').slice(1).join(' ') || null,
        email: agent.email,
        mobile_phone: agent.phone,
        position: agent.role === 'gm' ? 'General Manager' : 'Reservations Agent',
        home_address: null,
        work_address: null,
        created_at: agent.created_at,
        updated_at: agent.created_at,
      }));
    return {
      success: true,
      operator_id: moovsOperatorId,
      company_id: companyId ?? null,
      count: contacts.length,
      contacts,
    };
  }

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
