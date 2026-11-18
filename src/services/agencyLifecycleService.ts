import { config } from '../config/env';
import type { LifecycleState } from '../../lambda/src/agencyLifecycle';

export type { LifecycleState };
export type LifecycleAction = 'archive' | 'restore' | 'issue-link' | 'issue-agent-link';
export type LifecycleReply = { kind: 'committed'; result: { agency_id: string; agent_id?: string } }
  | { kind: 'refused'; code: string } | { kind: 'unconfirmed'; code: 'OUTCOME_UNCONFIRMED' };
const REVISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODES = new Set(['INVALID_INPUT', 'RESOURCE_UNAVAILABLE', 'STALE_FACTS', 'OBLIGATIONS_OPEN', 'CONFLICT', 'NOT_READY', 'ACTION_DENIED']);
const COUNTS = ['open_payouts', 'open_adjustments', 'approved_unsettled', 'held_unsettled'] as const;
const invalid = () => new Error('Agency status could not be confirmed. Refresh before trying again.');
function fields(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw invalid();
  return value as Record<string, any>;
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw invalid();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) throw invalid();
      parts.push(value);
    }
    const all = new Uint8Array(length); let offset = 0;
    for (const part of parts) { all.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
  } finally { await reader.cancel().catch(() => {}); }
}
function target(agencyId: string, action: string) {
  if (!UUID.test(agencyId)) throw invalid();
  return `${config.apiBaseUrl}/agencies/${encodeURIComponent(agencyId)}/${action}`;
}
export function projectLifecycleState(raw: unknown, agencyId: string): LifecycleState {
  const data = fields(raw, ['agency_id', 'status', 'revision', 'agency_link', 'agents', 'obligations']);
  if (typeof data.agency_id !== 'string' || data.agency_id.toLowerCase() !== agencyId.toLowerCase()
    || typeof data.status !== 'string' || !data.status || data.status.length > 100
    || typeof data.revision !== 'string' || !REVISION.test(data.revision) || typeof data.agency_link !== 'boolean' || !Array.isArray(data.agents)) throw invalid();
  const obligations = fields(data.obligations, [...COUNTS]);
  if (COUNTS.some(key => !Number.isSafeInteger(obligations[key]) || obligations[key] < 0)) throw invalid();
  const ids = new Set<string>();
  const agents = data.agents.map((rawAgent: unknown) => {
    const agent = fields(rawAgent, ['agent_id', 'status', 'link']);
    if (typeof agent.agent_id !== 'string' || !UUID.test(agent.agent_id) || ids.has(agent.agent_id.toLowerCase())
      || typeof agent.status !== 'string' || !agent.status || agent.status.length > 100 || typeof agent.link !== 'boolean') throw invalid();
    ids.add(agent.agent_id.toLowerCase());
    return { agent_id: agent.agent_id.toLowerCase(), status: agent.status, link: agent.link };
  });
  return { agency_id: data.agency_id.toLowerCase(), status: data.status, revision: data.revision, agency_link: data.agency_link, agents,
    obligations: Object.fromEntries(COUNTS.map(key => [key, obligations[key]])) as LifecycleState['obligations'] };
}
export async function readAgencyLifecycle(agencyId: string, operatorId: string, signal: AbortSignal): Promise<LifecycleState> {
  if (!UUID.test(operatorId)) throw invalid();
  const response = await fetch(`${target(agencyId, 'lifecycle')}?operator_id=${encodeURIComponent(operatorId)}`, { signal, cache: 'no-store', redirect: 'error' });
  const reply = fields(await boundedJson(response), ['kind', 'data']);
  if (!response.ok || reply.kind !== 'advice') throw invalid();
  return projectLifecycleState(reply.data, agencyId);
}
/** A failed send is unknown, never retried; no request body, URL token or server error is logged. */
export async function mutateAgencyLifecycle(agencyId: string, operatorId: string, action: LifecycleAction, input: Record<string, unknown>, signal: AbortSignal): Promise<LifecycleReply> {
  if (!UUID.test(operatorId) || !['archive', 'restore', 'issue-link', 'issue-agent-link'].includes(action)) throw invalid();
  const response = await fetch(target(agencyId, action), { method: 'POST', signal, cache: 'no-store', redirect: 'error',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, operator_id: operatorId }) });
  const raw = await boundedJson(response) as Record<string, unknown>;
  // The authenticated proxy refuses these before forwarding a mutation.
  if ([401, 403, 405].includes(response.status) && typeof raw?.error === 'string' && Object.keys(raw).length === 1) return { kind: 'refused', code: 'ACTION_DENIED' };
  if (raw?.kind === 'committed' && response.ok) {
    const reply = fields(raw, ['kind', 'result']);
    const result = fields(reply.result, action === 'issue-agent-link' ? ['agency_id', 'agent_id'] : ['agency_id']);
    if (typeof result.agency_id !== 'string' || result.agency_id.toLowerCase() !== agencyId.toLowerCase()
      || (action === 'issue-agent-link' && (typeof result.agent_id !== 'string' || result.agent_id.toLowerCase() !== String(input.agent_id).toLowerCase()))) throw invalid();
    return { kind: 'committed', result: { agency_id: result.agency_id.toLowerCase(), ...(action === 'issue-agent-link' ? { agent_id: result.agent_id.toLowerCase() } : {}) } };
  }
  const reply = fields(raw, ['kind', 'code']);
  if (reply.kind === 'refused' && !response.ok && CODES.has(reply.code)) return { kind: 'refused', code: reply.code };
  if (reply.kind === 'unconfirmed' && !response.ok && reply.code === 'OUTCOME_UNCONFIRMED') return { kind: 'unconfirmed', code: 'OUTCOME_UNCONFIRMED' };
  throw invalid();
}
