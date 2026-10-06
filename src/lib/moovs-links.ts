import type { Reservation } from '../types/commission';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function globalMoovsId(
  type: 'Request' | 'Trip',
  id: string,
): string | null {
  // The source response carries raw UUIDs; never encode order numbers as entity IDs.
  if (!UUID.test(id)) return null;
  return btoa(`${type}:${id}`);
}
export function operatorReservationUrl(
  reservation: Pick<
    Reservation,
    'moovs_request_id' | 'moovs_trip_id' | 'source' | 'trip_type'
  >,
): string | null {
  if (!reservation.moovs_request_id || reservation.source === 'shuttle')
    return null;
  const request = globalMoovsId('Request', reservation.moovs_request_id);
  const trip = globalMoovsId('Trip', reservation.moovs_trip_id);
  if (!request || !trip) return null;
  const shuttleRequest = reservation.trip_type?.toLowerCase() === 'shuttle';
  return `https://operator.moovs.app/reservations/${shuttleRequest ? 'shuttle/' : ''}${encodeURIComponent(request)}?tripId=${encodeURIComponent(trip)}`;
}
