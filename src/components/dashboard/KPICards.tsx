import type { FinanceWorkspace } from '../../services/financeWorkspaceService';
import { Card, CardContent } from '../ui/card';
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export function KPICards({ finance }: { finance: FinanceWorkspace }) {
  const { totals: t } = finance;
  const outside = finance.rows.filter(
    (r) => r.state === 'outside-program',
  ).length;
  const unresolved = Math.max(0, t.unknownBookings - outside);
  const items = [
    ['Calculated', t.calculated, 'Known booking calculations—not all payable'],
    ['Projected', t.projected, 'Not yet eligible or completion unverified'],
    ['Approved', t.approved, 'Eligible and not allocated to a statement'],
    ['Held', t.held, 'Operator hold; not payable'],
    [
      'Prepared',
      t.prepared,
      'Frozen booking commission awaiting external payment',
    ],
    ['Paid externally', t.paid, 'Frozen booking commission in paid statements'],
  ] as const;
  return (
    <section className="space-y-3" aria-label="Dashboard metrics">
      <div>
        <h2 className="font-semibold">Booking commission lifecycle</h2>
        <p className="text-sm text-gray-500">
          Travel dates {finance.from} through {finance.to}. Calculated
          commissions are not a balance owed.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value, description]) => (
          <Card key={label} className="py-4">
            <CardContent>
              <dl>
                <dt className="text-sm font-medium text-gray-600">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {money(value)}
                </dd>
                <dd className="mt-1 text-xs text-gray-500">{description}</dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {t.needsReview !== 0 && (
          <a
            href="#/review"
            className="font-medium text-blue-600 hover:underline"
          >
            {money(t.needsReview)} needs review
          </a>
        )}
        {unresolved > 0 && (
          <a
            href="#/review"
            className="font-medium text-amber-800 hover:underline"
          >
            {unresolved.toLocaleString()}{' '}
            {unresolved === 1 ? 'booking needs' : 'bookings need'} attention
          </a>
        )}
        {finance.pendingAdjustments !== 0 && (
          <a href="#/settlement" className="text-blue-600 hover:underline">
            {money(finance.pendingAdjustments)} pending commission corrections
          </a>
        )}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-900">
            Calculation details
          </summary>
          <div className="mt-2 space-y-1">
            <p>
              {outside.toLocaleString()} bookings outside the agency program;{' '}
              {unresolved.toLocaleString()} other bookings excluded from known
              totals.
            </p>
            <p>
              Rejected: {money(t.rejected)}. Pending commission corrections:{' '}
              {money(finance.pendingAdjustments)}, separate from booking
              amounts.
            </p>
            <p>
              {finance.carryForward.length} older reviewed/unpaid bookings are
              outside this window. Month-end reconciliation includes
              period-specific carry-forward.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
