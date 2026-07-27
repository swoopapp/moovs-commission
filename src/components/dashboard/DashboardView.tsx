import { useState, useEffect, useCallback, useRef } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgenciesPaginated } from '../../services/agencyService';
import { fetchDashboardStats, DashboardStats, AgencyTableRow, AgentTableRow } from '../../services/dashboardService';
import { Agency } from '../../types/commission';
import { KPICards } from './KPICards';
import { AgencyTable } from './AgencyTable';
import { CommissionTrendChart } from './CommissionTrendChart';
import { CreateAgencyDialog } from '../agency/CreateAgencyDialog';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface DashboardViewProps {
  onRegisterExport?: (fn: () => void) => void;
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
  a.download = `commission-report-${new Date().toISOString().slice(0, 10)}.csv`;
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

      <Card aria-label="Loading commission trend">
        <CardHeader>
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-end gap-4 px-6 pb-8 pt-4">
            {[42, 68, 54, 82, 64, 76].map((height, index) => (
              <Skeleton
                key={index}
                className="flex-1 rounded-t-md rounded-b-none"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export function DashboardView({ onRegisterExport }: DashboardViewProps) {
  const operator = useOperator();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [totalAgencies, setTotalAgencies] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [createAgencyOpen, setCreateAgencyOpen] = useState(false);
  const statsRequestId = useRef(0);
  const agenciesRequestId = useRef(0);

  // Table pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');

  // Load KPI stats (only agencies with attributions — lightweight)
  const loadStats = useCallback(async () => {
    const requestId = ++statsRequestId.current;
    setStatsError(null);
    try {
      const matchedAgencies = await fetchAgenciesPaginated(operator.operatorId, {
        limit: 250,
        offset: 0,
        matchedOnly: true,
      });
      const dashStats = await fetchDashboardStats(
        operator.operatorId,
        operator.moovsOperatorId,
        matchedAgencies.agencies,
        operator.routeRateConfig,
      );
      if (requestId === statsRequestId.current) {
        setStats(dashStats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      if (requestId === statsRequestId.current) {
        setStatsError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
      }
    }
  }, [operator.operatorId, operator.moovsOperatorId, operator.routeRateConfig]);

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
      }
    } catch (err) {
      console.error('Failed to load agencies:', err);
      if (requestId === agenciesRequestId.current) {
        setTableError(err instanceof Error ? err.message : 'Failed to load agencies');
      }
    } finally {
      if (requestId === agenciesRequestId.current) {
        setTableLoading(false);
      }
    }
  }, [operator.operatorId, page, pageSize, search]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadAgencies(); }, [loadAgencies]);

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
      {stats ? (
        <>
          <KPICards
            totalOwed={stats.totalOwed}
            paidThisPeriod={stats.paidThisPeriod}
            activeAgencies={totalAgencies}
            pendingPayouts={stats.pendingPayouts}
          />
          <CommissionTrendChart data={stats.agencyMonthlyTrend} agencyNames={stats.topAgencyNames} />
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
      )}
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

      <CreateAgencyDialog
        open={createAgencyOpen}
        onOpenChange={setCreateAgencyOpen}
        onCreated={() => { loadAgencies(); loadStats(); }}
      />
    </div>
  );
}
