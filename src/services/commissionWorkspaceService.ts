import type {
  Agency,
  Agent,
  Reservation,
  ReservationAttribution,
  Payout,
} from '../types/commission';
import type { WorkflowData } from '../types/workflow';
import {
  agencyClientKeys,
  mergeAgencyAttributions,
} from './commissionTripService';
import { fetchLiveReservations, fetchReservations } from './reservationService';
import { fetchAgents } from './agentService';
import { fetchAttributionsByAgency } from './attributionService';
import {
  fetchPayoutsByAgency,
  fetchPayoutReservationsByPayouts,
} from './payoutService';
import { fetchWorkflow } from './workflowService';
import type { CommissionOperatorConfig } from '../types/commissionOperator';
export interface AgencyWorkspace {
  agency: Agency;
  agents: Agent[];
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  payouts: Payout[];
  reservedIds: Set<string>;
  settledIds: Set<string>;
  workflow: WorkflowData;
}
export async function fetchAgencyPeriod(
  operator: CommissionOperatorConfig,
  agency: Agency,
  dateFrom: string,
  dateTo: string,
): Promise<AgencyWorkspace> {
  const [agents, attrs, payouts, workflow, persisted] = await Promise.all([
    fetchAgents(agency.id),
    fetchAttributionsByAgency(agency.id),
    fetchPayoutsByAgency(agency.id),
    fetchWorkflow(agency.id),
    fetchReservations(operator.operatorId, { dateFrom, dateTo }),
  ]);
  const keys = agencyClientKeys(agency),
    live: Reservation[] = [];
  for (const key of keys) {
    let offset = 0;
    for (;;) {
      const rows = await fetchLiveReservations(
        operator.operatorId,
        operator.moovsOperatorId,
        { dateFrom, dateTo, clientKey: key, limit: 250, offset },
      );
      live.push(...rows);
      if (rows.length < 250) break;
      offset += rows.length;
      if (offset >= 5000)
        throw new Error(
          'More than 5,000 bookings for one linked client. Narrow the date range before closing.',
        );
    }
  }
  const byTrip = new Map(live.map((r) => [r.moovs_trip_id, r]));
  for (const r of persisted) {
    if (
      !keys.some((k) =>
        (r.client_keys ?? [`company:${r.moovs_company_id}`]).includes(k),
      )
    )
      continue;
    const current = byTrip.get(r.moovs_trip_id);
    byTrip.set(r.moovs_trip_id, current ? { ...current, id: r.id } : r);
  }
  const reservations = [...byTrip.values()];

  const links = await fetchPayoutReservationsByPayouts(
    payouts.filter((p) => p.status !== 'void').map((p) => p.id),
  );
  const attributions = mergeAgencyAttributions(
    agency,
    reservations,
    attrs,
    agents,
    operator.routeRateConfig,
    new Set(links.map((l) => l.reservation_id)),
  ).filter((a) => reservations.some((r) => r.id === a.reservation_id));
  const paid = new Set(
    payouts.filter((p) => p.status === 'paid').map((p) => p.id),
  );
  return {
    agency,
    agents,
    reservations,
    attributions,
    payouts,
    workflow,
    reservedIds: new Set(links.map((l) => l.reservation_id)),
    settledIds: new Set(
      links.filter((l) => paid.has(l.payout_id)).map((l) => l.reservation_id),
    ),
  };
}
