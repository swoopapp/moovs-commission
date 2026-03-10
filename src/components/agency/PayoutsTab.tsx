import { Payout } from '../../types/commission';
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
import { Plus } from 'lucide-react';

interface PayoutsTabProps {
  payouts: Payout[];
  onCreatePayout: () => void;
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

export function PayoutsTab({ payouts, onCreatePayout }: PayoutsTabProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 font-medium">{payouts.length} payouts</p>
        <Button size="sm" className="gap-1.5" onClick={onCreatePayout}>
          <Plus className="h-4 w-4" />
          Create Payout
        </Button>
      </div>

      {payouts.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          No payouts yet. Create your first payout to track commission payments.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Adjustments</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Ref #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{formatPeriod(p.period_start, p.period_end)}</TableCell>
                  <TableCell className="text-right">{p.total_trips}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.total_revenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.total_commission)}</TableCell>
                  <TableCell className={`text-right${p.adjustments < 0 ? ' text-red-600' : ''}`}>
                    {p.adjustments !== 0 ? formatCurrency(p.adjustments) : '--'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(p.net_payout)}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell>{p.reference_number || '--'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={PAYOUT_STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(p.date_paid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
