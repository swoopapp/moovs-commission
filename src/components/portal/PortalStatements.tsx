import { useMemo } from 'react';
import { ReservationAttribution, Reservation, Payout } from '../../types/commission';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';

interface PortalStatementsProps {
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  payouts: Payout[];
  agencyName: string;
  paymentTerms: string | null;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
};

function exportCSV(reservations: Reservation[], attributions: ReservationAttribution[], agencyName: string) {
  const reservationMap = new Map<string, Reservation>();
  reservations.forEach((r) => reservationMap.set(r.id, r));

  const csvRows = [
    ['Date', 'Passenger', 'Trip Type', 'Pickup', 'Dropoff', 'Revenue', 'Commission', 'Status'].join(','),
  ];

  for (const attr of attributions) {
    const r = reservationMap.get(attr.reservation_id);
    if (!r) continue;
    const row = [
      r.pickup_date || '',
      `"${(r.passenger_name || '').replace(/"/g, '""')}"`,
      r.trip_type || '',
      `"${(r.pickup_location || '').replace(/"/g, '""')}"`,
      `"${(r.dropoff_location || '').replace(/"/g, '""')}"`,
      r.total_amount.toFixed(2),
      attr.commission_amount.toFixed(2),
      r.trip_status || '',
    ];
    csvRows.push(row.join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.download = `commission-statement-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PortalStatements({
  reservations,
  attributions,
  payouts,
  agencyName,
  paymentTerms,
}: PortalStatementsProps) {
  const totalCommission = useMemo(
    () => attributions.reduce((sum, a) => sum + a.commission_amount, 0),
    [attributions],
  );

  const totalPaid = useMemo(
    () =>
      payouts
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + p.net_payout, 0),
    [payouts],
  );

  const outstandingBalance = totalCommission - totalPaid;

  const recentPayouts = useMemo(
    () => payouts.filter((p) => p.status === 'paid').slice(0, 10),
    [payouts],
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">Statements</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outstanding Balance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-700">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-bold text-gray-900">{formatCurrency(outstandingBalance)}</p>
            {paymentTerms && (
              <p className="text-sm text-gray-500">Payment Terms: {paymentTerms}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => exportCSV(reservations, attributions, agencyName)}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </CardContent>
        </Card>

        {/* Recent Payouts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-700">Recent Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayouts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No payouts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Trips</TableHead>
                      <TableHead className="text-right">Net Payout</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatPeriod(p.period_start, p.period_end)}
                        </TableCell>
                        <TableCell className="text-right">{p.total_trips}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(p.net_payout)}
                        </TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={PAYOUT_STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(p.date_paid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
