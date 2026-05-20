import { Agency, Reservation, ReservationAttribution } from '../types/commission';
import { calculateCommission } from './attributionService';

export function syntheticAttributionId(reservation: Reservation, agency: Agency): string {
  return `live:${agency.id}:${reservation.moovs_trip_id}`;
}

export function isSyntheticAttribution(attribution: ReservationAttribution): boolean {
  return attribution.id.startsWith('live:');
}

export function buildSyntheticAttribution(reservation: Reservation, agency: Agency): ReservationAttribution {
  return {
    id: syntheticAttributionId(reservation, agency),
    reservation_id: reservation.id,
    agency_id: agency.id,
    agent_id: null,
    commission_rate: agency.commission_rate,
    commission_type: agency.commission_type,
    commission_base: agency.commission_base,
    commission_amount: calculateCommission(reservation, agency),
    attributed_at: new Date().toISOString(),
  };
}

export function mergeAgencyAttributions(
  agency: Agency,
  reservations: Reservation[],
  persistedAttributions: ReservationAttribution[],
): ReservationAttribution[] {
  const byReservationId = new Map(persistedAttributions.map((attr) => [attr.reservation_id, attr]));
  const merged: ReservationAttribution[] = [...persistedAttributions];
  const seenReservationIds = new Set(persistedAttributions.map((attr) => attr.reservation_id));

  if (!agency.moovs_company_id) return merged;

  for (const reservation of reservations) {
    if (byReservationId.has(reservation.id)) continue;
    if (reservation.moovs_company_id !== agency.moovs_company_id) continue;
    if (seenReservationIds.has(reservation.id)) continue;

    merged.push(buildSyntheticAttribution(reservation, agency));
    seenReservationIds.add(reservation.id);
  }

  return merged;
}
