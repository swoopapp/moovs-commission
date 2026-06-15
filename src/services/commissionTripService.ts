import { Agency, Agent, Reservation, ReservationAttribution } from '../types/commission';
import type { RouteRateConfig } from '../types/commissionOperator';
import { calculateCommission } from './attributionService';
import { resolveCommissionRate } from '../lib/commission-calc';

export function agencyClientKeys(agency: Agency): string[] {
  const keys = (agency.client_links ?? [])
    .map((link) => link.client_key)
    .filter((key): key is string => Boolean(key));

  if (keys.length > 0) return Array.from(new Set(keys));
  return agency.moovs_company_id ? [`company:${agency.moovs_company_id}`] : [];
}

export function primaryAgencyClientKey(agency: Agency): string | undefined {
  const primary = agency.client_links?.find((link) => link.is_primary) ?? agency.client_links?.[0];
  return primary?.client_key ?? (agency.moovs_company_id ? `company:${agency.moovs_company_id}` : undefined);
}

export function reservationClientKeys(reservation: Reservation): string[] {
  const keys = reservation.client_keys?.filter(Boolean) ?? [];
  if (keys.length > 0) return Array.from(new Set(keys));
  return reservation.moovs_company_id ? [`company:${reservation.moovs_company_id}`] : [];
}

export function syntheticAttributionId(reservation: Reservation, agency: Agency): string {
  return `live:${agency.id}:${reservation.moovs_trip_id}`;
}

export function isSyntheticAttribution(attribution: ReservationAttribution): boolean {
  return attribution.id.startsWith('live:');
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function findReservationAgent(reservation: Reservation, agents: Agent[] = []): Agent | null {
  const bookingContactId = normalize(reservation.booking_contact_id);
  const bookingContactEmail = normalize(reservation.booking_contact_email);

  if (!bookingContactId && !bookingContactEmail) return null;

  return agents.find((agent) => {
    if (agent.status !== 'active') return false;
    if (bookingContactId && normalize(agent.moovs_contact_id) === bookingContactId) return true;
    if (bookingContactEmail && normalize(agent.email) === bookingContactEmail) return true;
    return false;
  }) ?? null;
}

export function buildSyntheticAttribution(
  reservation: Reservation,
  agency: Agency,
  agents: Agent[] = [],
  routeConfig?: RouteRateConfig | null,
): ReservationAttribution {
  const agent = findReservationAgent(reservation, agents);
  const resolved = resolveCommissionRate(reservation, agency, routeConfig);
  return {
    id: syntheticAttributionId(reservation, agency),
    reservation_id: reservation.id,
    agency_id: agency.id,
    agent_id: agent?.id ?? null,
    commission_rate: agency.commission_type === 'flat' ? agency.commission_rate : resolved.rate,
    commission_type: agency.commission_type,
    commission_base: agency.commission_base,
    commission_amount: calculateCommission(reservation, agency, routeConfig),
    attributed_at: new Date().toISOString(),
  };
}

export function mergeAgencyAttributions(
  agency: Agency,
  reservations: Reservation[],
  persistedAttributions: ReservationAttribution[],
  agents: Agent[] = [],
  routeConfig?: RouteRateConfig | null,
): ReservationAttribution[] {
  const byReservationId = new Map(persistedAttributions.map((attr) => [attr.reservation_id, attr]));
  const merged: ReservationAttribution[] = [...persistedAttributions];
  const seenReservationIds = new Set(persistedAttributions.map((attr) => attr.reservation_id));
  const clientKeys = agencyClientKeys(agency);

  if (clientKeys.length === 0) return merged;
  const agencyKeySet = new Set(clientKeys);

  for (const reservation of reservations) {
    if (byReservationId.has(reservation.id)) continue;
    if (!reservationClientKeys(reservation).some((key) => agencyKeySet.has(key))) continue;
    if (seenReservationIds.has(reservation.id)) continue;

    merged.push(buildSyntheticAttribution(reservation, agency, agents, routeConfig));
    seenReservationIds.add(reservation.id);
  }

  return merged;
}
