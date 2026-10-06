import type { Agency, Agent } from '../types/commission';
import type {
  RouteRateConfig,
  CommissionOperatorConfig,
} from '../types/commissionOperator';
import {
  fetchFinanceWorkspace,
  type FinanceWorkspace,
} from './financeWorkspaceService';
import { operatorDay, reservationTravelDay } from '../lib/operator-time';
export interface AgencyTableRow {
  agency: Agency;
  bookings: number;
  revenue: number;
  earned: number;
  paid: number;
  outstanding: number;
}
export interface AgentTableRow {
  agency: Agency;
  agent: Agent;
  bookings: number;
  revenue: number;
  earned: number;
}
export interface MonthlyTrend {
  month: string;
  earned: number;
  paid: number;
}
export interface AgencyMonthlyTrend {
  month: string;
  [agencyName: string]: string | number;
}
export interface DashboardStats {
  totalOwed: number;
  paidThisPeriod: number;
  activeAgencies: number;
  pendingPayouts: number;
  agencyRows: AgencyTableRow[];
  agentRows: AgentTableRow[];
  monthlyTrend: MonthlyTrend[];
  agencyMonthlyTrend: AgencyMonthlyTrend[];
  topAgencyNames: string[];
  finance: FinanceWorkspace;
}
export async function fetchDashboardStats(
  operatorId: string,
  moovsOperatorId: string,
  agencies: Agency[],
  routeConfig?: RouteRateConfig | null,
  timeZone?: string | null,
): Promise<DashboardStats> {
  const today = operatorDay(new Date(), timeZone ?? '');
  if (!today)
    throw new Error(
      'Operator timezone unavailable. Verify operator settings before using automatic dashboard periods.',
    );
  const [year, month] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 6, 1));
  const from = first.toISOString().slice(0, 10);
  const operator = {
    operatorId,
    moovsOperatorId,
    timeZone,
    routeRateConfig: routeConfig ?? { default_rate: null, routes: {} },
  } as CommissionOperatorConfig;
  const finance = await fetchFinanceWorkspace(operator, agencies, from, today);
  const known = finance.rows.filter(
    (r) =>
      r.agency &&
      r.attribution &&
      !['outside-program', 'ambiguous', 'unavailable'].includes(r.state),
  );
  const sum = (rows: typeof known) =>
    rows.reduce((n, r) => n + Number(r.attribution!.commission_amount), 0);
  const agencyRows: AgencyTableRow[] = agencies.map((agency) => {
    const rows = known.filter((r) => r.agency?.id === agency.id);
    return {
      agency,
      bookings: rows.length,
      revenue: rows.reduce((n, r) => n + Number(r.reservation.total_amount), 0),
      earned: sum(rows),
      paid: sum(rows.filter((r) => r.state === 'paid')),
      outstanding: sum(
        rows.filter((r) => ['approved', 'prepared'].includes(r.state)),
      ),
    };
  });
  const agentRows: AgentTableRow[] = finance.agencies.flatMap((w) =>
    w.agents.map((agent) => {
      const rows = known.filter(
        (r) =>
          r.agency?.id === w.agency.id && r.attribution?.agent_id === agent.id,
      );
      return {
        agency: w.agency,
        agent,
        bookings: rows.length,
        revenue: rows.reduce(
          (n, r) => n + Number(r.reservation.total_amount),
          0,
        ),
        earned: sum(rows),
      };
    }),
  );
  const top = agencyRows
    .filter((r) => r.earned !== 0)
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 5);
  // Duplicate agency names get distinct legends rather than overwriting a data series.
  const labels = new Map(
    top.map((r) => [
      r.agency.id,
      agencies.filter((a) => a.name === r.agency.name).length > 1
        ? `${r.agency.name} (${r.agency.id.slice(0, 6)})`
        : r.agency.name,
    ]),
  );
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1),
    );
    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }),
    };
  });
  const monthlyTrend = months.map(({ key, label }) => ({
    month: label,
    earned: sum(
      known.filter((r) => reservationTravelDay(r.reservation)?.startsWith(key)),
    ),
    paid: sum(
      known.filter(
        (r) =>
          r.state === 'paid' &&
          reservationTravelDay(r.reservation)?.startsWith(key),
      ),
    ),
  }));
  const agencyMonthlyTrend = months.map(({ key, label }) => {
    const row: AgencyMonthlyTrend = { month: label };
    for (const a of top)
      row[labels.get(a.agency.id)!] = sum(
        known.filter(
          (r) =>
            r.agency?.id === a.agency.id &&
            reservationTravelDay(r.reservation)?.startsWith(key),
        ),
      );
    return row;
  });
  return {
    totalOwed: finance.totals.approved,
    paidThisPeriod: finance.totals.paid,
    activeAgencies: agencies.filter((a) => a.status === 'active').length,
    pendingPayouts: finance.payouts.filter(
      (p) => !['paid', 'void'].includes(p.status),
    ).length,
    agencyRows,
    agentRows,
    monthlyTrend,
    agencyMonthlyTrend,
    topAgencyNames: [...labels.values()],
    finance,
  };
}
