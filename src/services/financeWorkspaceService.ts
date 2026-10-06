import type { CommissionOperatorConfig } from '../types/commissionOperator';
import type {
  Agency,
  Reservation,
  Payout,
  PayoutReservation,
} from '../types/commission';
import { config } from '../config/env';
import { getDemoReservations, isDemoOperatorId } from '../demoData';
import {
  fetchReservations,
  fetchReservationsByIds,
} from './reservationService';
import { fetchFinancePeriod } from './financeReservationService';
import { fetchAgentsByOperator } from './agentService';
import { fetchWorkflowsForAgencies, emptyWorkflow } from './workflowService';
import {
  fetchPayoutsByOperator,
  fetchPayoutReservationsByPayouts,
} from './payoutService';
import { fetchAttributionsByOperator } from './attributionService';
import { reservationTravelDay, validTimeZone } from '../lib/operator-time';
import {
  reconcileBookings,
  lifecycleTotals,
  financeAgencyKeys,
  type FinanceAgencyData,
  type ReconciliationRow,
  type LifecycleTotals,
} from '../lib/finance-reconciliation';
export interface FinanceWorkspace {
  rows: ReconciliationRow[];
  carryForward: ReconciliationRow[];
  agencies: FinanceAgencyData[];
  payouts: Payout[];
  totals: LifecycleTotals;
  pendingAdjustments: number;
  health: {
    lastSuccessfulRefresh: string | null;
    attemptedAt: string;
    timeZone: string | null;
    liveAvailable: boolean;
    workflowAvailable: boolean;
    carryAvailable: boolean;
    source: string;
    missingFacts: number;
    snapshotOnly: number;
    warnings: string[];
  };
  from: string;
  to: string;
}
async function fetchFacts(
  operatorId: string,
  tripIds: string[],
): Promise<Reservation[]> {
  if (isDemoOperatorId(operatorId))
    return getDemoReservations().filter((r) =>
      tripIds.includes(r.moovs_trip_id),
    );
  const res = await fetch(`${config.apiBaseUrl}/workflow/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator_id: operatorId, trip_ids: tripIds }),
  });
  if (!res.ok)
    throw new Error(
      'Reviewed carry-forward facts unavailable. Refresh before preparing settlements.',
    );
  return res.json();
}
const defaults = {
  fetchReservations,
  fetchPayoutsByOperator,
  fetchAttributionsByOperator,
  fetchAgentsByOperator,
  fetchWorkflowsForAgencies,
  fetchPayoutReservationsByPayouts,
  fetchReservationsByIds,
  fetchLiveReservationPage: fetchFinancePeriod,
  fetchFacts,
};
/** Dependency seam is for zero-provider local failure/paging tests; production uses the real services. */
export async function fetchFinanceWorkspace(
  operator: CommissionOperatorConfig,
  agencies: Agency[],
  from: string,
  to: string,
  overrides: Partial<typeof defaults> = {},
): Promise<FinanceWorkspace> {
  const api = { ...defaults, ...overrides },
    attemptedAt = new Date().toISOString(),
    warnings: string[] = [];
  const agencyIds = agencies.map((agency) => agency.id);
  // Start independent application reads and source paging together. Attach rejection handling
  // immediately so a failed app read cannot become an unhandled rejection while Moovs is paging.
  const appReads = Promise.all([
    api.fetchReservations(operator.operatorId, { dateFrom: from, dateTo: to }),
    api.fetchPayoutsByOperator(operator.operatorId),
    api.fetchAttributionsByOperator(operator.operatorId),
    api.fetchAgentsByOperator(operator.operatorId, agencyIds),
    api
      .fetchWorkflowsForAgencies(agencyIds)
      .then((workflows) => ({ workflows, available: true }))
      .catch(() => ({
        workflows: {} as Record<
          string,
          import('../types/workflow').WorkflowData
        >,
        available: false,
      })),
  ]).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const live: Reservation[] = [];
  let offset = 0,
    lastSuccessfulRefresh: string | null = null,
    timeZone: string | null = null,
    source = 'Moovs replica',
    liveAvailable = true,
    oldestPageRead: string | null = null,
    expectedTotal: number | null = null;
  try {
    for (;;) {
      const page = await api.fetchLiveReservationPage(
        operator.operatorId,
        operator.moovsOperatorId,
        {
          dateFrom: from,
          dateTo: to,
          includeCancelled: true,
          limit: 250,
          offset,
        },
      );
      if (
        !Number.isInteger(page.total) ||
        page.total < 0 ||
        (expectedTotal !== null && page.total !== expectedTotal)
      )
        throw new Error(
          'Booking count changed while paging. Reload the period.',
        );
      expectedTotal = page.total;
      if (
        !page.metadata?.fetched_at ||
        !Number.isFinite(Date.parse(page.metadata.fetched_at)) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(page.metadata.fetched_at)
      )
        throw new Error(
          'Data-health metadata unavailable; backend release required.',
        );
      if (!page.metadata.complete && !page.reservations.length)
        throw new Error('Incomplete Moovs page. Narrow the period and retry.');
      if (
        page.reservations.some((r) =>
          live.some((old) => old.moovs_trip_id === r.moovs_trip_id),
        )
      )
        throw new Error(
          'Bookings changed while paging. Reload the period for consistent reconciliation.',
        );
      live.push(...page.reservations);
      if (!oldestPageRead || page.metadata.fetched_at < oldestPageRead)
        oldestPageRead = page.metadata.fetched_at;
      timeZone = validTimeZone(page.metadata.time_zone)
        ? page.metadata.time_zone
        : null;
      source = page.metadata.source;
      if (page.metadata.complete) {
        if (live.length !== page.total)
          throw new Error('Incomplete period read. Reload before reconciling.');
        lastSuccessfulRefresh = oldestPageRead;
        break;
      }
      offset += page.reservations.length;
      if (offset >= 10000)
        throw new Error(
          'More than 10,000 bookings. Narrow the period for complete reconciliation.',
        );
    }
  } catch (e) {
    liveAvailable = false;
    live.length = 0;
    warnings.push(
      e instanceof Error ? e.message : 'Current Moovs facts unavailable.',
    );
  }
  const appResult = await appReads;
  if ('error' in appResult) throw appResult.error;
  const [persisted, payouts, attrs, agents, workflowRead] = appResult.value;
  const agencyData = agencies.map((agency) => ({
    agency,
    agents: agents.filter((agent) => agent.agency_id === agency.id),
    workflow: workflowRead.workflows[agency.id] ?? emptyWorkflow,
    workflowAvailable:
      workflowRead.available && !!workflowRead.workflows[agency.id],
  }));
  if (!timeZone)
    warnings.push(
      'Operator timezone unavailable. Stored wall-clock/service dates stay unchanged; automatic local periods cannot be verified.',
    );
  const byTrip = new Map<string, Reservation>(
    persisted.map((r) => [r.moovs_trip_id, { ...r, fact_origin: 'snapshot' }]),
  );
  const putLive = (r: Reservation) => {
    const old = byTrip.get(r.moovs_trip_id);
    byTrip.set(r.moovs_trip_id, {
      ...r,
      id: old?.id ?? r.id,
      fact_origin: 'live',
    });
  };
  for (const r of live) putLive(r);
  const links: PayoutReservation[] = [];
  const ids = payouts.filter((p) => p.status !== 'void').map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100)
    links.push(
      ...(await api.fetchPayoutReservationsByPayouts(ids.slice(i, i + 100))),
    );
  // Recover older reviewed bookings and existing unpaid allocations; this is not an exhaustive all-history scan.
  const paidIds = new Set(
    payouts.filter((p) => p.status === 'paid').map((p) => p.id),
  );
  const paidReservationIds = new Set(
    links.filter((l) => paidIds.has(l.payout_id)).map((l) => l.reservation_id),
  );
  const paidTrips = new Set([
    ...payouts
      .filter((p) => p.status === 'paid')
      .flatMap(
        (p) => p.statement_snapshot?.lines.map((l) => l.moovs_trip_id) ?? [],
      ),
    ...attrs
      .filter(
        (a) => paidReservationIds.has(a.reservation_id) && a.moovs_trip_id,
      )
      .map((a) => a.moovs_trip_id!),
  ]);
  const reviewed = agencyData.flatMap((w) =>
    w.workflow.reviews
      .filter((v) => v.status !== 'rejected' && !paidTrips.has(v.moovs_trip_id))
      .map((v) => ({ review: v, w })),
  );
  const unpaid = new Set(
    payouts
      .filter((p) => !['paid', 'void'].includes(p.status))
      .map((p) => p.id),
  );
  const historyIds = [
    ...new Set([
      ...links
        .filter((l) => unpaid.has(l.payout_id))
        .map((l) => l.reservation_id),
      ...attrs
        .filter((a) =>
          reviewed.some(
            (v) =>
              v.review.agency_id === a.agency_id &&
              (!a.moovs_trip_id || a.moovs_trip_id === v.review.moovs_trip_id),
          ),
        )
        .map((a) => a.reservation_id),
    ]),
  ];
  for (let i = 0; i < historyIds.length; i += 100)
    for (const r of await api.fetchReservationsByIds(
      historyIds.slice(i, i + 100),
    ))
      if (!byTrip.has(r.moovs_trip_id))
        byTrip.set(r.moovs_trip_id, { ...r, fact_origin: 'snapshot' });
  const liveIds = new Set(live.map((r) => r.moovs_trip_id));
  const carryIds = [
    ...new Set(
      [...reviewed.map((v) => v.review.moovs_trip_id), ...byTrip.values()].map(
        (v) => (typeof v === 'string' ? v : v.moovs_trip_id),
      ),
    ),
  ].filter((id) => !liveIds.has(id));
  let carryAvailable = true;
  try {
    for (let i = 0; i < carryIds.length; i += 250)
      for (const r of await api.fetchFacts(
        operator.operatorId,
        carryIds.slice(i, i + 250),
      ))
        putLive(r);
  } catch {
    carryAvailable = false;
    warnings.push(
      'Older reviewed bookings could not be refreshed. Carry-forward approvals are unavailable.',
    );
  }
  for (const { review, w } of reviewed)
    if (!byTrip.has(review.moovs_trip_id))
      byTrip.set(review.moovs_trip_id, {
        id: `missing:${review.moovs_trip_id}`,
        operator_id: operator.operatorId,
        moovs_trip_id: review.moovs_trip_id,
        moovs_company_id: w.agency.moovs_company_id,
        client_keys: financeAgencyKeys(w.agency),
        order_number: null,
        confirmation_number: null,
        pickup_date: null,
        travel_day: null,
        pickup_location: null,
        dropoff_location: null,
        passenger_name: null,
        booking_contact_id: null,
        booking_contact_name: null,
        booking_contact_email: null,
        vehicle_type: null,
        trip_type: null,
        base_rate_amount: 0,
        total_amount: 0,
        total_with_gratuity: 0,
        trip_status: null,
        synced_at: '',
        fact_origin: 'snapshot',
      });
  const allRows = reconcileBookings(
    [...byTrip.values()],
    agencyData,
    payouts,
    links,
    attrs,
    operator.routeRateConfig,
  );
  const rows = allRows.filter((r) => {
    const day = reservationTravelDay(r.reservation);
    return day && day >= from && day <= to;
  });
  const carryForward = allRows.filter((r) => {
    const day = reservationTravelDay(r.reservation);
    return (
      (!day || day < from) &&
      !['paid', 'rejected', 'outside-program'].includes(r.state)
    );
  });
  const workflowAvailable = agencyData.every((w) => w.workflowAvailable);
  if (!workflowAvailable)
    warnings.push(
      'Agency review/ledger data is unavailable. Payable totals are incomplete.',
    );
  const relevant = [...rows, ...carryForward];
  return {
    from,
    to,
    rows,
    carryForward,
    agencies: agencyData,
    payouts,
    totals: lifecycleTotals(rows),
    pendingAdjustments:
      Math.round(
        agencyData
          .flatMap((w) => w.workflow.adjustments ?? [])
          .filter((a) => !a.cancelled_at && !a.applied_payout_id)
          .reduce((n, a) => n + Number(a.amount), 0) * 100,
      ) / 100,
    health: {
      attemptedAt,
      lastSuccessfulRefresh,
      timeZone,
      liveAvailable,
      workflowAvailable,
      carryAvailable,
      source,
      missingFacts: relevant.filter(
        (r) =>
          r.state === 'unavailable' ||
          r.issues.some((i) => /unavailable|missing|invalid/i.test(i)),
      ).length,
      snapshotOnly: relevant.filter(
        (r) => r.reservation.fact_origin === 'snapshot',
      ).length,
      warnings,
    },
  };
}
