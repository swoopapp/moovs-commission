import type {
  Agency,
  Agent,
  Payout,
  PayoutReservation,
  Reservation,
  ReservationAttribution,
} from '../types/commission';
import type { WorkflowData } from '../types/workflow';
import type { RouteRateConfig } from '../types/commissionOperator';
import {
  agentMatch,
  commissionState,
  eligibilityIssues,
} from './commission-workflow.ts';
import {
  calculateCommission,
  resolveCommissionRate,
} from './commission-calc.ts';
export interface FinanceAgencyData {
  agency: Agency;
  agents: Agent[];
  workflow: WorkflowData;
  workflowAvailable: boolean;
}
export interface ReconciliationRow {
  reservation: Reservation;
  agency: Agency | null;
  attribution: ReservationAttribution | null;
  state: string;
  issues: string[];
  candidateNames: string[];
  payoutId: string | null;
}
export interface LifecycleTotals {
  calculated: number;
  projected: number;
  approved: number;
  held: number;
  prepared: number;
  paid: number;
  rejected: number;
  needsReview: number;
  unknownBookings: number;
}
export const financeAgencyKeys = (a: Agency) => [
  ...new Set([
    ...(a.client_links ?? []).map((l) => l.client_key),
    ...(a.moovs_company_id ? [`company:${a.moovs_company_id}`] : []),
  ]),
];
export function reconcileBookings(
  reservations: Reservation[],
  agencies: FinanceAgencyData[],
  payouts: Payout[],
  links: PayoutReservation[],
  attrs: ReservationAttribution[],
  config?: RouteRateConfig | null,
): ReconciliationRow[] {
  const byTrip = new Map<string, Reservation>();
  for (const r of reservations) {
    const old = byTrip.get(r.moovs_trip_id);
    if (!old || r.fact_origin === 'live') byTrip.set(r.moovs_trip_id, r);
  }
  const payoutsById = new Map(
    payouts.filter((p) => p.status !== 'void').map((p) => [p.id, p]),
  );
  const allocations = new Map<string, Payout[]>();
  for (const link of links) {
    const p = payoutsById.get(link.payout_id);
    if (p)
      allocations.set(link.reservation_id, [
        ...(allocations.get(link.reservation_id) ?? []),
        p,
      ]);
  }
  return [...byTrip.values()].map((r) => {
    const tripKeys = r.client_keys?.length
      ? r.client_keys
      : r.moovs_company_id
        ? [`company:${r.moovs_company_id}`]
        : [];
    const candidates = agencies.filter(
      (w) =>
        w.agency.status === 'active' &&
        financeAgencyKeys(w.agency).some((k) => tripKeys.includes(k)),
    );
    const assigned = [
      ...new Map((allocations.get(r.id) ?? []).map((p) => [p.id, p])).values(),
    ];
    if (assigned.length > 1)
      return {
        reservation: r,
        agency: null,
        attribution: null,
        state: 'ambiguous',
        issues: ['Booking has multiple non-void settlement allocations.'],
        candidateNames: candidates.map((w) => w.agency.name),
        payoutId: null,
      };
    const allocated = assigned[0];
    const w = allocated
      ? agencies.find((w) => w.agency.id === allocated.agency_id)
      : candidates.length === 1
        ? candidates[0]
        : null;
    const mappingIssues =
      candidates.length > 1
        ? ['Booking matches multiple active agencies.']
        : candidates.length === 0
          ? ['No active commission agency matches this booking.']
          : [];
    if (!w)
      return {
        reservation: r,
        agency: null,
        attribution: null,
        state: allocated
          ? 'unavailable'
          : candidates.length > 1
            ? 'ambiguous'
            : 'outside-program',
        issues: allocated
          ? ['Historical settlement agency unavailable.']
          : mappingIssues,
        candidateNames: candidates.map((w) => w.agency.name),
        payoutId: allocated?.id ?? null,
      };
    const match = agentMatch(r, w.agents),
      resolution = resolveCommissionRate(r, w.agency, config);
    const original = attrs.find(
      (a) => a.reservation_id === r.id && a.agency_id === w.agency.id,
    );
    const frozen = allocated?.statement_snapshot?.lines.find(
      (l) => l.moovs_trip_id === r.moovs_trip_id,
    );
    // Financial history never falls back to today's rate or price.
    const amount = allocated
      ? (frozen?.commission_amount ?? original?.commission_amount)
      : calculateCommission(r, w.agency, config);
    const attr: ReservationAttribution | null =
      amount == null
        ? null
        : {
            id: original?.id ?? `live:${w.agency.id}:${r.moovs_trip_id}`,
            reservation_id: r.id,
            agency_id: w.agency.id,
            agent_id: allocated
              ? frozen
                ? frozen.agent_id
                : (original?.agent_id ?? null)
              : (match.agent?.id ?? null),
            commission_rate: allocated
              ? (frozen?.commission_rate ??
                original?.commission_rate ??
                resolution.rate)
              : resolution.rate,
            commission_type: (allocated
              ? (frozen?.commission_type ??
                original?.commission_type ??
                w.agency.commission_type)
              : w.agency
                  .commission_type) as ReservationAttribution['commission_type'],
            commission_base: (allocated
              ? (frozen?.commission_base ??
                original?.commission_base ??
                w.agency.commission_base)
              : w.agency
                  .commission_base) as ReservationAttribution['commission_base'],
            commission_amount: Number(amount),
            attributed_at: original?.attributed_at ?? '',
            rule_source: frozen?.rule_source ?? resolution.source,
          };
    const state = allocated
      ? allocated.status === 'paid'
        ? 'paid'
        : 'prepared'
      : !w.workflowAvailable || r.fact_origin === 'snapshot'
        ? 'unavailable'
        : commissionState(
            r,
            w.agency,
            w.agents,
            w.workflow.reviews.find((v) => v.moovs_trip_id === r.moovs_trip_id),
            false,
            config,
          );
    const issues = [
      ...mappingIssues,
      ...(!allocated ? eligibilityIssues(r, w.agency, w.agents) : []),
    ];
    if (!match.agent && !allocated)
      issues.push(
        match.issue ?? 'No individual agent mapped; agency-level credit.',
      );
    if (!w.workflowAvailable)
      issues.push('Commission reviews/ledger unavailable.');
    if (!attr)
      issues.push(
        'Historical allocation exists, but its frozen booking calculation is unavailable.',
      );
    return {
      reservation: r,
      agency: w.agency,
      attribution: attr,
      state,
      issues,
      candidateNames: candidates.map((w) => w.agency.name),
      payoutId: allocated?.id ?? null,
    };
  });
}
export function lifecycleTotals(rows: ReconciliationRow[]): LifecycleTotals {
  const t: LifecycleTotals = {
    calculated: 0,
    projected: 0,
    approved: 0,
    held: 0,
    prepared: 0,
    paid: 0,
    rejected: 0,
    needsReview: 0,
    unknownBookings: 0,
  };
  for (const r of rows) {
    const amount = Number(r.attribution?.commission_amount);
    if (
      !r.attribution ||
      !Number.isFinite(amount) ||
      ['outside-program', 'ambiguous', 'unavailable'].includes(r.state)
    ) {
      t.unknownBookings++;
      continue;
    }
    t.calculated += amount;
    if (r.state === 'approved') t.approved += amount;
    else if (r.state === 'held') t.held += amount;
    else if (r.state === 'prepared') t.prepared += amount;
    else if (r.state === 'paid') t.paid += amount;
    else if (r.state === 'rejected') t.rejected += amount;
    else if (r.state === 'projected') t.projected += amount;
    else t.needsReview += amount;
  }
  for (const k of Object.keys(t) as Array<keyof LifecycleTotals>)
    t[k] = Math.round(t[k] * 100) / 100;
  return t;
}
