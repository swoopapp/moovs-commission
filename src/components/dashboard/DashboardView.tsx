import { useWorkspaceSessionState, useInvalidateWorkspaceReads } from '../../contexts/WorkspaceSessionContext';
import { DataHealth } from '../commissions/DataHealth';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgenciesPaginated } from '../../services/agencyService';
import { fetchDashboardStats, DashboardStats, AgencyTableRow, AgentTableRow } from '../../services/dashboardService';
import { Agency } from '../../types/commission';
import { KPICards } from './KPICards';
import { AgencyTable } from './AgencyTable';
import { CommissionTrendChart } from './CommissionTrendChart';
import { CreateAgencyDialog } from '../agency/CreateAgencyDialog';
import { Card, CardContent } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { toLocalDateInput } from '../../lib/date';

interface DashboardViewProps {
  onRegisterExport?: (fn: () => void) => void;
  showOverview?: boolean;
}

const DASHBOARD_AGENCY_PAGE_SIZE = 250;

async function fetchAllAgencies(operatorId: string): Promise<Agency[]> {
  const agencies: Agency[] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await fetchAgenciesPaginated(operatorId, {
      limit: DASHBOARD_AGENCY_PAGE_SIZE,
      offset,
    });
    agencies.push(...page.agencies);
    total = page.total;
    offset += page.agencies.length;
    if (page.agencies.length === 0) break;
  } while (agencies.length < total);

  return agencies;
}

function exportAgenciesToCsv(rows: AgencyTableRow[], agentRows: AgentTableRow[]) {
  const headers = ['Row Type', 'Agency', 'Agent', 'Contact', 'Type', 'Rate', 'Bookings', 'Revenue', 'Earned', 'Paid', 'Outstanding', 'Status'];
  const csvRows = [headers.join(',')];
  const agentsByAgency = new Map<string, AgentTableRow[]>();
  for (const agentRow of agentRows) {
    if (!agentsByAgency.has(agentRow.agency.id)) agentsByAgency.set(agentRow.agency.id, []);
    agentsByAgency.get(agentRow.agency.id)!.push(agentRow);
  }

  for (const row of rows) {
    const rate = row.agency.commission_type === 'flat' ? `$${row.agency.commission_rate}` : `${row.agency.commission_rate}%`;
    csvRows.push([
      'Agency',
      `"${row.agency.name.replace(/"/g, '""')}"`,
      '',
      `"${(row.agency.contact_name ?? '').replace(/"/g, '""')}"`,
      row.agency.type,
      rate,
      row.bookings,
      row.revenue.toFixed(2),
      row.earned.toFixed(2),
      row.paid.toFixed(2),
      row.outstanding.toFixed(2),
      row.agency.status,
    ].join(','));

    for (const agentRow of agentsByAgency.get(row.agency.id) ?? []) {
      csvRows.push([
        'Agent',
        `"${row.agency.name.replace(/"/g, '""')}"`,
        `"${agentRow.agent.name.replace(/"/g, '""')}"`,
        `"${(agentRow.agent.email ?? '').replace(/"/g, '""')}"`,
        '',
        '',
        agentRow.bookings,
        agentRow.revenue.toFixed(2),
        agentRow.earned.toFixed(2),
        '',
        '',
        agentRow.agent.status,
      ].join(','));
    }
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commission-report-${toLocalDateInput(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DashboardStatsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading dashboard metrics" role="status">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="py-4">
            <CardContent className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </>
  );
}

export function DashboardView({ onRegisterExport, showOverview = true }: DashboardViewProps) {
  const operator = useOperator();
  const invalidateReads = useInvalidateWorkspaceReads();
  const [stats, setStats] = useWorkspaceSessionState<DashboardStats | null>('overview:data', null);
  const [agencies, setAgencies] = useWorkspaceSessionState<Agency[]>('overview:agencies', []);
  const [totalAgencies, setTotalAgencies] = useWorkspaceSessionState('overview:total-agencies', 0);
  const [tableLoading, setTableLoading] = useState(true);
  const [statsError, setStatsError] = useWorkspaceSessionState<string | null>('overview:stats-error', null);
  const [tableError, setTableError] = useWorkspaceSessionState<string | null>('overview:table-error', null);
  const [createAgencyOpen, setCreateAgencyOpen] = useState(false);
  const statsRequestId = useRef(0);
  const agenciesRequestId = useRef(0);

  // Table pagination state
  const [page, setPage] = useWorkspaceSessionState('overview:page', 0);
  const [pageSize, setPageSize] = useWorkspaceSessionState('overview:page-size', 25);
  const [search, setSearch] = useWorkspaceSessionState('overview:search', '');

  const metricSignature = JSON.stringify([operator.operatorId, operator.moovsOperatorId, operator.routeRateConfig, operator.timeZone]);
  const tableSignature = JSON.stringify([operator.operatorId, page, pageSize, search]);
  const [loadedMetricSignature, setLoadedMetricSignature] = useWorkspaceSessionState<string | null>('overview:metric-signature', null);
  const [loadedTableSignature, setLoadedTableSignature] = useWorkspaceSessionState<string | null>('overview:table-signature', null);

  // Load complete KPI/export stats independently from the paginated table.
  const loadStats = useCallback(async () => {
    const requestId = ++statsRequestId.current;
    setStatsError(null);
    try {
      const metricAgencies = await fetchAllAgencies(operator.operatorId);
      const dashStats = await fetchDashboardStats(
        operator.operatorId,
        operator.moovsOperatorId,
        metricAgencies,
        operator.routeRateConfig,
        operator.timeZone,
      );
      if (requestId === statsRequestId.current) {
        setStats(dashStats);
        setLoadedMetricSignature(metricSignature);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      if (requestId === statsRequestId.current) {
        setStats(null);
        setLoadedMetricSignature(null);
        setStatsError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
      }
    }
  }, [operator.operatorId, operator.moovsOperatorId, operator.routeRateConfig, operator.timeZone]);

  // Load paginated agencies for table
  const loadAgencies = useCallback(async () => {
    const requestId = ++agenciesRequestId.current;
    try {
      setTableLoading(true);
      setTableError(null);
      const result = await fetchAgenciesPaginated(operator.operatorId, {
        offset: page * pageSize,
        limit: pageSize,
        search: search || undefined,
      });
      if (requestId === agenciesRequestId.current) {
        setAgencies(result.agencies);
        setTotalAgencies(result.total);
        setLoadedTableSignature(tableSignature);
      }
    } catch (err) {
      console.error('Failed to load agencies:', err);
      if (requestId === agenciesRequestId.current) {
        setLoadedTableSignature(null);
        setTableError(err instanceof Error ? err.message : 'Failed to load agencies');
      }
    } finally {
      if (requestId === agenciesRequestId.current) {
        setTableLoading(false);
      }
    }
  }, [operator.operatorId, page, pageSize, search]);

  useEffect(() => {
    if (!stats || loadedMetricSignature !== metricSignature) loadStats();
  }, [loadStats, metricSignature]);
  useEffect(() => {
    if (loadedTableSignature !== tableSignature) loadAgencies();
    else setTableLoading(false);
  }, [loadAgencies, tableSignature]);

  // Register export function with parent
  useEffect(() => {
    if (onRegisterExport && stats) {
      onRegisterExport(() => exportAgenciesToCsv(stats.agencyRows, stats.agentRows));
    }
  }, [onRegisterExport, stats]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(0);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <div className="space-y-6">
      {showOverview && (stats ? (
        <>
          <KPICards finance={stats.finance}/>
          <DataHealth health={stats.finance.health} onRefresh={loadStats}/>

        </>
      ) : statsError ? (
        <Card className="border-red-200" role="alert">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-900">Dashboard metrics are unavailable</p>
              <p className="mt-1 text-sm text-gray-600">{statsError}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadStats}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DashboardStatsSkeleton />
      ))}
      <AgencyTable
        agencies={agencies}
        totalAgencies={totalAgencies}
        page={page}
        pageSize={pageSize}
        loading={tableLoading}
        error={tableError}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSearchChange={handleSearchChange}
        onAddAgency={() => setCreateAgencyOpen(true)}
        onRefresh={() => { loadAgencies(); loadStats(); }}
      />

      {showOverview && stats && (
        <CommissionTrendChart data={stats.agencyMonthlyTrend} agencyNames={stats.topAgencyNames} />
      )}

      <CreateAgencyDialog
        open={createAgencyOpen}
        onOpenChange={setCreateAgencyOpen}
        onCreated={() => { invalidateReads(); loadAgencies(); loadStats(); }}
      />
    </div>
  );
}
