import { query } from './db.js';
import {
  buildShuttleReservationFact,
  buildTripReservationFact,
  type AuthoritativeReservation,
} from './reservationFactTransform.js';

export async function fetchAuthoritativeReservations(
  commissionOperatorId: string,
  moovsOperatorId: string,
  tripIds: string[],
): Promise<AuthoritativeReservation[]> {
  if (!moovsOperatorId || tripIds.length === 0) return [];

  const [trips, shuttles] = await Promise.all([
    query(
      `SELECT
         t.trip_id::text AS moovs_trip_id,
         req.order_number,
         req.company_id::text AS moovs_company_id,
         bc.contact_id::text AS booking_contact_id,
         COALESCE(
           NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(bc.first_name), ''), NULLIF(BTRIM(bc.last_name), '')), ''),
           NULLIF(bc.email, '')
         ) AS booking_contact_name,
         bc.email AS booking_contact_email,
         pickup.date_time AS pickup_date,
         pickup.location AS pickup_location,
         dropoff.location AS dropoff_location,
         COALESCE(
           NULLIF(t.temporary_passenger->>'name', ''),
           NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(pc.first_name), ''), NULLIF(BTRIM(pc.last_name), '')), ''),
           NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(tc.first_name), ''), NULLIF(BTRIM(tc.last_name), '')), ''),
           NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(bc.first_name), ''), NULLIF(BTRIM(bc.last_name), '')), ''),
           NULLIF(bc.email, '')
         ) AS passenger_name,
         COALESCE(fv.name, v.name, '') AS vehicle_type,
         req.type AS trip_type,
         COALESCE(NULLIF(fr.base_rate_amt, 0), r.base_rate_amt, 0) / 100.0 AS base_rate,
         COALESCE(NULLIF(fr.tax_amt, 0), r.tax_amt, 0) / 100.0 AS tax,
         COALESCE(NULLIF(fr.driver_gratuity_amt, 0), r.driver_gratuity_amt, 0) / 100.0 AS gratuity,
         COALESCE(NULLIF(fr.promo_discount_amt, 0), r.promo_discount_amt, 0) / 100.0 AS discount,
         COALESCE(NULLIF(fr.other_amt, 0), r.other_amt, 0) / 100.0 AS other,
         COALESCE(NULLIF(fr.other2_amt, 0), r.other2_amt, 0) / 100.0 AS other2,
         COALESCE(NULLIF(fr.other3_amt, 0), r.other3_amt, 0) / 100.0 AS other3,
         COALESCE(NULLIF(fr.meet_greet_amt, 0), r.meet_greet_amt, 0) / 100.0 AS meet_greet,
         COALESCE(NULLIF(fr.tolls_amt, 0), r.tolls_amt, 0) / 100.0 AS tolls,
         COALESCE(r.forward_facing_seat_amt, 0) / 100.0 AS forward_seat,
         COALESCE(r.rear_facing_seat_amt, 0) / 100.0 AS rear_seat,
         COALESCE(r.booster_seat_amt, 0) / 100.0 AS booster_seat,
         COALESCE(r.promo_code_amt, 0) / 100.0 AS promo_code,
         r.status_slug AS trip_status,
         CASE
           WHEN req.company_id IS NOT NULL THEN ARRAY['company:' || req.company_id::text]
           ELSE ARRAY[]::text[]
         END AS client_keys
       FROM request req
       JOIN trip t ON t.request_id = req.request_id AND t.removed_at IS NULL
       LEFT JOIN route r ON r.trip_id = t.trip_id AND r.removed_at IS NULL
       LEFT JOIN farmed_route fr ON fr.route_id = r.route_id AND fr.cancelled_at IS NULL
       LEFT JOIN LATERAL (
         SELECT ct.contact_id FROM contact_team ct WHERE ct.team_id = req.team_id LIMIT 1
       ) booking_team ON true
       LEFT JOIN contact bc ON booking_team.contact_id = bc.contact_id
       LEFT JOIN contact tc ON t.contact_id = tc.contact_id
       LEFT JOIN LATERAL (
         SELECT s.location, s.date_time, s.contact_id AS passenger_contact_id
         FROM stop s WHERE s.trip_id = t.trip_id ORDER BY s.stop_index ASC LIMIT 1
       ) pickup ON true
       LEFT JOIN LATERAL (
         SELECT s.location FROM stop s WHERE s.trip_id = t.trip_id ORDER BY s.stop_index DESC LIMIT 1
       ) dropoff ON true
       LEFT JOIN vehicle v ON r.vehicle_id = v.vehicle_id
       LEFT JOIN vehicle fv ON fr.vehicle_id = fv.vehicle_id
       LEFT JOIN contact pc ON pickup.passenger_contact_id = pc.contact_id
       WHERE req.operator_id = $1
         AND t.trip_id::text = ANY($2::text[])`,
      [moovsOperatorId, tripIds],
    ),
    query(
      `SELECT
         sb.booking_id::text AS moovs_trip_id,
         sb.external_reservation_id AS order_number,
         COALESCE(sc.company_id, sp.company_id, rd.company_id)::text AS moovs_company_id,
         COALESCE(sb.scheduled_pickup_time, sb.travel_date::timestamptz) AS pickup_date,
         sb.pickup_location,
         sb.dropoff_location,
         CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, '')) AS passenger_name,
         COALESCE(pay.amount_in_cents, 0) / 100.0 AS base_rate,
         sb.booking_status AS trip_status,
         rd.route_definition_id::text AS shuttle_route_id,
         rd.name AS shuttle_route_name,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN sb.shuttle_client_id IS NOT NULL THEN 'shuttle_client:' || sb.shuttle_client_id::text END,
           CASE WHEN sc.company_id IS NOT NULL THEN 'company:' || sc.company_id::text END,
           CASE WHEN sp.company_id IS NOT NULL THEN 'company:' || sp.company_id::text END,
           CASE WHEN rd.company_id IS NOT NULL THEN 'company:' || rd.company_id::text END
         ], NULL) AS client_keys
       FROM shuttle_booking sb
       LEFT JOIN shuttle_client sc
         ON sb.shuttle_client_id = sc.shuttle_client_id AND sc.operator_id = sb.operator_id
       LEFT JOIN shuttle_passenger sp
         ON sb.shuttle_passenger_id = sp.shuttle_passenger_id AND sp.operator_id = sb.operator_id
       LEFT JOIN shuttle_payment pay ON pay.booking_id = sb.booking_id
       LEFT JOIN shuttle_route_definition_version rv ON rv.route_version_id = sb.route_version_id
       LEFT JOIN shuttle_route_definition rd
         ON rd.route_definition_id = rv.route_definition_id AND rd.operator_id = sb.operator_id
       WHERE sb.operator_id = $1
         AND sb.cancelled_at IS NULL
         AND sb.booking_id::text = ANY($2::text[])`,
      [moovsOperatorId, tripIds],
    ),
  ]);

  const facts = [
    ...trips.rows.map((row) => buildTripReservationFact(row, commissionOperatorId)),
    ...shuttles.rows.map((row) => buildShuttleReservationFact(row, commissionOperatorId)),
  ];
  const byTripId = new Map<string, AuthoritativeReservation>();
  for (const fact of facts) {
    if (byTripId.has(fact.moovs_trip_id)) {
      throw new Error(`Duplicate authoritative trip ${fact.moovs_trip_id}`);
    }
    byTripId.set(fact.moovs_trip_id, fact);
  }
  return tripIds.map((tripId) => byTripId.get(tripId)).filter((fact): fact is AuthoritativeReservation => Boolean(fact));
}
