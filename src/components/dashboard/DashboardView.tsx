import { useState, useEffect, useCallback } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgenciesPaginated } from '../../services/agencyService';
import { fetchDashboardStats, DashboardStats, AgencyTableRow } from '../../services/dashboardService';
import { Agency } from '../../types/commission';
import { KPICards } from './KPICards';
import { AgencyTable } from './AgencyTable';
import { CommissionTrendChart } from './CommissionTrendChart';
import { CreateAgencyDialog } from '../agency/CreateAgencyDialog';

interface DashboardViewProps {
  onRegisterExport?: (fn: () => void) => void;
}

function exportAgenciesToCsv(rows: AgencyTableRow[]) {
  const headers = ['Agency', 'Contact', 'Type', 'Rate', 'Bookings', 'Revenue', 'Earned', 'Paid', 'Outstanding', 'Status'];
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    const rate = row.agency.commission_type === 'flat' ? `$${row.agency.commission_rate}` : `${row.agency.commission_rate}%`;
    csvRows.push([
      `"${row.agency.name.replace(/"/g, '""')}"`,
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
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commission-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardView({ onRegisterExport }: DashboardViewProps) {
  const operator = useOperator();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [totalAgencies, setTotalAgencies] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createAgencyOpen, setCreateAgencyOpen] = useState(false);

  // Table pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');

  // Load KPI stats (only agencies with attributions — lightweight)
  const loadStats = useCallback(async () => {
    try {
      // Only fetch agencies that have attributions for KPI computation
      // For now use a reasonable page to get stats — this will be fast since
      // most agencies have 0 attributions
      const dashStats = await fetchDashboardStats(operator.operatorId, []);
      setStats(dashStats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [operator.operatorId]);

  // Load paginated agencies for table
  const loadAgencies = useCallback(async () => {
    try {
      setTableLoading(true);
      const result = await fetchAgenciesPaginated(operator.operatorId, {
        offset: page * pageSize,
        limit: pageSize,
        search: search || undefined,
      });
      setAgencies(result.agencies);
      setTotalAgencies(result.total);
    } catch (err) {
      console.error('Failed to load agencies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agencies');
    } finally {
      setTableLoading(false);
      setLoading(false);
    }
  }, [operator.operatorId, page, pageSize, search]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  // Register export function with parent
  useEffect(() => {
    if (onRegisterExport && stats) {
      onRegisterExport(() => exportAgenciesToCsv(stats.agencyRows));
    }
  }, [onRegisterExport, stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-2">Something went wrong</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stats && (
        <>
          <KPICards
            totalOwed={stats.totalOwed}
            paidThisPeriod={stats.paidThisPeriod}
            activeAgencies={totalAgencies}
            pendingPayouts={stats.pendingPayouts}
          />
          <CommissionTrendChart data={stats.agencyMonthlyTrend} agencyNames={stats.topAgencyNames} />
        </>
      )}
      <AgencyTable
        agencies={agencies}
        totalAgencies={totalAgencies}
        page={page}
        pageSize={pageSize}
        loading={tableLoading}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
        onSearchChange={(q) => { setSearch(q); setPage(0); }}
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
