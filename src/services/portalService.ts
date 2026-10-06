import type { CommissionQuestion } from '../types/workflow';
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
  workflowAvailable?: boolean;
  commissionStates?: Record<string,{state:string;expected_payment_date:string|null;reason:string|null}>;
  questions?: CommissionQuestion[];
}

export async function fetchPortalData(token: string, signal?: AbortSignal): Promise<PortalData | null> {
  const response = await fetch(`/api/portal-data/${encodeURIComponent(token)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`fetchPortalData failed: ${response.status}`);
  return response.json() as Promise<PortalData>;
}
