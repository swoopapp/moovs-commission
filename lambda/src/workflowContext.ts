import type { PoolClient } from 'pg';
import { fetchAuthoritativeReservations } from './moovsReservationFacts.js';
export async function loadAgencyContext(
  client: PoolClient,
  agencyId: string,
  operatorId?: string,
) {
  const result = await client.query(
    `SELECT a.*, co.moovs_operator_id, co.route_rate_config,
    ARRAY(SELECT acl.client_key FROM agency_client_links acl WHERE acl.agency_id=a.id) AS linked_keys
    FROM agencies a JOIN commission_operators co ON co.id=a.operator_id
    WHERE a.id=$1 ${operatorId ? 'AND a.operator_id=$2' : ''} FOR SHARE OF a`,
    operatorId ? [agencyId, operatorId] : [agencyId],
  );
  const a = result.rows[0];
  if (!a) throw new Error('Agency not found in operator scope');
  const keys = [
    ...new Set([
      ...(a.linked_keys ?? []),
      ...(a.moovs_company_id ? [`company:${a.moovs_company_id}`] : []),
    ]),
  ];
  a.client_links = keys.map((client_key) => ({ client_key }));
  const agents = (
    await client.query('SELECT * FROM agents WHERE agency_id=$1', [agencyId])
  ).rows;
  return { agency: a, agents, config: a.route_rate_config ?? null };
}
export async function agencyTrip(
  client: PoolClient,
  agencyId: string,
  tripId: string,
  operatorId?: string,
) {
  const ctx = await loadAgencyContext(client, agencyId, operatorId);
  const rows = await fetchAuthoritativeReservations(
    ctx.agency.operator_id,
    ctx.agency.moovs_operator_id,
    [tripId],
  );
  const fact = rows[0];
  if (
    !fact ||
    !ctx.agency.client_links.some((link: any) =>
      fact.client_keys.includes(link.client_key),
    )
  )
    throw new Error('Booking not found in agency scope');
  await assertUnambiguousAgency(
    client,
    ctx.agency.operator_id,
    agencyId,
    fact.client_keys,
  );
  return {
    ...ctx,
    reservation: {
      ...fact,
      id: `live:${ctx.agency.operator_id}:${tripId}`,
      synced_at: new Date().toISOString(),
    },
  };
}
export async function audit(
  client: PoolClient,
  agencyId: string,
  tripId: string | null,
  action: string,
  actor: string,
  reason: string,
  details: unknown = {},
) {
  await client.query(
    'INSERT INTO commission_workflow_events(agency_id,moovs_trip_id,action,actor,reason,details) VALUES($1,$2,$3,$4,$5,$6)',
    [agencyId, tripId, action, actor, reason, JSON.stringify(details)],
  );
}

export async function assertUnambiguousAgency(
  client: PoolClient,
  operatorId: string,
  agencyId: string,
  keys: string[],
) {
  const matches = await client.query(
    `SELECT DISTINCT a.id FROM agencies a LEFT JOIN agency_client_links acl ON acl.agency_id=a.id WHERE a.operator_id=$1 AND a.status='active' AND (acl.client_key=ANY($2::text[]) OR ('company:' || a.moovs_company_id)=ANY($2::text[]))`,
    [operatorId, keys],
  );
  if (matches.rows.length !== 1 || matches.rows[0].id !== agencyId)
    throw new Error(
      'Booking matches multiple active agencies; repair agency mapping first.',
    );
}
