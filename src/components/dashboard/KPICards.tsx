import type { FinanceWorkspace } from '../../services/financeWorkspaceService';
import { Card, CardContent } from '../ui/card';
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export function KPICards({ finance }: { finance: FinanceWorkspace }) {
  const { totals: t } = finance;
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
          Travel dates {finance.from} through {finance.to}. Each booking
          occupies one state; calculated is the sum of known states, not a
          balance owed.
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
      <p className="text-sm text-gray-600">
        Needs review / recheck: {money(t.needsReview)} · Rejected:{' '}
        {money(t.rejected)} · {t.unknownBookings} bookings excluded from known
        totals. Pending commission corrections:{' '}
        {money(finance.pendingAdjustments)} (separate from booking amounts).{' '}
        {finance.carryForward.length} older reviewed/unpaid bookings are
        outside this dashboard window. Use month-end reconciliation for
        period-specific carry-forward.
      </p>
    </section>
  );
}
