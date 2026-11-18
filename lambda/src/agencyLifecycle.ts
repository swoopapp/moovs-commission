/**
 * Agency archive, restore and partner link issue: the transactional body only.
 * Deliberately import-free so the legacy service can carry a byte-identical copy. The caller owns BEGIN/COMMIT/ROLLBACK
 * and any operator-level lock; a thrown LifecycleRefusal means this file wrote nothing the caller should keep.
 * No token or hash is ever selected, returned or audited: link presence is a boolean.
 */
export type LifecycleClient = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };
export type LifecycleAudit = (client: any, agencyId: string, tripId: string | null, action: string, actor: string, reason: string, details?: unknown) => Promise<void>;
export type LifecycleCode = 'RESOURCE_UNAVAILABLE' | 'STALE_FACTS' | 'OBLIGATIONS_OPEN' | 'CONFLICT';
export class LifecycleRefusal extends Error {
  constructor(readonly code: LifecycleCode) { super('Agency lifecycle refused'); }
}
export type LifecycleObligations = { open_payouts: number; open_adjustments: number; approved_unsettled: number; held_unsettled: number };
export type LifecycleState = {
  agency_id: string; status: string; revision: string; agency_link: boolean;
  agents: { agent_id: string; status: string; link: boolean }[]; obligations: LifecycleObligations;
};
type Scope = { agencyId: string; commissionOperatorId: string; actor: string; details?: Record<string, unknown> };

/** Exact UTC microseconds as text, so the value never passes through a JavaScript Date. */
export const AGENCY_REVISION_SQL = `to_char(a.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')`;
const PAID_ALLOCATION = `SELECT 1 FROM payout_reservations pr JOIN commission_reservations cr ON cr.id=pr.reservation_id JOIN payouts pp ON pp.id=pr.payout_id WHERE pp.status='paid' AND pp.operator_id=$2 AND cr.operator_id=$2 AND cr.moovs_trip_id=r.moovs_trip_id`;
/**
 * Recorded obligations in ONE statement, so every count shares a snapshot (a concurrent void cannot hide between them).
 * An adjustment is open unless applied to a PAID payout. A review is settled only by a PAID payout holding its trip,
 * matched by operator and trip with no agency filter, exactly as allocation works. Only this operator's payouts can
 * discharge anything, an adjustment only through a payout of its own agency, and a NULL or unknown payout status
 * counts as open. Not a balance: unreviewed bookings are not here.
 */
export const AGENCY_OBLIGATIONS_SQL = `SELECT
 (SELECT count(*) FROM payouts p WHERE p.agency_id=$1 AND p.operator_id=$2 AND p.status IS DISTINCT FROM 'paid' AND p.status IS DISTINCT FROM 'void')::int AS open_payouts,
 (SELECT count(*) FROM commission_adjustments ca WHERE ca.agency_id=$1 AND ca.cancelled_at IS NULL AND NOT EXISTS (SELECT 1 FROM payouts ap WHERE ap.id=ca.applied_payout_id AND ap.operator_id=$2 AND ap.agency_id=ca.agency_id AND ap.status='paid'))::int AS open_adjustments,
 (SELECT count(*) FROM commission_reviews r WHERE r.agency_id=$1 AND r.status='approved' AND NOT EXISTS (${PAID_ALLOCATION}))::int AS approved_unsettled,
 (SELECT count(*) FROM commission_reviews r WHERE r.agency_id=$1 AND r.status='held' AND NOT EXISTS (${PAID_ALLOCATION}))::int AS held_unsettled`;
const AGENCY_SQL = `SELECT a.id,a.operator_id,a.status,a.moovs_company_id,(a.portal_token IS NOT NULL) AS agency_link,${AGENCY_REVISION_SQL} AS revision FROM agencies a WHERE a.id=$1 AND a.operator_id=$2`;
const NEW_TOKEN = `encode(gen_random_bytes(32),'hex')`;

const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const refuse = (code: LifecycleCode): never => { throw new LifecycleRefusal(code); };
const one = (rows: any[], id: string) => (rows.length === 1 && same(rows[0]?.id, id) ? rows[0] : refuse('RESOURCE_UNAVAILABLE'));

function agencyRow(rows: any[], scope: Pick<Scope, 'agencyId' | 'commissionOperatorId'>) {
  const row = one(rows, scope.agencyId);
  if (!same(row.operator_id, scope.commissionOperatorId) || typeof row.status !== 'string' || typeof row.revision !== 'string' || typeof row.agency_link !== 'boolean') refuse('RESOURCE_UNAVAILABLE');
  return row as { id: string; status: string; revision: string; agency_link: boolean; moovs_company_id: string | null };
}
async function obligations(query: LifecycleClient['query'], scope: Pick<Scope, 'agencyId' | 'commissionOperatorId'>): Promise<LifecycleObligations> {
  const row = (await query(AGENCY_OBLIGATIONS_SQL, [scope.agencyId, scope.commissionOperatorId])).rows[0];
  const keys = ['open_payouts', 'open_adjustments', 'approved_unsettled', 'held_unsettled'] as const;
  if (!row || keys.some(key => !Number.isInteger(row[key]) || row[key] < 0)) refuse('RESOURCE_UNAVAILABLE');
  return Object.fromEntries(keys.map(key => [key, row[key]])) as LifecycleObligations;
}
const lockAgency = async (client: LifecycleClient, scope: Scope) => agencyRow((await client.query(`${AGENCY_SQL} FOR UPDATE OF a`, [scope.agencyId, scope.commissionOperatorId])).rows, scope);
/** Agents are always locked after their agency, in id order. */
const lockAgents = async (client: LifecycleClient, agencyId: string) => (await client.query('SELECT id,(portal_token IS NOT NULL) AS link FROM agents WHERE agency_id=$1 ORDER BY id FOR UPDATE', [agencyId])).rows;
async function setAgency(client: LifecycleClient, scope: Scope, assignments: string) {
  one((await client.query(`UPDATE agencies SET ${assignments},updated_at=now() WHERE id=$1 AND operator_id=$2 RETURNING id`, [scope.agencyId, scope.commissionOperatorId])).rows, scope.agencyId);
}
const clearAgentLinks = (client: LifecycleClient, agencyId: string) => client.query('UPDATE agents SET portal_token=NULL WHERE agency_id=$1 AND portal_token IS NOT NULL', [agencyId]);

/** Current facts for a screen. Takes no locks; it is not a receipt and proves nothing about who changed what. */
export async function readAgencyLifecycle(query: LifecycleClient['query'], agencyId: string, commissionOperatorId: string): Promise<LifecycleState> {
  const scope = { agencyId, commissionOperatorId };
  const agency = agencyRow((await query(AGENCY_SQL, [agencyId, commissionOperatorId])).rows, scope);
  const agents = (await query('SELECT id,agency_id,status,(portal_token IS NOT NULL) AS link FROM agents WHERE agency_id=$1 ORDER BY created_at DESC,id', [agency.id])).rows;
  if (agents.some(row => !same(row.agency_id, agency.id) || typeof row.status !== 'string' || typeof row.link !== 'boolean')) refuse('RESOURCE_UNAVAILABLE');
  return {
    agency_id: agency.id.toLowerCase(), status: agency.status, revision: agency.revision, agency_link: agency.agency_link,
    agents: agents.map(row => ({ agent_id: String(row.id).toLowerCase(), status: row.status, link: row.link })),
    obligations: await obligations(query, scope),
  };
}

/** Soft archive. Refused while any recorded obligation is open; clears the agency link and every agent link. */
export async function archiveAgency(client: LifecycleClient, input: Scope & { expectedStatus: string; expectedRevision: string; reason: string }, audit: LifecycleAudit): Promise<{ agency_id: string }> {
  const agency = await lockAgency(client, input);
  if (agency.status === 'archived' || agency.status !== input.expectedStatus || agency.revision !== input.expectedRevision) refuse('STALE_FACTS');
  const open = await obligations(client.query.bind(client), input);
  if (Object.values(open).some(count => count > 0)) refuse('OBLIGATIONS_OPEN');
  const agents = await lockAgents(client, agency.id);
  await setAgency(client, input, "status='archived',portal_token=NULL");
  await clearAgentLinks(client, agency.id);
  await audit(client, agency.id, null, 'agency.archived', input.actor, input.reason.trim(), {
    ...input.details, before_status: agency.status, agency_link_revoked: agency.agency_link,
    agent_links_revoked: agents.filter(row => row.link === true).length, obligations_checked: 'recorded-only',
  });
  return { agency_id: agency.id.toLowerCase() };
}

/** Back to active. No link is restored: any link still stored is cleared, so earlier links stay dead. */
export async function restoreAgency(client: LifecycleClient, input: Scope & { expectedRevision: string; reason: string }, audit: LifecycleAudit): Promise<{ agency_id: string }> {
  const agency = await lockAgency(client, input);
  if (agency.status !== 'archived' || agency.revision !== input.expectedRevision) refuse('STALE_FACTS');
  const keys = (await client.query('SELECT client_key FROM agency_client_links WHERE agency_id=$1', [agency.id])).rows.map(row => row.client_key);
  if (agency.moovs_company_id) keys.push(`company:${agency.moovs_company_id}`);
  // Two active agencies claiming one client make every shared booking ambiguous and unpayable.
  if (keys.length && (await client.query(
    `SELECT 1 FROM agencies o LEFT JOIN agency_client_links acl ON acl.agency_id=o.id WHERE o.operator_id=$1 AND o.status='active' AND o.id<>$2 AND (acl.client_key=ANY($3::text[]) OR ('company:' || o.moovs_company_id)=ANY($3::text[])) LIMIT 1`,
    [input.commissionOperatorId, agency.id, keys],
  )).rows.length) refuse('CONFLICT');
  const agents = await lockAgents(client, agency.id);
  await setAgency(client, input, "status='active',portal_token=NULL");
  await clearAgentLinks(client, agency.id);
  await audit(client, agency.id, null, 'agency.restored', input.actor, input.reason.trim(), {
    ...input.details, stale_links_cleared: (agency.agency_link ? 1 : 0) + agents.filter(row => row.link === true).length,
  });
  return { agency_id: agency.id.toLowerCase() };
}

/** New agency link; any current one stops working. The revision makes a repeated request a refusal, not a second rotation. */
export async function issueAgencyLink(client: LifecycleClient, input: Scope & { expectedRevision: string }, audit: LifecycleAudit): Promise<{ agency_id: string }> {
  const agency = await lockAgency(client, input);
  if (agency.revision !== input.expectedRevision) refuse('STALE_FACTS');
  if (agency.status === 'archived') refuse('CONFLICT');
  await setAgency(client, input, `portal_token=${NEW_TOKEN}`);
  await audit(client, agency.id, null, 'agency.link-issued', input.actor, 'Partner link issued', { ...input.details, replaced_existing: agency.agency_link });
  return { agency_id: agency.id.toLowerCase() };
}

/** New agent link. Also advances the agency revision, since agents carry no revision of their own. */
export async function issueAgentLink(client: LifecycleClient, input: Scope & { agentId: string; expectedRevision: string }, audit: LifecycleAudit): Promise<{ agency_id: string; agent_id: string }> {
  const agency = await lockAgency(client, input);
  if (agency.revision !== input.expectedRevision) refuse('STALE_FACTS');
  if (agency.status === 'archived') refuse('CONFLICT');
  const agent = one((await client.query('SELECT id,agency_id,status,(portal_token IS NOT NULL) AS link FROM agents WHERE id=$1 AND agency_id=$2 FOR UPDATE', [input.agentId, agency.id])).rows, input.agentId);
  if (!same(agent.agency_id, agency.id)) refuse('RESOURCE_UNAVAILABLE');
  if (agent.status !== 'active') refuse('CONFLICT');
  one((await client.query(`UPDATE agents SET portal_token=${NEW_TOKEN} WHERE id=$1 AND agency_id=$2 RETURNING id`, [input.agentId, agency.id])).rows, input.agentId);
  await setAgency(client, input, 'status=status');
  await audit(client, agency.id, null, 'agent.link-issued', input.actor, 'Partner link issued', { ...input.details, agent_id: String(agent.id).toLowerCase(), replaced_existing: agent.link === true });
  return { agency_id: agency.id.toLowerCase(), agent_id: String(agent.id).toLowerCase() };
}
