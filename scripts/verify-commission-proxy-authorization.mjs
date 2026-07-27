import assert from 'node:assert/strict';
import { authorizeOperatorProxyRequest } from '../src/lib/commission-proxy-authorization.ts';

const session = { operatorId: 'operator-a', moovsOperatorId: 'moovs-a' };
const ownership = [
  { resource: 'agency', id: 'agency-a', operator_id: 'operator-a', agency_id: 'agency-a' },
  { resource: 'agency', id: 'agency-b', operator_id: 'operator-b', agency_id: 'agency-b' },
  { resource: 'agent', id: 'agent-a', operator_id: 'operator-a', agency_id: 'agency-a' },
  { resource: 'agent', id: 'agent-other-agency', operator_id: 'operator-a', agency_id: 'agency-c' },
  { resource: 'agent', id: 'agent-b', operator_id: 'operator-b', agency_id: 'agency-b' },
  { resource: 'reservation', id: 'reservation-a', operator_id: 'operator-a', agency_id: null },
  { resource: 'reservation', id: 'reservation-b', operator_id: 'operator-b', agency_id: null },
  { resource: 'payout', id: 'payout-a', operator_id: 'operator-a', agency_id: 'agency-a' },
  { resource: 'payout', id: 'payout-b', operator_id: 'operator-b', agency_id: 'agency-b' },
];

async function lookupOwnership(request) {
  const requested = new Map([
    ['agency', new Set(request.agencies ?? [])],
    ['agent', new Set(request.agents ?? [])],
    ['reservation', new Set(request.reservations ?? [])],
    ['payout', new Set(request.payouts ?? [])],
  ]);
  return ownership.filter((record) => requested.get(record.resource)?.has(record.id));
}

async function authorize(path, method = 'GET', { query = '', body } = {}) {
  return authorizeOperatorProxyRequest({
    path,
    method,
    url: new URL(`https://commission.example/api/commission-api/${path}${query}`),
    session,
    readJson: async () => body,
    lookupOwnership,
  });
}

async function expectAllowed(label, resultPromise) {
  const result = await resultPromise;
  assert.equal(result.allowed, true, `${label}: ${JSON.stringify(result)}`);
}

async function expectDenied(label, status, resultPromise) {
  const result = await resultPromise;
  assert.equal(result.allowed, false, `${label}: unexpectedly allowed`);
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result)}`);
}

await expectAllowed(
  'operator-scoped agency collection',
  authorize('agencies', 'GET', { query: '?operator_id=operator-a' }),
);
await expectDenied(
  'cross-operator agency collection',
  403,
  authorize('agencies', 'GET', { query: '?operator_id=operator-b' }),
);
await expectAllowed('owned ID-addressed agency', authorize('agencies/agency-a'));
await expectDenied('cross-operator ID-addressed agency', 403, authorize('agencies/agency-b'));
await expectDenied('agency mutation wrong method', 405, authorize('agencies/agency-a', 'POST'));

await expectAllowed(
  'owned agency agent collection',
  authorize('agents', 'GET', { query: '?agency_id=agency-a' }),
);
await expectDenied(
  'mixed-operator agency agent collection',
  403,
  authorize('agents', 'GET', { query: '?agency_ids=agency-a,agency-b' }),
);
await expectAllowed(
  'create agent under owned agency',
  authorize('agents', 'POST', { body: { agency_id: 'agency-a' } }),
);
await expectDenied(
  'create agent under foreign agency',
  403,
  authorize('agents', 'POST', { body: { agency_id: 'agency-b' } }),
);
await expectDenied('mutate foreign agent', 403, authorize('agents/agent-b', 'PATCH', { body: {} }));
await expectDenied('operator portal-token lookup', 403, authorize('agents/by-token/secret'));

await expectAllowed(
  'owned reservation ID lookup',
  authorize('commission-reservations/by-ids', 'GET', { query: '?ids=reservation-a' }),
);
await expectDenied(
  'mixed reservation ID lookup',
  403,
  authorize('commission-reservations/by-ids', 'GET', { query: '?ids=reservation-a,reservation-b' }),
);
await expectDenied(
  'unknown reservation ID fails closed',
  403,
  authorize('commission-reservations/by-ids', 'GET', { query: '?ids=missing' }),
);
await expectDenied(
  'legacy snapshot mutation is unavailable to operators',
  403,
  authorize('commission-reservations/upsert', 'POST', {
    body: { operator_id: 'operator-a', moovs_trip_id: 'trip-a' },
  }),
);

await expectAllowed(
  'owned attribution read',
  authorize('attributions', 'GET', { query: '?reservation_ids=reservation-a' }),
);
await expectDenied(
  'cross-operator attribution read',
  403,
  authorize('attributions', 'GET', { query: '?reservation_ids=reservation-b' }),
);
await expectDenied(
  'legacy attribution mutation is unavailable to operators',
  403,
  authorize('attributions', 'POST', { body: {} }),
);

await expectAllowed(
  'owned agency payout read',
  authorize('payouts', 'GET', { query: '?agency_id=agency-a' }),
);
await expectDenied(
  'foreign agency payout read',
  403,
  authorize('payouts', 'GET', { query: '?agency_id=agency-b' }),
);
await expectDenied(
  'owned payout mutation is unavailable to operators',
  403,
  authorize('payouts/payout-a', 'PATCH', { body: {} }),
);
await expectDenied('foreign payout mutation', 403, authorize('payouts/payout-b', 'PATCH', { body: {} }));
await expectDenied(
  'legacy payout create is unavailable to operators',
  403,
  authorize('payouts', 'POST', { body: { operator_id: 'operator-a', agency_id: 'agency-a' } }),
);
await expectDenied(
  'legacy payout link mutation is unavailable to operators',
  403,
  authorize('payout-reservations', 'POST', {
    body: { payout_id: 'payout-a', reservation_ids: ['reservation-a'] },
  }),
);

const atomicBody = {
  idempotency_key: '00000000-0000-4000-8000-000000000000',
  operator_id: 'operator-a',
  agency_id: 'agency-a',
  items: [{
    moovs_trip_id: 'trip-a',
    agent_id: 'agent-a',
  }],
};
await expectAllowed(
  'atomic payout owns operator, agency, nested reservations, and agents',
  authorize('payouts/create-from-trips', 'POST', { body: atomicBody }),
);
await expectDenied(
  'atomic payout rejects foreign top-level operator',
  403,
  authorize('payouts/create-from-trips', 'POST', {
    body: { ...atomicBody, operator_id: 'operator-b' },
  }),
);
await expectDenied(
  'atomic payout rejects missing trip ID',
  400,
  authorize('payouts/create-from-trips', 'POST', {
    body: {
      ...atomicBody,
      items: [{
        agent_id: 'agent-a',
      }],
    },
  }),
);
await expectDenied(
  'atomic payout rejects an agent from another agency',
  403,
  authorize('payouts/create-from-trips', 'POST', {
    body: {
      ...atomicBody,
      items: [{
        ...atomicBody.items[0],
        agent_id: 'agent-other-agency',
      }],
    },
  }),
);

await expectAllowed(
  'Moovs contact lookup uses session Moovs operator',
  authorize('fetch-contacts', 'POST', { body: { operator_id: 'moovs-a' } }),
);
await expectDenied(
  'cross-operator Moovs contact lookup',
  403,
  authorize('fetch-contacts', 'POST', { body: { operator_id: 'moovs-b' } }),
);
await expectDenied('new/unknown routes fail closed', 403, authorize('future-sensitive-route'));

console.log('Commission proxy authorization verification passed (31 assertions).');
