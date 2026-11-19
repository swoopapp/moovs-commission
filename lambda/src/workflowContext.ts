import type { PoolClient } from 'pg';
import { fetchAuthoritativeReservations } from './moovsReservationFacts.js';
import { getAppPool } from './appDb.js';
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

/** A refusal a route answers as is. Thrown inside a transaction so the caller rolls back first. */
export class RouteRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly body: Record<string, unknown>,
  ) {
    super('Request refused');
  }
}
export const AGENCY_ARCHIVED = {
  error: 'Agency is archived. Restore it before making changes.',
  code: 'AGENCY_ARCHIVED',
} as const;
export class AgencyArchivedError extends RouteRefusal {
  constructor() {
    super(409, AGENCY_ARCHIVED);
  }
}
/** One transaction on the app pool. Rolls back on any throw and rethrows it. */
export async function appTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getAppPool()).connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
const OPERATOR_LOCK_SQL = {
  operator: 'SELECT co.id,co.status FROM commission_operators co WHERE co.id=$1',
  agency:
    'SELECT co.id,co.status FROM commission_operators co JOIN agencies x ON x.operator_id=co.id WHERE x.id=$1',
  agent:
    'SELECT co.id,co.status FROM commission_operators co JOIN agencies a ON a.operator_id=co.id JOIN agents x ON x.agency_id=a.id WHERE x.id=$1',
  payout:
    'SELECT co.id,co.status FROM commission_operators co JOIN payouts x ON x.operator_id=co.id WHERE x.id=$1',
} as const;
/**
 * First lock of every agency or money write: the operator row, found from the row being changed.
 * Archive/restore/link-issue hold it FOR UPDATE; everyone else FOR SHARE. Only the operator row is locked here.
 */
export async function lockOperatorMapping(
  client: PoolClient,
  by: keyof typeof OPERATOR_LOCK_SQL,
  id: string,
  mode: 'SHARE' | 'UPDATE' = 'SHARE',
  operatorId?: string,
): Promise<{ id: string; status: string }> {
  const row = (
    await client.query(
      `${OPERATOR_LOCK_SQL[by]}${operatorId ? ' AND co.id=$2' : ''} FOR ${mode} OF co`,
      operatorId ? [id, operatorId] : [id],
    )
  ).rows[0];
  if (!row) throw new RouteRefusal(404, { error: 'Not found' });
  return row;
}
/** Agency row lock, taken after the operator lock. An archived agency accepts no edit and no new obligation. */
export async function lockLiveAgency(
  client: PoolClient,
  agencyId: string,
  mode: 'SHARE' | 'UPDATE' = 'SHARE',
) {
  const row = (
    await client.query(`SELECT * FROM agencies WHERE id=$1 FOR ${mode}`, [
      agencyId,
    ])
  ).rows[0];
  if (!row) throw new RouteRefusal(404, { error: 'Not found' });
  if (row.status === 'archived') throw new AgencyArchivedError();
  return row;
}
