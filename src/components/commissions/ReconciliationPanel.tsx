import { useState } from 'react';
import type { FinanceWorkspace } from '../../services/financeWorkspaceService';
import type { ReconciliationRow } from '../../lib/finance-reconciliation';
import { reservationTravelDay } from '../../lib/operator-time';
import { Badge } from '../ui/badge';
export const isReconciliationException = (r: ReconciliationRow) =>
  !['approved', 'prepared', 'paid', 'rejected', 'outside-program'].includes(
    r.state,
  ) ||
  (!r.attribution && r.state !== 'outside-program');
export function ReconciliationPanel({
  data,
  onInspect,
  acknowledged,
  onAcknowledge,
}: {
  data: FinanceWorkspace;
  onInspect?: (r: ReconciliationRow) => void;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const [filter, setFilter] = useState('exceptions');
  const exceptions = data.rows.filter(isReconciliationException),
    outside = data.rows.filter((r) => r.state === 'outside-program');
  const visible =
    filter === 'carry'
      ? data.carryForward
      : filter === 'all'
        ? data.rows
        : filter === 'outside-program'
          ? outside
          : exceptions;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Period reconciliation</h2>
        <p className="text-sm text-gray-500">
          One row per booking in the loaded travel window. Unresolved reviews
          persist across periods. Older carry-forward covers previously reviewed
          bookings and unpaid statement allocations—not every unreviewed
          historical trip.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 rounded-lg border bg-white p-4 text-sm">
        <p>
          <strong>{data.rows.length}</strong> bookings in this period
        </p>
        <p>
          <strong>{exceptions.length}</strong> exceptions in this period
        </p>
        <p>
          <strong>{outside.length}</strong> outside the agency program
        </p>
      </div>
      <ul className="text-sm space-y-1">
        <li>
          {data.health.liveAvailable ? '✓' : '⚠'} Complete period Moovs read
        </li>
        <li>
          {data.health.workflowAvailable ? '✓' : '⚠'} Agency reviews and
          adjustment ledger loaded
        </li>
        <li>
          {data.health.carryAvailable ? '✓' : '⚠'} Previously reviewed
          carry-forward refresh completed
        </li>
        <li>
          {data.health.timeZone ? '✓' : '⚠'} Operator timezone verified; travel
          dates preserve storage semantics
        </li>
        <li>
          {data.carryForward.length} older reviewed/unpaid bookings remain
          visible
        </li>
      </ul>
      <label className="flex items-start gap-2 rounded-lg border bg-white p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span>
          I reviewed the exceptions and older carry-forward. Only current
          eligible approvals and explicitly included ledger corrections will be
          prepared; unresolved bookings remain unallocated.
        </span>
      </label>
      <label className="text-sm">
        Show
        <select
          className="rounded border bg-white p-2 ml-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="exceptions">Period exceptions</option>
          <option value="all">All period bookings</option>
          <option value="outside-program">Outside agency program</option>
          <option value="carry">
            Older reviewed carry-forward ({data.carryForward.length})
          </option>
        </select>
      </label>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50">
            <tr>
              {['Booking', 'Travel day', 'Agency', 'State', 'Explanation'].map(
                (h) => (
                  <th key={h} className="p-3 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.reservation.moovs_trip_id} className="border-t">
                <td className="p-3">
                  {r.agency && r.attribution && onInspect ? (
                    <button
                      className="text-blue-700 underline"
                      onClick={() => onInspect(r)}
                    >
                      {r.reservation.order_number ??
                        r.reservation.moovs_trip_id}
                    </button>
                  ) : (
                    (r.reservation.order_number ?? r.reservation.moovs_trip_id)
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {reservationTravelDay(r.reservation) ?? 'Unverified'}
                </td>
                <td className="p-3">
                  {r.agency?.name || r.candidateNames.join(', ') || 'Unlinked'}
                </td>
                <td className="p-3">
                  <Badge variant="secondary">{r.state}</Badge>
                </td>
                <td className="p-3 min-w-64">
                  {r.issues.join(' ') ||
                    (r.state === 'approved'
                      ? 'Eligible approval.'
                      : r.state === 'paid'
                        ? 'Frozen paid statement.'
                        : r.state === 'prepared'
                          ? 'Allocated to an unpaid statement.'
                          : 'Review recorded.')}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="p-4 text-gray-500">
                  No bookings in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
