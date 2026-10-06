import { fetchFinancePeriod } from '../src/services/financeReservationService';
import { fetchWorkflowsForAgencies } from '../src/services/workflowService';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  reconcileBookings,
  lifecycleTotals,
} from '../src/lib/finance-reconciliation';
import { commissionFingerprint } from '../src/lib/commission-workflow';
import { fetchFinanceWorkspace } from '../src/services/financeWorkspaceService';
import { publicStatement, agentStatements } from '../src/lib/partner-scope';
import {
  statementCsv,
  statementText,
  statementPdf,
} from '../src/lib/statement-export';
import {
  demoAgencies,
  demoAgents,
  demoReservations,
  demoAttributions,
  demoOperatorConfig,
} from '../src/demoData';
import type {
  Reservation,
  Payout,
  ReservationAttribution,
} from '../src/types/commission';
let count = 0;
const eq = (a: unknown, b: unknown) => {
  count++;
  assert.deepEqual(a, b);
};
const agency = {
  ...demoAgencies[0],
  status: 'active' as const,
  commission_type: 'percent' as const,
  commission_base: 'total_amount' as const,
  commission_rate: 10,
  rate_mode: 'fixed' as const,
  commission_rules: [],
};
const agents = demoAgents.filter((a) => a.agency_id === agency.id),
  agent = agents[0];
const base: Reservation = {
  ...demoReservations[0],
  id: 'r',
  moovs_trip_id: 't',
  source: 'trip',
  trip_type: 'one_way',
  travel_day: '2026-09-30',
  pickup_date: '2026-09-30T23:59:00Z',
  trip_status: 'completed',
  total_amount: 100,
  total_with_gratuity: 100,
  base_rate_amount: 100,
  refund_amount: 0,
  booking_contact_id: agent.moovs_contact_id,
  booking_contact_email: agent.email,
  booking_timezone: 'America/Chicago',
  fact_origin: 'live',
};
const approval = (r: Reservation) => ({
  agency_id: agency.id,
  moovs_trip_id: r.moovs_trip_id,
  status: 'approved' as const,
  fingerprint: commissionFingerprint(r, agency, agent.id),
  reason: 'Verified',
  actor: 'qa',
  updated_at: '2026-10-01T00:00:00Z',
  expected_payment_date: null,
});
const workflow = {
  reviews: [approval(base)],
  questions: [],
  events: [],
  adjustments: [],
};
const w = { agency, agents, workflow, workflowAvailable: true };
const rows = reconcileBookings([base, base], [w], [], [], []);
eq(rows.length, 1);
eq(rows[0].state, 'approved');
eq(lifecycleTotals(rows).approved, 10);
eq(
  reconcileBookings([{ ...base, total_amount: 200 }], [w], [], [], [])[0].state,
  'needs-recheck',
);
eq(
  reconcileBookings([{ ...base, fact_origin: 'snapshot' }], [w], [], [], [])[0]
    .state,
  'unavailable',
);
eq(
  lifecycleTotals(
    reconcileBookings([{ ...base, fact_origin: 'snapshot' }], [w], [], [], []),
  ).approved,
  0,
);
eq(
  reconcileBookings([base], [{ ...w, workflowAvailable: false }], [], [], [])[0]
    .state,
  'unavailable',
);
eq(
  reconcileBookings(
    [base],
    [w, { ...w, agency: { ...agency, id: 'other' } }],
    [],
    [],
    [],
  )[0].state,
  'ambiguous',
);
eq(
  lifecycleTotals(
    reconcileBookings(
      [base],
      [w, { ...w, agency: { ...agency, id: 'other' } }],
      [],
      [],
      [],
    ),
  ).calculated,
  0,
);
eq(
  reconcileBookings(
    [{ ...base, client_keys: ['company:none'], moovs_company_id: 'none' }],
    [w],
    [],
    [],
    [],
  )[0].state,
  'outside-program',
);
const line = {
  moovs_trip_id: 't',
  order_number: 'QA',
  pickup_date: base.pickup_date,
  travel_day: base.travel_day,
  passenger_name: 'Traveler',
  booking_contact_name: 'Agent',
  agent_id: agent.id,
  commission_rate: 5,
  commission_type: 'percent',
  commission_base: 'total_amount',
  base_amount: 100,
  gross: 100,
  commission_amount: 5,
  rule_source: 'Historical agreement',
};
const paid = {
  id: 'p',
  agency_id: agency.id,
  operator_id: base.operator_id,
  status: 'paid',
  statement_snapshot: {
    version: 1,
    agency_name: agency.name,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    lines: [line],
    adjustments: -2,
    total: 3,
    adjustment_reason: 'Private',
    adjustment_lines: [
      {
        id: 'correction',
        source_payout_id: 'original',
        moovs_trip_id: 't',
        amount: -2,
        reason: 'Private operator reason',
      },
    ],
  },
  net_payout: 3,
  adjustments: -2,
  total_trips: 1,
  total_revenue: 100,
  total_commission: 5,
  method: 'Other',
  reference_number: 'private-ref',
  notes: 'Private notes',
  date_paid: '2026-10-01',
  created_at: '',
  updated_at: '',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
} as Payout;
const links = [
  { id: 'l', payout_id: 'p', reservation_id: 'r', created_at: '' },
];
mkdirSync('output/qa', { recursive: true });
writeFileSync('output/qa/finance-correction-statement.pdf', statementPdf(paid));
writeFileSync(
  'output/qa/finance-public-statement.pdf',
  statementPdf(publicStatement(paid)),
);
eq(new TextDecoder().decode(statementPdf(paid)).startsWith('%PDF-1.4'), true);
const settled = reconcileBookings(
  [{ ...base, total_amount: 900 }],
  [w],
  [paid],
  links,
  [],
);
eq(settled[0].state, 'paid');
eq(settled[0].attribution?.commission_amount, 5);
eq(lifecycleTotals(settled).paid, 5);
eq(lifecycleTotals(settled).approved, 0);
eq(
  reconcileBookings([base], [w], [{ ...paid, status: 'draft' }], links, [])[0]
    .state,
  'prepared',
);
eq(
  reconcileBookings([base], [w], [{ ...paid, status: 'void' }], links, [])[0]
    .state,
  'approved',
);
eq(
  reconcileBookings(
    [base],
    [w],
    [{ ...paid, statement_snapshot: null }],
    links,
    [],
  )[0].attribution,
  null,
);
eq(
  lifecycleTotals(
    reconcileBookings(
      [base],
      [w],
      [{ ...paid, statement_snapshot: null }],
      links,
      [],
    ),
  ).unknownBookings,
  1,
);
eq(
  reconcileBookings(
    [base],
    [w],
    [paid, { ...paid, id: 'p2' }],
    [...links, { ...links[0], payout_id: 'p2' }],
    [],
  )[0].state,
  'ambiguous',
);
eq(
  publicStatement(paid).statement_snapshot?.adjustment_lines?.[0].reason,
  null,
);
eq(
  agentStatements([paid], agent.id)[0].statement_snapshot?.adjustment_lines,
  [],
);
eq(agentStatements([paid], agent.id)[0].net_payout, 5);
eq(
  statementText(paid).some((s) => s.includes('Original statement original')),
  true,
);
eq(statementCsv(paid).includes('Private operator reason'), true);
eq(
  statementCsv(publicStatement(paid)).includes('Private operator reason'),
  false,
);
const meta = {
  fetched_at: new Date().toISOString(),
  time_zone: 'America/Chicago',
  source: 'Synthetic test',
  complete: true,
};
const deps = {
  fetchReservations: async () => [base],
  fetchPayoutsByOperator: async () => [],
  fetchAttributionsByOperator: async () => [],
  fetchAgentsByOperator: async () => agents,
  fetchWorkflowsForAgencies: async () => ({ [agency.id]: workflow }),
  fetchLiveReservationPage: async () => ({
    reservations: [base],
    metadata: meta,
    total: 1,
  }),
  fetchPayoutReservationsByPayouts: async () => [],
  fetchReservationsByIds: async () => [],
  fetchFacts: async () => [],
};

// 69-agency regression: bounded provider batches, strict completeness, no serial wait for Moovs.
const largeIds = Array.from(
  { length: 69 },
  (_, i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
);
const originalFetch = globalThis.fetch;
let batchCalls = 0;
globalThis.fetch = (async (url: any) => {
  batchCalls++;
  const ids = new URL(String(url), 'https://qa.invalid').searchParams
    .get('agency_ids')!
    .split(',');
  eq(encodeURIComponent(ids.join(',')).length <= 950, true);
  return new Response(
    JSON.stringify(
      Object.fromEntries(
        ids.map((id) => [
          id,
          { reviews: [], events: [], questions: [], adjustments: [] },
        ]),
      ),
    ),
  );
}) as typeof fetch;
const batches = await fetchWorkflowsForAgencies(largeIds);
eq(Object.keys(batches).length, 69);
eq(batchCalls, 3);
globalThis.fetch = (async () => new Response('{}')) as typeof fetch;
let incompleteRejected = false;
try {
  await fetchWorkflowsForAgencies(largeIds.slice(0, 1));
} catch {
  incompleteRejected = true;
}
eq(incompleteRejected, true);

// Fixed-manifest finance reads enrich each identity once, preserve missing prices/cancellations,
// and reject changed/missing/cross-operator facts instead of silently displaying partial totals.
const qaOperator = 'qa-real-operator';
const identities = largeIds.map((id) => ({
  moovs_trip_id: id,
  travel_day: '2026-09-15',
  source: 'trip',
}));
const manifest = {
  total: identities.length,
  max_records: 25000,
  identities,
  metadata: meta,
};
const manifestFacts = identities.map((identity) => ({
  ...base,
  ...identity,
  operator_id: qaOperator,
  booking_timezone: meta.time_zone,
  facts_fetched_at: meta.fetched_at,
  refund_amount: null,
  trip_status: 'cancelled',
}));
let periodCalls = 0;
function periodMock(m: any, facts: any[]) {
  globalThis.fetch = (async (url: any, init: any) => {
    periodCalls++;
    if (String(url).endsWith('/workflow/period'))
      return new Response(JSON.stringify(m));
    const body = JSON.parse(init.body);
    eq(body.include_cancelled, true);
    return new Response(
      JSON.stringify(
        facts.filter((f) => body.trip_ids.includes(f.moovs_trip_id)),
      ),
    );
  }) as typeof fetch;
}
periodMock(manifest, manifestFacts);
const period = await fetchFinancePeriod(qaOperator, 'source-qa', {
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
});
eq(period.total, 69);
eq(period.reservations.length, 69);
eq(periodCalls, 2);
eq(
  period.reservations.every(
    (r) => r.refund_amount === null && r.trip_status === 'cancelled',
  ),
  true,
);
async function rejectsPeriod(m: any, f: any[]) {
  periodMock(m, f);
  let rejected = false;
  try {
    await fetchFinancePeriod(qaOperator, 'source-qa', {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
  } catch {
    rejected = true;
  }
  eq(rejected, true);
}
await rejectsPeriod({ ...manifest, total: 70 }, manifestFacts);
await rejectsPeriod(
  { ...manifest, metadata: { ...meta, complete: false } },
  manifestFacts,
);
await rejectsPeriod(
  { ...manifest, identities: [identities[0], ...identities.slice(0, -1)] },
  manifestFacts,
);
await rejectsPeriod(
  { ...manifest, metadata: { ...meta, fetched_at: '2026-10-01T12:00:00' } },
  manifestFacts,
);
await rejectsPeriod(manifest, manifestFacts.slice(1));
await rejectsPeriod(
  manifest,
  manifestFacts.map((f, i) =>
    i === 0 ? { ...f, travel_day: '2026-09-16' } : f,
  ),
);
await rejectsPeriod(
  manifest,
  manifestFacts.map((f, i) => (i === 0 ? { ...f, operator_id: 'foreign' } : f)),
);
await rejectsPeriod(
  manifest,
  manifestFacts.map((f, i) =>
    i === 0 ? { ...f, booking_timezone: 'UTC' } : f,
  ),
);
await rejectsPeriod(
  manifest,
  manifestFacts.map((f, i) =>
    i === 0 ? { ...f, facts_fetched_at: 'invalid' } : f,
  ),
);

const largeManifestIdentities = Array.from({ length: 1001 }, (_, i) => ({
  ...identities[0],
  moovs_trip_id: '10000000-0000-4000-8000-' + String(i).padStart(12, '0'),
}));
const largeManifestFacts = largeManifestIdentities.map((i) => ({
  ...manifestFacts[0],
  ...i,
}));
const largeManifest = {
  ...manifest,
  total: 1001,
  identities: largeManifestIdentities,
};
periodCalls = 0;
periodMock(largeManifest, largeManifestFacts);
eq(
  (
    await fetchFinancePeriod(qaOperator, 'source-qa', {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    })
  ).reservations.length,
  1001,
);
eq(periodCalls, 4);
await rejectsPeriod(largeManifest, largeManifestFacts.slice(1));
await rejectsPeriod(largeManifest, [
  largeManifestFacts[1],
  ...largeManifestFacts.slice(1),
]);
let failedChunkCalls = 0;
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).endsWith('/workflow/period'))
    return new Response(JSON.stringify(largeManifest));
  failedChunkCalls++;
  const body = JSON.parse(init.body);
  if (body.trip_ids.includes(largeManifestFacts[0].moovs_trip_id))
    return new Response('{}', { status: 503 });
  return new Response(
    JSON.stringify(
      largeManifestFacts.filter((f) => body.trip_ids.includes(f.moovs_trip_id)),
    ),
  );
}) as typeof fetch;
let chunkFailed = false;
try {
  await fetchFinancePeriod(qaOperator, 'source-qa', {
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });
} catch {
  chunkFailed = true;
}
eq(chunkFailed, true);
eq(failedChunkCalls <= 3, true);
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).endsWith('/workflow/period'))
    return new Response(JSON.stringify(largeManifest));
  const body = JSON.parse(init.body);
  const facts = largeManifestFacts.filter((f) =>
    body.trip_ids.includes(f.moovs_trip_id),
  );
  if (body.trip_ids.includes(largeManifestFacts[0].moovs_trip_id))
    facts[0] = largeManifestFacts[1000];
  return new Response(JSON.stringify(facts));
}) as typeof fetch;
let wrongChunkFailed = false;
try {
  await fetchFinancePeriod(qaOperator, 'source-qa', {
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });
} catch {
  wrongChunkFailed = true;
}
eq(wrongChunkFailed, true);
globalThis.fetch = originalFetch;
let releaseApp!: (value: any[]) => void;
const heldAgents = new Promise<any[]>((resolve) => {
  releaseApp = resolve;
});
let sourceStarted = false;
const parallelRead = fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchAgentsByOperator: () => heldAgents,
    fetchLiveReservationPage: async () => {
      sourceStarted = true;
      return { reservations: [base], metadata: meta, total: 1 };
    },
  },
);
await Promise.resolve();
eq(sourceStarted, true);
releaseApp(agents);
eq((await parallelRead).totals.approved, 10);
const ok = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  deps,
);
eq(ok.rows.length, 1);
eq(ok.totals.approved, 10);
eq(ok.health.liveAvailable, true);
eq(ok.health.snapshotOnly, 0);
const unavailable = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async () => {
      throw new Error('Simulated outage');
    },
  },
);
eq(unavailable.health.liveAvailable, false);
eq(unavailable.health.lastSuccessfulRefresh, null);
eq(unavailable.health.snapshotOnly, 1);
eq(unavailable.totals.approved, 0);
const missingMetadata = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async () => ({
      reservations: [base],
      metadata: null as any,
      total: 1,
    }),
  },
);
eq(missingMetadata.health.liveAvailable, false);
const naiveRead = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async () => ({
      reservations: [base],
      total: 1,
      metadata: { ...meta, fetched_at: '2026-10-01T12:00:00' },
    }),
  },
);
eq(naiveRead.health.liveAvailable, false);
const invalidZone = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async () => ({
      reservations: [base],
      total: 1,
      metadata: { ...meta, time_zone: 'Invalid/Timezone' },
    }),
  },
);
eq(invalidZone.health.timeZone, null);
const multiPage = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async (_a, _b, options) => ({
      reservations: [
        options?.offset ? { ...base, id: 'r2', moovs_trip_id: 't2' } : base,
      ],
      total: 2,
      metadata: {
        ...meta,
        complete: !!options?.offset,
        fetched_at: options?.offset
          ? '2026-10-01T12:05:00Z'
          : '2026-10-01T12:00:00Z',
      },
    }),
  },
);
eq(multiPage.health.liveAvailable, true);
eq(multiPage.health.lastSuccessfulRefresh, '2026-10-01T12:00:00Z');
const countChanged = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async () => ({
      reservations: [base],
      metadata: meta,
      total: 2,
    }),
  },
);
eq(countChanged.health.liveAvailable, false);
const duplicatePage = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchLiveReservationPage: async (_a, _b, options) => ({
      reservations: [base],
      metadata: { ...meta, complete: !!options?.offset },
      total: 2,
    }),
  },
);
eq(duplicatePage.health.liveAvailable, false);
const workflowDown = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchWorkflowsForAgencies: async () => {
      throw new Error('Unavailable');
    },
  },
);
eq(workflowDown.health.workflowAvailable, false);
eq(workflowDown.totals.approved, 0);
const older = {
  ...base,
  id: 'old',
  moovs_trip_id: 'old-trip',
  travel_day: '2026-08-31',
  pickup_date: '2026-08-31T23:59:00Z',
};
const carry = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchWorkflowsForAgencies: async () => ({
      [agency.id]: {
        ...workflow,
        reviews: [approval(base), approval(older)],
      },
    }),
    fetchFacts: async () => [older],
  },
);
eq(carry.rows.length, 1);
eq(carry.carryForward.length, 1);
eq(carry.carryForward[0].state, 'approved');
const lost = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchWorkflowsForAgencies: async () => ({
      [agency.id]: {
        ...workflow,
        reviews: [approval(base), approval(older)],
      },
    }),
    fetchFacts: async () => {
      throw new Error('Unavailable');
    },
  },
);
eq(lost.health.carryAvailable, false);
eq(lost.carryForward[0].state, 'unavailable');
const ledger = await fetchFinanceWorkspace(
  demoOperatorConfig,
  [agency],
  '2026-09-01',
  '2026-09-30',
  {
    ...deps,
    fetchWorkflowsForAgencies: async () => ({
      [agency.id]: {
        ...workflow,
        adjustments: [
          { id: 'x', amount: -5, applied_payout_id: null, cancelled_at: null },
          { id: 'y', amount: 10, applied_payout_id: 'p', cancelled_at: null },
          { id: 'z', amount: 20, applied_payout_id: null, cancelled_at: 'now' },
        ] as any,
      },
    }),
  },
);
eq(ledger.pendingAdjustments, -5);
const syntheticPeriod = await fetchFinanceWorkspace(
  demoOperatorConfig,
  demoAgencies,
  new Date(new Date(demoReservations[0].travel_day! + 'T00:00:00Z').getTime())
    .toISOString()
    .slice(0, 7) + '-01',
  demoReservations[0].travel_day!,
);
eq(syntheticPeriod.rows.length, 36);
eq(
  syntheticPeriod.carryForward.some(
    (r) => r.reservation.order_number === 'ORD-CARRY' && r.state === 'approved',
  ),
  true,
);
// The four features must actually be connected, not merely defined in unused components.
eq(
  readFileSync('src/components/dashboard/DashboardView.tsx', 'utf8').includes(
    'finance={stats.finance}',
  ),
  true,
);
const bench = readFileSync(
  'src/components/commissions/CommissionWorkbench.tsx',
  'utf8',
);
for (const name of [
  'fetchFinanceWorkspace',
  'DataHealth',
  'ReconciliationPanel',
  'CommissionAdjustments',
  'adjustment_ids',
  'include_carry_forward',
])
  eq(bench.includes(name), true);
console.log(
  `Finance lifecycle, reconciliation, health and correction verification passed (${count} assertions). No provider calls.`,
);
