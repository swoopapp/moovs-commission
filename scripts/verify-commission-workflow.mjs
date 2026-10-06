import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  globalMoovsId,
  operatorReservationUrl,
} from '../src/lib/moovs-links.ts';
import {
  validateRules,
  applicableRule,
  validDate,
} from '../src/lib/commission-rules.ts';
import {
  agentMatch,
  commissionState,
  commissionFingerprint,
  eligibilityIssues,
  statementLine,
} from '../src/lib/commission-workflow.ts';
import {
  calculateCommission,
  resolveCommissionRate,
} from '../src/lib/commission-calc.ts';
import {
  publicReservation,
  publicStatement,
  agentStatements,
  partnerQuestions,
} from '../src/lib/partner-scope.ts';
import { statementCsv, statementPdf } from '../src/lib/statement-export.ts';
import { authorizeOperatorProxyRequest } from '../src/lib/commission-proxy-authorization.ts';
let count = 0;
const eq = (a, b) => {
  count++;
  assert.deepEqual(a, b);
};
const ok = (a) => {
  count++;
  assert.ok(a);
};
const id = '11111111-1111-4111-8111-111111111111',
  tripId = '22222222-2222-4222-8222-222222222222';
eq(atob(globalMoovsId('Request', id)), `Request:${id}`);
eq(globalMoovsId('Request', '1234'), null);
const r = {
  id: 'r',
  moovs_trip_id: tripId,
  moovs_request_id: id,
  route_public_id: 'private-passenger-link',
  source: 'trip',
  trip_type: 'one_way',
  pickup_date: '2026-09-30T23:59:00.000Z',
  trip_status: 'completed',
  client_keys: ['company:c'],
  booking_contact_id: 'bc',
  booking_contact_email: 'a@example.com',
  passenger_name: 'Traveler',
  booking_contact_name: 'Booking Agent',
  base_rate_amount: 100,
  total_amount: 120,
  total_with_gratuity: 130,
  refund_amount: 0,
};
const agency = {
  id: 'agency-a',
  name: 'Test Agency',
  moovs_company_id: 'c',
  client_links: [{ client_key: 'company:c' }],
  status: 'active',
  commission_type: 'percent',
  commission_base: 'total_amount',
  commission_rate: 10,
  rate_mode: 'fixed',
  commission_rules: [],
};
const agents = [
  {
    id: 'agent-a',
    status: 'active',
    name: 'Agent',
    email: 'a@example.com',
    moovs_contact_id: 'bc',
  },
];
const url = new URL(operatorReservationUrl(r));
eq(url.origin, 'https://operator.moovs.app');
eq(atob(decodeURIComponent(url.pathname.split('/').pop())), `Request:${id}`);
eq(atob(url.searchParams.get('tripId')), `Trip:${tripId}`);
eq(operatorReservationUrl({ ...r, source: 'shuttle' }), null);
eq(operatorReservationUrl({ ...r, moovs_request_id: null }), null);
ok(
  operatorReservationUrl({ ...r, trip_type: 'shuttle' }).includes(
    '/reservations/shuttle/',
  ),
);
eq(validDate('2026-02-30'), false);
eq(validDate('2028-02-29'), true);
const rule = {
  id: 'rule',
  label: 'Private transfer autumn',
  service: 'private-transfer',
  route_id: null,
  rate: 15,
  effective_from: '2026-09-01',
  effective_to: '2026-09-30',
};
eq(validateRules([rule], 'percent'), null);
ok(validateRules([rule, { ...rule, id: 'overlap' }], 'percent'));
ok(validateRules([{ ...rule, rate: 101 }], 'percent'));
eq(validateRules([{ ...rule, rate: 101 }], 'flat'), null);
ok(validateRules([{ ...rule, effective_from: '2026-02-30' }], 'percent'));
ok(validateRules([{ ...rule, route_id: 'route' }], 'percent'));
eq(applicableRule(r, [rule]), rule);
eq(applicableRule({ ...r, pickup_date: '2026-10-01' }, [rule]), null);
eq(applicableRule({ ...r, trip_type: 'hourly' }, [rule]), null);
eq(calculateCommission(r, agency), 12);
eq(calculateCommission(r, { ...agency, commission_rules: [rule] }), 18);
eq(
  calculateCommission(r, {
    ...agency,
    commission_type: 'flat',
    commission_rules: [rule],
  }),
  15,
);
eq(resolveCommissionRate(r, { ...agency, commission_rate: '10' }).rate, 10);
eq(
  resolveCommissionRate(
    { ...r, source: 'shuttle' },
    { ...agency, commission_type: 'flat', rate_mode: 'standard' },
    { default_rate: 55, routes: {} },
  ).rate,
  10,
);
eq(agentMatch(r, agents).agent.id, 'agent-a');
eq(agentMatch({ ...r, booking_contact_id: 'other' }, agents).agent, null);
eq(agentMatch(r, [...agents, { ...agents[0], id: 'duplicate' }]).agent, null);
ok(
  agentMatch({ ...r, booking_contact_id: null }, [
    ...agents,
    { ...agents[0], id: 'duplicate' },
  ]).issue.startsWith('Ambiguous'),
);
eq(eligibilityIssues(r, agency, agents), []);
ok(eligibilityIssues({ ...r, refund_amount: null }, agency, agents).length);
ok(eligibilityIssues({ ...r, refund_amount: 5 }, agency, agents).length);
ok(eligibilityIssues({ ...r, refund_amount: NaN }, agency, agents).length);
ok(
  eligibilityIssues({ ...r, trip_status: 'cancelled' }, agency, agents).length,
);
eq(
  eligibilityIssues(
    { ...r, booking_contact_id: 'unmapped', booking_contact_email: null },
    agency,
    [],
  ),
  [],
);
const fp = commissionFingerprint(r, agency, 'agent-a');
const review = { status: 'approved', fingerprint: fp };
eq(commissionState(r, agency, agents, review), 'approved');
eq(
  commissionState({ ...r, total_amount: 125 }, agency, agents, review),
  'needs-recheck',
);
eq(
  commissionState(r, { ...agency, commission_rules: [rule] }, agents, review),
  'needs-recheck',
);
eq(commissionState(r, agency, agents, { status: 'held' }), 'held');
eq(commissionState(r, agency, agents, review, true), 'settled');
eq(commissionState(r, agency, agents), 'needs-review');
eq(
  commissionState({ ...r, trip_status: 'confirmed' }, agency, agents),
  'projected',
);
eq(
  commissionFingerprint(r, { ...agency, commission_rate: '10' }, 'agent-a'),
  fp,
);
const line = {
  ...statementLine(r, agency, {
    agent_id: 'agent-a',
    commission_rate: 10,
    commission_type: 'percent',
    commission_base: 'total_amount',
    commission_amount: 12,
  }),
  review_fingerprint: 'PRIVATE',
};
const p = {
  id: 'statement-a',
  status: 'draft',
  method: 'Other',
  notes: 'INTERNAL',
  reference_number: 'PRIVATE',
  net_payout: 37,
  total_trips: 2,
  statement_snapshot: {
    version: 1,
    agency_name: 'Agency',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    lines: [line, { ...line, agent_id: 'agent-b', commission_amount: 20 }],
    adjustments: 5,
    adjustment_reason: 'INTERNAL',
    total: 37,
  },
};
eq(publicReservation(r).moovs_request_id, undefined);
eq(publicReservation(r).route_public_id, undefined);
eq(
  publicStatement(p).statement_snapshot.lines[0].review_fingerprint,
  undefined,
);
eq(publicStatement(p).notes, null);
eq(agentStatements([p], 'agent-a')[0].net_payout, 12);
eq(agentStatements([p], 'agent-a')[0].statement_snapshot.lines.length, 1);
eq(agentStatements([p], 'unknown'), []);
eq(
  partnerQuestions(
    [
      { agent_id: 'agent-a', moovs_trip_id: tripId },
      { agent_id: 'agent-b', moovs_trip_id: tripId },
    ],
    new Set([tripId]),
    'agent-a',
  ).length,
  1,
);
ok(
  statementCsv({
    ...p,
    statement_snapshot: {
      ...p.statement_snapshot,
      agency_name: '=HYPERLINK("bad")',
    },
  }).includes("'=HYPERLINK"),
);
assert.throws(() => statementPdf({ ...p, statement_snapshot: null }));
count++;
mkdirSync('output/qa', { recursive: true });
writeFileSync(
  'output/qa/commission-statement-fixture.pdf',
  statementPdf({
    ...p,
    total_trips: 30,
    total_commission: 360,
    net_payout: 365,
    statement_snapshot: {
      ...p.statement_snapshot,
      total: 365,
      lines: Array.from({ length: 30 }, (_, i) => ({
        ...line,
        order_number: `QA-${i + 1}`,
      })),
    },
  }),
);
ok(new TextDecoder().decode(statementPdf(p)).startsWith('%PDF-1.4'));
const lookup = async () => [
  { resource: 'agency', id: 'agency-a', operator_id: 'operator-a' },
  { resource: 'payout', id: 'payout-a', operator_id: 'operator-a' },
];
const auth = async (path, method, body, query = '') =>
  authorizeOperatorProxyRequest({
    path,
    method,
    url: new URL(`https://example.com/${path}${query}`),
    session: { operatorId: 'operator-a', moovsOperatorId: 'moovs-a' },
    readJson: async () => body,
    lookupOwnership: lookup,
  });
for (const path of [
  'workflow/review',
  'workflow/rules',
  'workflow/question-resolution',
  'workflow/correction',
  'workflow/adjustments',
  'workflow/adjustments/correction-id/cancel',
]) {
  eq(
    (
      await auth(path, 'POST', {
        operator_id: 'operator-a',
        agency_id: 'agency-a',
      })
    ).allowed,
    true,
  );
  eq(
    (
      await auth(path, 'POST', {
        operator_id: 'operator-b',
        agency_id: 'agency-a',
      })
    ).allowed,
    false,
  );
}
eq((await auth('workflow', 'GET', null, '?agency_id=agency-a')).allowed, true);
eq((await auth('workflow', 'GET', null, '?agency_id=agency-b')).allowed, false);
eq((await auth('workflow', 'GET', null, '?agency_ids=agency-a')).allowed, true);
eq((await auth('workflow', 'GET', null, '?agency_ids=agency-a,agency-b')).allowed, false);
eq((await auth('workflow', 'GET', null, '?agency_ids=agency-a,missing')).allowed, false);
eq((await auth('workflow', 'GET', null, '?agency_ids=')).allowed, false);
eq((await auth('workflow', 'GET', null, '?agency_ids=agency-a,&agency_id=agency-a')).allowed, false);
eq((await auth('workflow', 'GET', null, '?agency_ids=agency-a&agency_id=agency-a')).allowed, false);
eq((await auth('workflow', 'POST', null, '?agency_ids=agency-a')).allowed, false);

eq(
  (
    await auth('payouts/payout-a/record-payment', 'POST', {
      operator_id: 'operator-a',
    })
  ).allowed,
  true,
);
eq(
  (
    await auth('payouts/payout-b/record-payment', 'POST', {
      operator_id: 'operator-a',
    })
  ).allowed,
  false,
);
eq(
  (await auth('payouts/payout-a/void', 'POST', { operator_id: 'operator-a' }))
    .allowed,
  true,
);
eq(
  (await auth('payouts/payout-b/void', 'POST', { operator_id: 'operator-a' }))
    .allowed,
  false,
);
eq((await auth('internal/partner-question', 'POST', {})).allowed, false);
eq((await auth('workflow/facts','POST',{operator_id:'operator-a'})).allowed,true);
eq((await auth('workflow/facts','POST',{operator_id:'operator-b'})).allowed,false);
eq((await auth('workflow/facts','GET',null)).allowed,false);
eq((await auth('workflow/period','POST',{operator_id:'operator-a'})).allowed,true);
eq((await auth('workflow/period','POST',{operator_id:'operator-b'})).allowed,false);
eq((await auth('workflow/period','GET',null)).allowed,false);

eq((await auth('workflow/adjustments','POST',{operator_id:'operator-a',agency_id:'agency-b'})).allowed,false);
console.log(
  `Commission workflow verification passed (${count} assertions). PDF fixture written to output/qa.`,
);
