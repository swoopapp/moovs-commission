import { useState, useEffect, useCallback } from 'react';
import { Agency, Agent, Reservation, ReservationAttribution, Payout } from '../../types/commission';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgencyById } from '../../services/agencyService';
import { fetchAgents } from '../../services/agentService';
import { fetchReservations } from '../../services/reservationService';
import { fetchAttributionsByAgency } from '../../services/attributionService';
import { fetchPayoutsByAgency } from '../../services/payoutService';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { AgencyHeader } from './AgencyHeader';
import { ReservationsTab } from './ReservationsTab';
import { AgentsTab } from './AgentsTab';
import { PayoutsTab } from './PayoutsTab';
import { SettingsTab } from './SettingsTab';
import { PayoutWizard } from '../payout/PayoutWizard';
import { toast } from 'sonner';

interface AgencyDetailViewProps {
  agencyId: string;
}

export function AgencyDetailView({ agencyId }: AgencyDetailViewProps) {
  const operator = useOperator();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attributions, setAttributions] = useState<ReservationAttribution[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('reservations');
  const [payoutWizardOpen, setPayoutWizardOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const agencyData = await fetchAgencyById(agencyId);
      if (!agencyData) {
        setError('Agency not found');
        return;
      }
      setAgency(agencyData);

      // Load remaining data in parallel
      const [agentsData, reservationsData, attributionsData, payoutsData] = await Promise.all([
        fetchAgents(agencyId),
        fetchReservations(operator.operatorId),
        fetchAttributionsByAgency(agencyId),
        fetchPayoutsByAgency(agencyId),
      ]);

      setAgents(agentsData);
      setReservations(reservationsData);
      setAttributions(attributionsData);
      setPayouts(payoutsData);
    } catch (err) {
      console.error('Failed to load agency detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agency');
    } finally {
      setLoading(false);
    }
  }, [agencyId, operator.operatorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute mini-KPI stats
  const stats = {
    bookings: attributions.length,
    revenue: attributions.reduce((sum, attr) => {
      const res = reservations.find((r) => r.id === attr.reservation_id);
      return sum + (res?.total_amount ?? 0);
    }, 0),
    commissionEarned: attributions.reduce((sum, attr) => sum + attr.commission_amount, 0),
    outstanding: (() => {
      const totalEarned = attributions.reduce((sum, attr) => sum + attr.commission_amount, 0);
      const totalPaid = payouts
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + p.net_payout, 0);
      return Math.max(0, totalEarned - totalPaid);
    })(),
  };

  function handleFilterByAgent(agentId: string) {
    setActiveTab('reservations');
    // Small delay so the tab switches first, then the ReservationsTab can pick up the filter
    // We achieve this by navigating to the reservations tab — the user can then use the agent dropdown
    toast.info(`Showing reservations for ${agents.find((a) => a.id === agentId)?.name || 'agent'}`);
  }

  function handleCreatePayout() {
    setPayoutWizardOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-2">Something went wrong</p>
        <p className="text-sm text-gray-500">{error || 'Agency not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AgencyHeader agency={agency} stats={stats} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="reservations" className="mt-4">
          <ReservationsTab
            reservations={reservations}
            attributions={attributions}
            agents={agents}
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <AgentsTab
            agents={agents}
            attributions={attributions}
            reservations={reservations}
            agencyId={agencyId}
            onAgentCreated={loadData}
            onFilterByAgent={handleFilterByAgent}
          />
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <PayoutsTab
            payouts={payouts}
            onCreatePayout={handleCreatePayout}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab
            agency={agency}
            onUpdated={(updated) => setAgency(updated)}
          />
        </TabsContent>
      </Tabs>

      <PayoutWizard
        open={payoutWizardOpen}
        onOpenChange={setPayoutWizardOpen}
        operatorId={operator.operatorId}
        agencyId={agencyId}
        onPayoutCreated={loadData}
      />
    </div>
  );
}
