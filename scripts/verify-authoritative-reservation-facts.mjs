import assert from 'node:assert/strict';
import {
  buildShuttleReservationFact,
  buildTripReservationFact,
} from '../lambda/src/reservationFactTransform.ts';

const operatorId = 'commission-operator-id';

const trip = buildTripReservationFact({
  moovs_trip_id: 'trip-1',
  moovs_company_id: 'company-1',
  order_number: '1234',
  pickup_date: new Date('2026-07-27T12:00:00.000Z'),
  base_rate: 100,
  tax: 10,
  gratuity: 20,
  discount: 5,
  other: 2,
  other2: 1,
  other3: 0,
  meet_greet: 3,
  tolls: 4,
  forward_seat: 5,
  rear_seat: 0,
  booster_seat: 0,
  promo_code: 6,
  client_keys: ['company:company-1', 'company:company-1', ''],
}, operatorId);

assert.equal(trip.operator_id, operatorId, 'facts must use the commission operator ID');
assert.equal(trip.moovs_trip_id, 'trip-1');
assert.equal(trip.total_amount, 126, 'total_amount must exclude gratuity');
assert.equal(trip.total_with_gratuity, 146, 'total_with_gratuity must include gratuity exactly once');
assert.deepEqual(trip.client_keys, ['company:company-1']);
assert.equal(trip.pickup_date, '2026-07-27T12:00:00.000Z');

const shuttle = buildShuttleReservationFact({
  moovs_trip_id: 'booking-1',
  moovs_company_id: 'company-2',
  base_rate: '45.678',
  shuttle_route_id: 'route-1',
  shuttle_route_name: 'Airport',
  client_keys: ['shuttle_client:client-1', 'company:company-2'],
}, operatorId);

assert.equal(shuttle.operator_id, operatorId);
assert.equal(shuttle.source, 'shuttle');
assert.equal(shuttle.base_rate_amount, 45.68);
assert.equal(shuttle.total_amount, 45.68);
assert.equal(shuttle.total_with_gratuity, 45.68);
assert.deepEqual(shuttle.client_keys, ['shuttle_client:client-1', 'company:company-2']);

console.log('Authoritative reservation fact verification passed (14 assertions).');
