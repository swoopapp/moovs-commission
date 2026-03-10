import { Agency, ReservationAttribution } from '../types/commission';
import { fetchAttributionsByAgency } from './attributionService';
import { fetchPayoutsByOperator } from './payoutService';
import { fetchReservations } from './reservationService';

export interface AgencyTableRow {
  agency: Agency;
  bookings: number;
  revenue: number;
  earned: number;
  paid: number;
  outstanding: number;
}

export interface DashboardStats {
  totalOwed: number;
  paidThisPeriod: number;
  activeAgencies: number;
  pendingPayouts: number;
  agencyRows: AgencyTableRow[];
}

export async function fetchDashboardStats(
  operatorId: string,
  agencies: Agency[],
): Promise<DashboardStats> {
  // Fetch all attributions per agency and all payouts for the operator in parallel
  const [allAttributionsByAgency, payouts, reservations] = await Promise.all([
    Promise.all(
      agencies.map(async (agency) => {
        const attributions = await fetchAttributionsByAgency(agency.id);
        return { agencyId: agency.id, attributions };
      }),
    ),
    fetchPayoutsByOperator(operatorId),
    fetchReservations(operatorId),
  ]);

  // Build reservation lookup for revenue
  const reservationMap = new Map(reservations.map((r) => [r.id, r]));

  // Build payout lookup by agency
  const paidByAgency = new Map<string, number>();
  let paidThisPeriod = 0;
  let pendingPayouts = 0;

  for (const payout of payouts) {
    if (payout.status === 'paid') {
      paidByAgency.set(
        payout.agency_id,
        (paidByAgency.get(payout.agency_id) ?? 0) + payout.net_payout,
      );
      paidThisPeriod += payout.net_payout;
    }
    if (payout.status === 'pending' || payout.status === 'draft') {
      pendingPayouts++;
    }
  }

  // Compute per-agency stats
  const agencyRows: AgencyTableRow[] = agencies.map((agency) => {
    const entry = allAttributionsByAgency.find((a) => a.agencyId === agency.id);
    const attributions: ReservationAttribution[] = entry?.attributions ?? [];

    const bookings = attributions.length;
    let revenue = 0;
    let earned = 0;

    for (const attr of attributions) {
      const res = reservationMap.get(attr.reservation_id);
      if (res) {
        revenue += res.total_amount;
      }
      earned += attr.commission_amount;
    }

    const paid = paidByAgency.get(agency.id) ?? 0;
    const outstanding = Math.max(0, earned - paid);

    return { agency, bookings, revenue, earned, paid, outstanding };
  });

  const totalOwed = agencyRows.reduce((sum, r) => sum + r.outstanding, 0);
  const activeAgencies = agencies.filter((a) => a.status === 'active').length;

  return {
    totalOwed,
    paidThisPeriod,
    activeAgencies,
    pendingPayouts,
    agencyRows,
  };
}
