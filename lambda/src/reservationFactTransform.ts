export type AuthoritativeReservation = {
  operator_id: string;
  moovs_trip_id: string;
  moovs_company_id: string | null;
  order_number: string | null;
  confirmation_number: string | null;
  pickup_date: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  passenger_name: string | null;
  booking_contact_id: string | null;
  booking_contact_name: string | null;
  booking_contact_email: string | null;
  vehicle_type: string | null;
  trip_type: string | null;
  source: string;
  shuttle_route_id: string | null;
  shuttle_route_name: string | null;
  base_rate_amount: number;
  total_amount: number;
  total_with_gratuity: number;
  trip_status: string | null;
  client_keys: string[];
};

function money(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const result = String(value).trim();
  return result || null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter((item): item is string => Boolean(item)))];
}

export function buildTripReservationFact(
  row: Record<string, any>,
  operatorId: string,
): AuthoritativeReservation {
  const baseRate = money(row.base_rate);
  const gratuity = money(row.gratuity);
  const totalWithoutGratuity = [
    baseRate,
    money(row.tax),
    -money(row.discount),
    money(row.other),
    money(row.other2),
    money(row.other3),
    money(row.meet_greet),
    money(row.tolls),
    money(row.forward_seat),
    money(row.rear_seat),
    money(row.booster_seat),
    money(row.promo_code),
  ].reduce((sum, amount) => sum + amount, 0);

  return {
    operator_id: operatorId,
    moovs_trip_id: String(row.moovs_trip_id),
    moovs_company_id: text(row.moovs_company_id),
    order_number: text(row.order_number),
    confirmation_number: text(row.order_number),
    pickup_date: text(row.pickup_date),
    pickup_location: text(row.pickup_location),
    dropoff_location: text(row.dropoff_location),
    passenger_name: text(row.passenger_name),
    booking_contact_id: text(row.booking_contact_id),
    booking_contact_name: text(row.booking_contact_name),
    booking_contact_email: text(row.booking_contact_email),
    vehicle_type: text(row.vehicle_type),
    trip_type: text(row.trip_type),
    source: 'trip',
    shuttle_route_id: null,
    shuttle_route_name: null,
    base_rate_amount: baseRate,
    total_amount: money(totalWithoutGratuity),
    total_with_gratuity: money(totalWithoutGratuity + gratuity),
    trip_status: text(row.trip_status),
    client_keys: textArray(row.client_keys),
  };
}

export function buildShuttleReservationFact(
  row: Record<string, any>,
  operatorId: string,
): AuthoritativeReservation {
  const baseRate = money(row.base_rate);
  return {
    operator_id: operatorId,
    moovs_trip_id: String(row.moovs_trip_id),
    moovs_company_id: text(row.moovs_company_id),
    order_number: text(row.order_number),
    confirmation_number: text(row.order_number),
    pickup_date: text(row.pickup_date),
    pickup_location: text(row.pickup_location),
    dropoff_location: text(row.dropoff_location),
    passenger_name: text(row.passenger_name),
    booking_contact_id: null,
    booking_contact_name: null,
    booking_contact_email: null,
    vehicle_type: null,
    trip_type: 'shuttle',
    source: 'shuttle',
    shuttle_route_id: text(row.shuttle_route_id),
    shuttle_route_name: text(row.shuttle_route_name),
    base_rate_amount: baseRate,
    total_amount: baseRate,
    total_with_gratuity: baseRate,
    trip_status: text(row.trip_status),
    client_keys: textArray(row.client_keys),
  };
}
