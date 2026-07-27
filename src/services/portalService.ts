import { Agency, Agent, Reservation, ReservationAttribution, Payout } from '../types/commission';

export interface PortalData {
  view: 'gm' | 'agent';
  agency: Agency;
  agents: Agent[];
  currentAgent?: Agent;
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  payouts: Payout[];
  outstandingBalance: number;
}

export async function fetchPortalData(token: string, signal?: AbortSignal): Promise<PortalData | null> {
  const response = await fetch(`/api/portal-data/${encodeURIComponent(token)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`fetchPortalData failed: ${response.status}`);
  return response.json() as Promise<PortalData>;
}
