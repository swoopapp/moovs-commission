import { Hono } from 'hono';
import type { Context } from 'hono';
import type { PoolClient } from 'pg';
import { appQuery, getAppPool } from '../appDb.js';
import { audit, lockOperatorMapping } from '../workflowContext.js';
import {
  LifecycleRefusal,
  archiveAgency,
  issueAgencyLink,
  issueAgentLink,
  readAgencyLifecycle,
  restoreAgency,
} from '../agencyLifecycle.js';

/**
 * Archive, restore and partner-link issue for the legacy app. The transactional body is agencyLifecycle.ts,
 * a byte copy of the native helper. No reply here ever carries a token, hash or URL.
 */
const app = new Hono();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const MAX_BODY_BYTES = 4096;
type Code =
  | 'INVALID_INPUT'
  | 'RESOURCE_UNAVAILABLE'
  | 'STALE_FACTS'
  | 'OBLIGATIONS_OPEN'
  | 'CONFLICT'
  | 'NOT_READY';
const STATUS: Record<Code, 400 | 404 | 409 | 503> = {
  INVALID_INPUT: 400,
  RESOURCE_UNAVAILABLE: 404,
  STALE_FACTS: 409,
  OBLIGATIONS_OPEN: 409,
  CONFLICT: 409,
  NOT_READY: 503,
};
const reply = (c: Context, body: unknown, status: 200 | 400 | 404 | 409 | 503 = 200) => {
  c.header('Cache-Control', 'private, no-store, max-age=0');
  return c.json(body as any, status);
};
const refused = (c: Context, code: Code) =>
  reply(c, { kind: 'refused', code }, STATUS[code]);
const uuid = (value: unknown) =>
  typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
const revision = (value: unknown) =>
  typeof value === 'string' && REVISION.test(value) ? value : null;
const reason = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= 2000 &&
  value.trim().length >= 3
    ? value
    : null;
const codeOf = (error: unknown): Code =>
  error instanceof LifecycleRefusal ? error.code : 'RESOURCE_UNAVAILABLE';
// Database error text can quote row values, so only the SQLSTATE is logged.
const logFailure = (where: string, error: unknown) => {
  if (!(error instanceof LifecycleRefusal))
    console.error(`Agency lifecycle ${where} failed`, (error as any)?.code ?? 'unknown');
};

/** Exact keys only: a missing or extra key (credentials included) is refused before any database call. */
async function exactBody(c: Context, keys: string[]) {
  const raw = await c.req.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const found = Object.keys(body);
  if (found.length !== keys.length || keys.some((key) => !Object.hasOwn(body as object, key)))
    return null;
  return body as Record<string, unknown>;
}

/**
 * One attempt, never a retry. Once COMMIT has been sent its outcome is the only thing unknown, so a failure
 * there is reported as unconfirmed and never as a rollback.
 */
async function transact(
  c: Context,
  operatorId: string,
  work: (client: PoolClient, actor: string) => Promise<unknown>,
) {
  let client: PoolClient;
  try {
    client = await (await getAppPool()).connect();
  } catch {
    return refused(c, 'NOT_READY');
  }
  let began = false,
    commitSent = false,
    destroy = false;
  try {
    await client.query('BEGIN');
    began = true;
    // Fail closed rather than queue behind a long money write; same bound as the native command pool.
    await client.query("SET LOCAL lock_timeout = '5s'");
    const operator = await lockOperatorMapping(client, 'operator', operatorId, 'UPDATE');
    if (operator.status !== 'active') throw new LifecycleRefusal('RESOURCE_UNAVAILABLE');
    const result = await work(client, c.req.header('x-workflow-actor') || 'admin');
    commitSent = true;
    await client.query('COMMIT');
    return reply(c, { kind: 'committed', result });
  } catch (error) {
    logFailure(commitSent ? 'commit' : 'transaction', error);
    if (commitSent) {
      destroy = true;
      return reply(c, { kind: 'unconfirmed', code: 'OUTCOME_UNCONFIRMED' }, 503);
    }
    // COMMIT was never sent, so nothing can persist even if this rollback is lost with the connection.
    await client.query('ROLLBACK').catch(() => {
      destroy = true;
    });
    return refused(c, began ? codeOf(error) : 'NOT_READY');
  } finally {
    client.release(destroy);
  }
}
const details = { identity_verified: false, source: 'legacy-api' };

app.get('/agencies/:id/lifecycle', async (c) => {
  const agencyId = uuid(c.req.param('id')),
    operatorId = uuid(c.req.query('operator_id'));
  if (!agencyId || !operatorId) return refused(c, 'INVALID_INPUT');
  try {
    const data = await readAgencyLifecycle(
      (sql, params) => appQuery(sql, params),
      agencyId,
      operatorId,
    );
    return reply(c, { kind: 'advice', data });
  } catch (error) {
    logFailure('read', error);
    return refused(c, error instanceof LifecycleRefusal ? error.code : 'NOT_READY');
  }
});

app.post('/agencies/:id/archive', async (c) => {
  const b = await exactBody(c, ['operator_id', 'expected_status', 'expected_revision', 'reason']);
  const agencyId = uuid(c.req.param('id')),
    operatorId = uuid(b?.operator_id),
    expectedRevision = revision(b?.expected_revision),
    why = reason(b?.reason),
    expectedStatus = b?.expected_status;
  if (
    !agencyId ||
    !operatorId ||
    !expectedRevision ||
    !why ||
    (expectedStatus !== 'active' && expectedStatus !== 'suspended')
  )
    return refused(c, 'INVALID_INPUT');
  return transact(c, operatorId, (client, actor) =>
    archiveAgency(
      client,
      { agencyId, commissionOperatorId: operatorId, actor, details, expectedStatus, expectedRevision, reason: why },
      audit,
    ),
  );
});

app.post('/agencies/:id/restore', async (c) => {
  const b = await exactBody(c, ['operator_id', 'expected_revision', 'reason']);
  const agencyId = uuid(c.req.param('id')),
    operatorId = uuid(b?.operator_id),
    expectedRevision = revision(b?.expected_revision),
    why = reason(b?.reason);
  if (!agencyId || !operatorId || !expectedRevision || !why)
    return refused(c, 'INVALID_INPUT');
  return transact(c, operatorId, (client, actor) =>
    restoreAgency(
      client,
      { agencyId, commissionOperatorId: operatorId, actor, details, expectedRevision, reason: why },
      audit,
    ),
  );
});

app.post('/agencies/:id/issue-link', async (c) => {
  const b = await exactBody(c, ['operator_id', 'expected_revision']);
  const agencyId = uuid(c.req.param('id')),
    operatorId = uuid(b?.operator_id),
    expectedRevision = revision(b?.expected_revision);
  if (!agencyId || !operatorId || !expectedRevision) return refused(c, 'INVALID_INPUT');
  return transact(c, operatorId, (client, actor) =>
    issueAgencyLink(
      client,
      { agencyId, commissionOperatorId: operatorId, actor, details, expectedRevision },
      audit,
    ),
  );
});

app.post('/agencies/:id/issue-agent-link', async (c) => {
  const b = await exactBody(c, ['operator_id', 'agent_id', 'expected_revision']);
  const agencyId = uuid(c.req.param('id')),
    operatorId = uuid(b?.operator_id),
    agentId = uuid(b?.agent_id),
    expectedRevision = revision(b?.expected_revision);
  if (!agencyId || !operatorId || !agentId || !expectedRevision)
    return refused(c, 'INVALID_INPUT');
  return transact(c, operatorId, (client, actor) =>
    issueAgentLink(
      client,
      { agencyId, commissionOperatorId: operatorId, actor, details, agentId, expectedRevision },
      audit,
    ),
  );
});

export default app;
