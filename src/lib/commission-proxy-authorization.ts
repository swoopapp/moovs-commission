export type OperatorProxySession = {
  operatorId: string;
  moovsOperatorId: string;
};

export type OwnershipLookupRequest = {
  agencies?: string[];
  agents?: string[];
  reservations?: string[];
  payouts?: string[];
};

export type OwnershipRecord = {
  resource: 'agency' | 'agent' | 'reservation' | 'payout';
  id: string;
  operator_id: string;
  agency_id: string | null;
};

export type OwnershipLookup = (request: OwnershipLookupRequest) => Promise<OwnershipRecord[]>;

export type OperatorAuthorizationResult =
  | { allowed: true }
  | { allowed: false; status: 400 | 403 | 405; error: string };

type AuthorizationInput = {
  path: string;
  method: string;
  url: URL;
  session: OperatorProxySession;
  readJson: () => Promise<unknown>;
  lookupOwnership: OwnershipLookup;
};

const MAX_IDS = 250;

function denied(status: 400 | 403 | 405, error: string): OperatorAuthorizationResult {
  return { allowed: false, status, error };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

function uniqueIds(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;
  const ids: string[] = [];
  for (const value of values) {
    const id = nonEmptyString(value);
    if (!id) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.length <= MAX_IDS ? ids : null;
}

function csvIds(value: string | null): string[] | null {
  if (!value) return null;
  return uniqueIds(value.split(','));
}

function recordsFor(
  records: OwnershipRecord[],
  resource: OwnershipRecord['resource'],
): Map<string, OwnershipRecord> {
  return new Map(
    records
      .filter((record) => record.resource === resource)
      .map((record) => [record.id, record]),
  );
}

function allOwned(
  records: OwnershipRecord[],
  resource: OwnershipRecord['resource'],
  ids: string[],
  operatorId: string,
): boolean {
  if (ids.length === 0) return false;
  const byId = recordsFor(records, resource);
  return ids.every((id) => byId.get(id)?.operator_id === operatorId);
}

async function ownsAgencies(
  lookup: OwnershipLookup,
  agencyIds: string[],
  operatorId: string,
): Promise<boolean> {
  if (!agencyIds.length || agencyIds.length > MAX_IDS) return false;
  const records = await lookup({ agencies: agencyIds });
  return allOwned(records, 'agency', agencyIds, operatorId);
}

async function ownsReservations(
  lookup: OwnershipLookup,
  reservationIds: string[],
  operatorId: string,
): Promise<boolean> {
  if (!reservationIds.length || reservationIds.length > MAX_IDS) return false;
  const records = await lookup({ reservations: reservationIds });
  return allOwned(records, 'reservation', reservationIds, operatorId);
}

async function ownsPayouts(
  lookup: OwnershipLookup,
  payoutIds: string[],
  operatorId: string,
): Promise<boolean> {
  if (!payoutIds.length || payoutIds.length > MAX_IDS) return false;
  const records = await lookup({ payouts: payoutIds });
  return allOwned(records, 'payout', payoutIds, operatorId);
}

export async function authorizeOperatorProxyRequest({
  path,
  method,
  url,
  session,
  readJson,
  lookupOwnership,
}: AuthorizationInput): Promise<OperatorAuthorizationResult> {
  const segments = path.split('/').filter(Boolean);
  const bodyFor = async (): Promise<Record<string, unknown> | null> => asRecord(await readJson());

  if (path === 'agencies') {
    if (method === 'GET') {
      return url.searchParams.get('operator_id') === session.operatorId
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    if (method === 'POST') {
      const body = await bodyFor();
      if (!body) return denied(400, 'Invalid request body');
      return body.operator_id === session.operatorId
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    return denied(405, 'Method not allowed');
  }

  if (
    segments.length === 3 &&
    segments[0] === 'agencies' &&
    ['linked-companies', 'linked-clients'].includes(segments[1])
  ) {
    if (method !== 'GET') return denied(405, 'Method not allowed');
    return segments[2] === session.operatorId
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (segments[0] === 'agencies' && segments[1] === 'by-token') {
    return denied(403, 'Forbidden');
  }

  if (segments.length === 2 && segments[0] === 'agencies') {
    if (!['GET', 'PATCH', 'DELETE'].includes(method)) return denied(405, 'Method not allowed');
    return await ownsAgencies(lookupOwnership, [segments[1]], session.operatorId)
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (
    segments.length === 3 &&
    segments[0] === 'agencies' &&
    segments[2] === 'regenerate-token'
  ) {
    if (method !== 'POST') return denied(405, 'Method not allowed');
    return await ownsAgencies(lookupOwnership, [segments[1]], session.operatorId)
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (path === 'agents') {
    if (method === 'GET') {
      // Match Lambda precedence: agency_ids is evaluated before agency_id.
      const agencyIds = csvIds(url.searchParams.get('agency_ids'))
        ?? (url.searchParams.get('agency_id') ? [url.searchParams.get('agency_id')!] : null);
      if (!agencyIds) return denied(400, 'Missing or invalid agency IDs');
      return await ownsAgencies(lookupOwnership, agencyIds, session.operatorId)
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    if (method === 'POST') {
      const body = await bodyFor();
      const agencyId = nonEmptyString(body?.agency_id);
      if (!agencyId) return denied(400, 'Invalid request body');
      return await ownsAgencies(lookupOwnership, [agencyId], session.operatorId)
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    return denied(405, 'Method not allowed');
  }

  if (segments[0] === 'agents' && segments[1] === 'by-token') {
    return denied(403, 'Forbidden');
  }

  if (segments.length === 2 && segments[0] === 'agents') {
    if (!['PATCH', 'DELETE'].includes(method)) return denied(405, 'Method not allowed');
    const records = await lookupOwnership({ agents: [segments[1]] });
    return allOwned(records, 'agent', [segments[1]], session.operatorId)
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (path === 'commission-reservations') {
    if (method !== 'GET') return denied(405, 'Method not allowed');
    return url.searchParams.get('operator_id') === session.operatorId
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (path === 'commission-reservations/upsert') {
    if (method !== 'POST') return denied(405, 'Method not allowed');
    return denied(403, 'Use the atomic payout endpoint');
  }

  if (path === 'commission-reservations/by-ids') {
    if (method !== 'GET') return denied(405, 'Method not allowed');
    const ids = csvIds(url.searchParams.get('ids'));
    if (!ids) return denied(400, 'Missing or invalid reservation IDs');
    return await ownsReservations(lookupOwnership, ids, session.operatorId)
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (path === 'attributions') {
    if (method === 'GET') {
      // Match Lambda precedence: reservation_ids is evaluated before agency_id.
      const reservationIds = csvIds(url.searchParams.get('reservation_ids'));
      if (reservationIds) {
        return await ownsReservations(lookupOwnership, reservationIds, session.operatorId)
          ? { allowed: true }
          : denied(403, 'Forbidden');
      }
      const operatorId = url.searchParams.get('operator_id');
      if (operatorId) {
        return operatorId === session.operatorId
          ? { allowed: true }
          : denied(403, 'Forbidden');
      }
      const agencyId = url.searchParams.get('agency_id');
      if (!agencyId) return denied(400, 'Missing attribution scope');
      return await ownsAgencies(lookupOwnership, [agencyId], session.operatorId)
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    if (method === 'POST') {
      return denied(403, 'Use the atomic payout endpoint');
    }
    return denied(405, 'Method not allowed');
  }

  if (path === 'payouts') {
    if (method === 'GET') {
      // Match Lambda precedence: operator_id is evaluated before agency_id.
      const operatorId = url.searchParams.get('operator_id');
      if (operatorId) {
        return operatorId === session.operatorId
          ? { allowed: true }
          : denied(403, 'Forbidden');
      }
      const agencyId = url.searchParams.get('agency_id');
      if (!agencyId) return denied(400, 'Missing payout scope');
      return await ownsAgencies(lookupOwnership, [agencyId], session.operatorId)
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    if (method === 'POST') {
      return denied(403, 'Use the atomic payout endpoint');
    }
    return denied(405, 'Method not allowed');
  }

  if (path === 'payouts/create-from-trips') {
    if (method !== 'POST') return denied(405, 'Method not allowed');
    const body = await bodyFor();
    const agencyId = nonEmptyString(body?.agency_id);
    const items = Array.isArray(body?.items) ? body.items.map(asRecord) : null;
    if (
      !body ||
      body.operator_id !== session.operatorId ||
      !agencyId ||
      !items?.length ||
      items.length > 1000
    ) {
      return denied(403, 'Forbidden');
    }

    const agentIds: string[] = [];
    for (const item of items) {
      const tripId = nonEmptyString(item?.moovs_trip_id);
      if (!tripId) return denied(400, 'Invalid request body');
      const agentId = item?.agent_id === null || item?.agent_id === undefined
        ? null
        : nonEmptyString(item.agent_id);
      if (item?.agent_id && !agentId) return denied(400, 'Invalid request body');
      if (agentId && !agentIds.includes(agentId)) agentIds.push(agentId);
    }
    if (agentIds.length > MAX_IDS) return denied(400, 'Too many distinct agents');

    const records = await lookupOwnership({ agencies: [agencyId], agents: agentIds });
    if (
      !allOwned(records, 'agency', [agencyId], session.operatorId) ||
      (agentIds.length > 0 && !allOwned(records, 'agent', agentIds, session.operatorId))
    ) {
      return denied(403, 'Forbidden');
    }
    const agentsById = recordsFor(records, 'agent');
    if (agentIds.some((agentId) => agentsById.get(agentId)?.agency_id !== agencyId)) {
      return denied(403, 'Forbidden');
    }
    return { allowed: true };
  }

  if (segments.length === 2 && segments[0] === 'payouts') {
    if (method !== 'PATCH') return denied(405, 'Method not allowed');
    return denied(403, 'Payout records are immutable for operator sessions');
  }

  if (path === 'payout-reservations') {
    if (method === 'GET') {
      const payoutIds = csvIds(url.searchParams.get('payout_ids'));
      if (!payoutIds) return denied(400, 'Missing or invalid payout IDs');
      return await ownsPayouts(lookupOwnership, payoutIds, session.operatorId)
        ? { allowed: true }
        : denied(403, 'Forbidden');
    }
    if (method === 'POST') {
      return denied(403, 'Use the atomic payout endpoint');
    }
    return denied(405, 'Method not allowed');
  }

  if (['fetch-reservations', 'fetch-companies', 'fetch-contacts'].includes(path)) {
    if (method !== 'POST') return denied(405, 'Method not allowed');
    const body = await bodyFor();
    if (!body) return denied(400, 'Invalid request body');
    return body.operator_id === session.moovsOperatorId
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (path === 'fetch-shuttle-routes') {
    if (method !== 'GET') return denied(405, 'Method not allowed');
    return url.searchParams.get('operator_id') === session.moovsOperatorId
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  if (
    segments.length === 3 &&
    segments[0] === 'commission-operators' &&
    segments[2] === 'route-rates'
  ) {
    if (method !== 'PATCH') return denied(405, 'Method not allowed');
    return segments[1] === session.operatorId
      ? { allowed: true }
      : denied(403, 'Forbidden');
  }

  // Deny by default: adding a Lambda route does not implicitly expose it to an
  // authenticated operator. Its ownership policy must be added here first.
  return denied(403, 'Forbidden');
}
