/** Moovs has three date contracts: wall-clock stops, DATEs, and true instants. */
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** Preserve the calendar components of a Moovs wall-clock/SQL DATE string, even with a legacy Z suffix. */
export function wallClockDay(value: string | null | undefined): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (!match) return null;
  const [, y, m, d] = match;
  const probe = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isFinite(probe.getTime()) &&
    probe.toISOString().slice(0, 10) === `${y}-${m}-${d}`
    ? `${y}-${m}-${d}`
    : null;
}

/** Only for true instants (now, audit events, shuttle scheduled timestamps). Never pass stop.date_time. */
export function operatorDay(
  value: string | Date | null | undefined,
  timeZone: string,
): string | null {
  if (!value || !validTimeZone(timeZone)) return null;
  // Refuse naive strings: an instant must carry an offset, not borrow the runtime timezone.
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Shuttle commissions use service travel_date, not the UTC day of scheduled_pickup_time. */
export function reservationTravelDay(r: {
  travel_day?: string | null;
  pickup_date?: string | null;
  source?: string | null;
  booking_timezone?: string | null;
}): string | null {
  if (r.travel_day != null) return wallClockDay(r.travel_day);
  if (r.source === 'shuttle') return null; // Legacy snapshots need authoritative service-date refresh.
  return wallClockDay(r.pickup_date);
}
export function previousOperatorMonth(timeZone: string, now = new Date()) {
  const today = operatorDay(now, timeZone);
  if (!today)
    throw new Error(
      'Operator timezone must be verified before selecting an automatic period.',
    );
  const [year, month] = today.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, 0));
  return {
    from: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
