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

export interface MonthlyTrend {
  month: string; // e.g. "Jan", "Feb"
  earned: number;
  paid: number;
}

export interface AgencyMonthlyTrend {
  month: string;
  [agencyName: string]: string | number; // dynamic keys per agency name
}

export interface DashboardStats {
  totalOwed: number;
  paidThisPeriod: number;
  activeAgencies: number;
  pendingPayouts: number;
  agencyRows: AgencyTableRow[];
  monthlyTrend: MonthlyTrend[];
  agencyMonthlyTrend: AgencyMonthlyTrend[];
  topAgencyNames: string[];
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

  // Build monthly trend data (last 6 months)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const monthlyEarned = new Map<string, number>();
  const monthlyPaid = new Map<string, number>();

  // Initialize last 6 months
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    trendMonths.push(key);
    monthlyEarned.set(key, 0);
    monthlyPaid.set(key, 0);
  }

  // Aggregate earned from attributions
  for (const entry of allAttributionsByAgency) {
    for (const attr of entry.attributions) {
      const date = new Date(attr.attributed_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyEarned.has(key)) {
        monthlyEarned.set(key, (monthlyEarned.get(key) ?? 0) + attr.commission_amount);
      }
    }
  }

  // Aggregate paid from payouts
  for (const payout of payouts) {
    if (payout.status === 'paid' && payout.date_paid) {
      const date = new Date(payout.date_paid);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyPaid.has(key)) {
        monthlyPaid.set(key, (monthlyPaid.get(key) ?? 0) + payout.net_payout);
      }
    }
  }

  const monthlyTrend: MonthlyTrend[] = trendMonths.map((key) => {
    const [yearStr, monthStr] = key.split('-');
    const monthIndex = parseInt(monthStr, 10) - 1;
    return {
      month: `${monthNames[monthIndex]} ${yearStr.slice(2)}`,
      earned: Math.round((monthlyEarned.get(key) ?? 0) * 100) / 100,
      paid: Math.round((monthlyPaid.get(key) ?? 0) * 100) / 100,
    };
  });

  // Build per-agency monthly trend (top 5 agencies by total commission)
  const agencyNameMap = new Map(agencies.map((a) => [a.id, a.name]));
  const agencyTotalCommission = new Map<string, number>();
  // Map: agencyId -> monthKey -> commission
  const agencyMonthMap = new Map<string, Map<string, number>>();

  for (const entry of allAttributionsByAgency) {
    for (const attr of entry.attributions) {
      const res = reservationMap.get(attr.reservation_id);
      const dateStr = res?.pickup_date ?? attr.attributed_at;
      const date = new Date(dateStr);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Total commission per agency
      agencyTotalCommission.set(
        entry.agencyId,
        (agencyTotalCommission.get(entry.agencyId) ?? 0) + attr.commission_amount,
      );

      // Per-month commission per agency
      if (trendMonths.includes(key)) {
        if (!agencyMonthMap.has(entry.agencyId)) {
          agencyMonthMap.set(entry.agencyId, new Map());
        }
        const monthMap = agencyMonthMap.get(entry.agencyId)!;
        monthMap.set(key, (monthMap.get(key) ?? 0) + attr.commission_amount);
      }
    }
  }

  // Get top 5 agencies by total commission
  const top5AgencyIds = [...agencyTotalCommission.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const topAgencyNames = top5AgencyIds.map((id) => agencyNameMap.get(id) ?? id);

  const agencyMonthlyTrend: AgencyMonthlyTrend[] = trendMonths.map((key) => {
    const [yearStr, monthStr] = key.split('-');
    const monthIndex = parseInt(monthStr, 10) - 1;
    const row: AgencyMonthlyTrend = {
      month: `${monthNames[monthIndex]} ${yearStr.slice(2)}`,
    };
    for (const agencyId of top5AgencyIds) {
      const name = agencyNameMap.get(agencyId) ?? agencyId;
      const monthMap = agencyMonthMap.get(agencyId);
      row[name] = Math.round((monthMap?.get(key) ?? 0) * 100) / 100;
    }
    return row;
  });

  return {
    totalOwed,
    paidThisPeriod,
    activeAgencies,
    pendingPayouts,
    agencyRows,
    monthlyTrend,
    agencyMonthlyTrend,
    topAgencyNames,
  };
}
