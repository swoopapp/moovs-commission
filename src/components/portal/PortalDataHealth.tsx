import type { Reservation } from '../../types/commission';
import { DataStatus } from '../commissions/DataStatus';
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
    (r) =>
      !r.fact_origin ||
      (r.fact_origin === 'live' &&
        (!r.facts_fetched_at ||
          !Number.isFinite(Date.parse(r.facts_fetched_at)))),
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
    <DataStatus
      label="Partner data health"
      available={!snapshots && !unverified}
      timestamp={oldest}
      warning="Some booking data could not be verified. Refresh to see current facts."
      onRefresh={onRefresh}
    >
      {synthetic && <p>Synthetic demo data.</p>}
      <p>Oldest live facts read in this view: {display}</p>
      <p>
        {snapshots} snapshot-only bookings · {unverified} bookings with
        unverified refresh metadata
      </p>
      {snapshots > 0 && (
        <p className="text-amber-800">
          Snapshot amounts are historical or estimates, not a new approval.
        </p>
      )}
      <p>
        Travel dates retain the operator’s stored wall-clock/service date.
        Portal read times do not establish upstream replica currency.
      </p>
    </DataStatus>
  );
}
