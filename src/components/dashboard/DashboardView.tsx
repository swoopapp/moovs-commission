import { useState, useEffect, useCallback } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgencies } from '../../services/agencyService';
import { fetchDashboardStats, DashboardStats } from '../../services/dashboardService';
import { KPICards } from './KPICards';
import { AgencyTable } from './AgencyTable';
import SyncTripsDialog from '../sync/SyncTripsDialog';
import { CreateAgencyDialog } from '../agency/CreateAgencyDialog';

interface DashboardViewProps {
  syncOpen: boolean;
  onSyncOpenChange: (open: boolean) => void;
}

export function DashboardView({ syncOpen, onSyncOpenChange }: DashboardViewProps) {
  const operator = useOperator();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createAgencyOpen, setCreateAgencyOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const agencies = await fetchAgencies(operator.operatorId);
      const dashStats = await fetchDashboardStats(operator.operatorId, agencies);

      setStats(dashStats);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [operator.operatorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <KPICards
        totalOwed={stats.totalOwed}
        paidThisPeriod={stats.paidThisPeriod}
        activeAgencies={stats.activeAgencies}
        pendingPayouts={stats.pendingPayouts}
      />
      <AgencyTable rows={stats.agencyRows} onAddAgency={() => setCreateAgencyOpen(true)} />

      <SyncTripsDialog
        open={syncOpen}
        onOpenChange={onSyncOpenChange}
        operatorId={operator.operatorId}
        moovsOperatorId={operator.moovsOperatorId}
        onSyncComplete={loadData}
      />

      <CreateAgencyDialog
        open={createAgencyOpen}
        onOpenChange={setCreateAgencyOpen}
        onCreated={loadData}
      />
    </div>
  );
}
