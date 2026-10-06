import { reservationTravelDay } from './operator-time.ts';
import type { CommissionRule } from '../types/workflow';
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateRules(
  value: unknown,
  type: 'percent' | 'flat',
): string | null {
  if (!Array.isArray(value) || value.length > 100)
    return 'Rules must be an array with at most 100 entries.';
  const ids = new Set<string>();
  for (const r of value) {
    if (
      !r ||
      typeof r !== 'object' ||
      typeof r.id !== 'string' ||
      !r.id ||
      ids.has(r.id)
    )
      return 'Each rule needs a unique ID.';
    ids.add(r.id);
    if (typeof r.label !== 'string' || !r.label.trim() || r.label.length > 100)
      return 'Name each rule (100 characters maximum).';
    if (!['shuttle', 'private-transfer'].includes(r.service))
      return 'Choose shuttle or private transfer.';
    if (
      r.route_id !== null &&
      (typeof r.route_id !== 'string' ||
        !r.route_id.trim() ||
        r.route_id.length > 100)
    )
      return 'Invalid route ID.';
    if (r.service === 'private-transfer' && r.route_id !== null)
      return 'Private-transfer rules apply to the service, not a shuttle route.';
    if (
      typeof r.rate !== 'number' ||
      !Number.isFinite(r.rate) ||
      r.rate < 0 ||
      (type === 'percent' && r.rate > 100)
    )
      return 'Invalid commission rate.';
    if (
      !validDate(r.effective_from) ||
      (r.effective_to !== null && !validDate(r.effective_to))
    )
      return 'Enter valid effective dates.';
    if (r.effective_to && r.effective_to < r.effective_from)
      return 'End date must be on or after start date.';
  }
  for (let i = 0; i < value.length; i++)
    for (let j = i + 1; j < value.length; j++) {
      const a = value[i],
        b = value[j];
      if (
        a.service === b.service &&
        a.route_id === b.route_id &&
        a.effective_from <= (b.effective_to ?? '9999-12-31') &&
        b.effective_from <= (a.effective_to ?? '9999-12-31')
      )
        return 'Rules with the same service/route cannot have overlapping dates.';
    }
  return null;
}
export function applicableRule(
  reservation: {
    source?: string | null;
    trip_type?: string | null;
    pickup_date?: string | null;
    travel_day?: string | null;
    shuttle_route_id?: string | null;
  },
  rules: CommissionRule[] = [],
): CommissionRule | null {
  const marker = (
    reservation.source ??
    reservation.trip_type ??
    ''
  ).toLowerCase();
  const tripType = (reservation.trip_type ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const service =
    marker === 'shuttle'
      ? 'shuttle'
      : ['oneway', 'transfer', 'privatetransfer'].includes(tripType)
        ? 'private-transfer'
        : null;
  const day = reservationTravelDay(reservation);
  if (!service || !day) return null;
  return (
    rules
      .filter(
        (r) =>
          r.service === service &&
          (!r.route_id || r.route_id === reservation.shuttle_route_id) &&
          r.effective_from <= day &&
          (!r.effective_to || r.effective_to >= day),
      )
      .sort(
        (a, b) => Number(Boolean(b.route_id)) - Number(Boolean(a.route_id)),
      )[0] ?? null
  );
}
