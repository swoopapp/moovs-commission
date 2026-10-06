import type { Reservation } from '../../types/commission';
import { Button } from '../ui/button';
import { validTimeZone } from '../../lib/operator-time';
export function PortalDataHealth({
  reservations,
  onRefresh,
  synthetic,
}: {
  reservations: Reservation[];
  onRefresh: () => void;
  synthetic: boolean;
}) {
  const snapshots = reservations.filter(
    (r) => r.fact_origin === 'snapshot',
  ).length;
  const unverified = reservations.filter(
    (r) => !r.fact_origin || (r.fact_origin === 'live' && !r.facts_fetched_at),
  ).length;
  const stamps = reservations
    .filter(
      (r) =>
        r.fact_origin === 'live' &&
        r.facts_fetched_at &&
        Number.isFinite(Date.parse(r.facts_fetched_at)),
    )
    .map((r) => r.facts_fetched_at!)
    .sort();
  const oldest = stamps[0],
    zone = reservations.find((r) => r.booking_timezone)?.booking_timezone;
  const display = oldest
    ? validTimeZone(zone)
      ? new Date(oldest).toLocaleString('en-US', { timeZone: zone })
      : oldest
    : 'No live refresh timestamp available';
  return (
    <section
      className="rounded-lg border bg-white p-4 space-y-2 text-sm"
      aria-label="Partner data health"
    >
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="font-semibold">Booking data freshness</h2>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          Refresh booking data
        </Button>
      </div>
      <p className="text-gray-600">
        {synthetic ? 'Synthetic demo data. ' : ''}Oldest live facts read in this
        view: {display}. {snapshots} snapshot-only bookings · {unverified}{' '}
        bookings with unverified refresh metadata.
      </p>
      {snapshots > 0 && (
        <p className="text-amber-800">
          Some current booking facts are unavailable. Snapshot amounts are
          historical or estimates, not a new approval.
        </p>
      )}
      <p className="text-xs text-gray-500">
        Travel dates retain the operator’s stored wall-clock/service date.
        Portal read times do not establish upstream replica currency.
      </p>
    </section>
  );
}
