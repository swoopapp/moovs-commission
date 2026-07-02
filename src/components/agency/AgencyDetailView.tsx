import { useState, useEffect, useCallback, useMemo } from 'react';
import { Agency, Agent, Reservation, ReservationAttribution, Payout } from '../../types/commission';
import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { fetchAgencyById } from '../../services/agencyService';
import { fetchAgents } from '../../services/agentService';
import { fetchCurrentReservations, fetchReservations } from '../../services/reservationService';
import { fetchAttributionsByAgency } from '../../services/attributionService';
import { fetchPayoutsByAgency } from '../../services/payoutService';
import { mergeAgencyAttributions, primaryAgencyClientKey } from '../../services/commissionTripService';
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

const RESERVATION_PAGE_SIZE = 50;
const INITIAL_LOOKBACK_DAYS = 90;

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultReservationWindow() {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - INITIAL_LOOKBACK_DAYS);
  return {
    dateFrom: formatIsoDate(dateFrom),
    dateTo: formatIsoDate(dateTo),
  };
}

function mergeReservationRows(rows: Reservation[]): Reservation[] {
  const byId = new Map<string, Reservation>();
  for (const row of rows) byId.set(row.id, row);
  return Array.from(byId.values()).sort((a, b) => (b.pickup_date || '').localeCompare(a.pickup_date || ''));
}

export function AgencyDetailView({ agencyId }: AgencyDetailViewProps) {
  const operator = useOperator();
  const isDemo = useIsDemo();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [persistedAttributions, setPersistedAttributions] = useState<ReservationAttribution[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsHasMore, setReservationsHasMore] = useState(false);
  const [reservationOffset, setReservationOffset] = useState(0);
  const [reservationWindow] = useState(defaultReservationWindow);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('reservations');
  const [reservationAgentFilter, setReservationAgentFilter] = useState('all');
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
      setReservations([]);
      setReservationOffset(0);
      setReservationsHasMore(false);

      // Load the core agency page first; trips are loaded separately in a bounded, paged request.
      const [agentsData, attributionsData, payoutsData] = await Promise.all([
        fetchAgents(agencyId),
        fetchAttributionsByAgency(agencyId),
        fetchPayoutsByAgency(agencyId),
      ]);

      setAgents(agentsData);
      setPersistedAttributions(attributionsData);
      setPayouts(payoutsData);
    } catch (err) {
      console.error('Failed to load agency detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agency');
    } finally {
      setLoading(false);
    }
  }, [agencyId, operator.operatorId, operator.moovsOperatorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!agency) return;

    let cancelled = false;
    const currentAgency = agency;

    async function loadInitialReservations() {
      try {
        setReservationsLoading(true);
        const clientKey = primaryAgencyClientKey(currentAgency);
        const options = {
          dateFrom: reservationWindow.dateFrom,
          dateTo: reservationWindow.dateTo,
          companyId: currentAgency.moovs_company_id ?? undefined,
          clientKey,
          limit: RESERVATION_PAGE_SIZE,
          offset: 0,
        };
        const rows = clientKey
          ? await fetchCurrentReservations(operator.operatorId, operator.moovsOperatorId, options)
          : await fetchReservations(operator.operatorId, options);

        if (cancelled) return;
        setReservations(mergeReservationRows(rows));
        setReservationOffset(rows.length);
        setReservationsHasMore(rows.length >= RESERVATION_PAGE_SIZE);
      } catch (err) {
        console.error('Failed to load agency reservations:', err);
        if (!cancelled) toast.error('Failed to load reservations');
      } finally {
        if (!cancelled) setReservationsLoading(false);
      }
    }

    loadInitialReservations();
    return () => {
      cancelled = true;
    };
  }, [agency, operator.operatorId, operator.moovsOperatorId, reservationWindow.dateFrom, reservationWindow.dateTo]);

  const attributions = useMemo(() => {
    if (!agency) return [];
    const reservationIds = new Set(reservations.map((reservation) => reservation.id));
    return mergeAgencyAttributions(agency, reservations, persistedAttributions, agents, operator.routeRateConfig)
      .filter((attribution) => reservationIds.has(attribution.reservation_id));
  }, [agency, reservations, persistedAttributions, agents, operator.routeRateConfig]);

  async function handleLoadMoreReservations() {
    if (!agency || reservationsLoading) return;

    try {
      setReservationsLoading(true);
      const clientKey = primaryAgencyClientKey(agency);
      const options = {
        dateFrom: reservationWindow.dateFrom,
        dateTo: reservationWindow.dateTo,
        companyId: agency.moovs_company_id ?? undefined,
        clientKey,
        limit: RESERVATION_PAGE_SIZE,
        offset: reservationOffset,
      };
      const rows = clientKey
        ? await fetchCurrentReservations(operator.operatorId, operator.moovsOperatorId, options)
        : await fetchReservations(operator.operatorId, options);

      setReservations((current) => mergeReservationRows([...current, ...rows]));
      setReservationOffset((current) => current + rows.length);
      setReservationsHasMore(rows.length >= RESERVATION_PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more reservations:', err);
      toast.error('Failed to load more reservations');
    } finally {
      setReservationsLoading(false);
    }
  }

  // Compute mini-KPI stats
  const stats = {
    bookings: attributions.length,
    revenue: attributions.reduce((sum, attr) => {
      const res = reservations.find((r) => r.id === attr.reservation_id);
      return sum + (res?.total_amount ?? 0);
    }, 0),
    commissionEarned: attributions.reduce((sum, attr) => sum + attr.commission_amount, 0),
    net: attributions.reduce((sum, attr) => {
      const res = reservations.find((r) => r.id === attr.reservation_id);
      return sum + ((res?.total_amount ?? 0) - attr.commission_amount);
    }, 0),
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
    setReservationAgentFilter(agentId);
    toast.info(`Filtered reservations for ${agents.find((a) => a.id === agentId)?.name || 'agent'}`);
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
      <AgencyHeader agency={agency} stats={stats} onCreatePayout={isDemo ? undefined : handleCreatePayout} />

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
            loading={reservationsLoading}
            hasMore={reservationsHasMore}
            loadedDateFrom={reservationWindow.dateFrom}
            loadedDateTo={reservationWindow.dateTo}
            agentFilter={reservationAgentFilter}
            onAgentFilterChange={setReservationAgentFilter}
            onLoadMore={handleLoadMoreReservations}
            priceMode={agency.price_mode}
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <AgentsTab
            agents={agents}
            attributions={attributions}
            reservations={reservations}
            agencyId={agencyId}
            agency={agency}
            onAgentCreated={loadData}
            onFilterByAgent={handleFilterByAgent}
          />
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <PayoutsTab
            payouts={payouts}
            onCreatePayout={isDemo ? undefined : handleCreatePayout}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab
            agency={agency}
            onUpdated={(updated) => setAgency(updated)}
          />
        </TabsContent>
      </Tabs>

      {!isDemo && (
        <PayoutWizard
          open={payoutWizardOpen}
          onOpenChange={setPayoutWizardOpen}
          operatorId={operator.operatorId}
          moovsOperatorId={operator.moovsOperatorId}
          agency={agency}
          agents={agents}
          agencyId={agencyId}
          onPayoutCreated={loadData}
        />
      )}
    </div>
  );
}
