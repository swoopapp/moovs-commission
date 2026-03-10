import { Agency, Agent, Reservation, ReservationAttribution, Payout } from '../types/commission';
import { fetchAgencyByToken, fetchAgencyById } from './agencyService';
import { fetchAgentByToken, fetchAgents } from './agentService';
import { fetchAttributionsByAgency } from './attributionService';
import { fetchReservationsByIds } from './reservationService';
import { fetchPayoutsByAgency } from './payoutService';

export interface PortalData {
  view: 'gm' | 'agent';
  agency: Agency;
  agents: Agent[];
  currentAgent?: Agent;
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  payouts: Payout[];
}

export async function fetchPortalData(token: string): Promise<PortalData | null> {
  // 1. Try agency portal_token (GM view)
  const agency = await fetchAgencyByToken(token);
  if (agency) {
    const [agents, attributions, payouts] = await Promise.all([
      fetchAgents(agency.id),
      fetchAttributionsByAgency(agency.id),
      fetchPayoutsByAgency(agency.id),
    ]);

    const reservationIds = [...new Set(attributions.map((a) => a.reservation_id))];
    const reservations = await fetchReservationsByIds(reservationIds);

    return { view: 'gm', agency, agents, reservations, attributions, payouts };
  }

  // 2. Try agent portal_token (Agent view)
  const agent = await fetchAgentByToken(token);
  if (agent) {
    const agencyData = await fetchAgencyById(agent.agency_id);
    if (!agencyData) return null;

    const allAttributions = await fetchAttributionsByAgency(agencyData.id);

    const agentAttributions = allAttributions.filter((a) => a.agent_id === agent.id);
    const reservationIds = [...new Set(agentAttributions.map((a) => a.reservation_id))];
    const reservations = await fetchReservationsByIds(reservationIds);

    // Agent view: payouts are agency-level records without per-agent breakdown,
    // so we return an empty array to avoid leaking other agents' data.
    return {
      view: 'agent',
      agency: agencyData,
      agents: [],
      currentAgent: agent,
      reservations,
      attributions: agentAttributions,
      payouts: [],
    };
  }

  return null;
}
