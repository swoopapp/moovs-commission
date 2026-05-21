import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { TripWithCommission } from './DateRangeStep';
import type { Agent } from '../../types/commission';

interface TripSelectionStepProps {
  trips: TripWithCommission[];
  agents: Agent[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  adjustments: number;
  onAdjustmentsChange: (val: number) => void;
  onBack: () => void;
  onNext: () => void;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TripSelectionStep({
  trips,
  agents,
  selectedIds,
  onSelectedIdsChange,
  adjustments,
  onAdjustmentsChange,
  onBack,
  onNext,
}: TripSelectionStepProps) {
  const [adjustmentInput, setAdjustmentInput] = useState(adjustments === 0 ? '' : String(adjustments));
  const [agentFilter, setAgentFilter] = useState('all');

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const visibleTrips = useMemo(() => {
    if (agentFilter === 'all') return trips;
    if (agentFilter === 'unassigned') return trips.filter((trip) => !trip.attribution.agent_id);
    return trips.filter((trip) => trip.attribution.agent_id === agentFilter);
  }, [trips, agentFilter]);

  const visibleSelectedCount = visibleTrips.filter((t) => selectedIds.has(t.reservation.id)).length;
  const allSelected = visibleTrips.length > 0 && visibleSelectedCount === visibleTrips.length;
  const someSelected = visibleSelectedCount > 0 && visibleSelectedCount < visibleTrips.length;

  function toggleAll() {
    const next = new Set(selectedIds);
    if (allSelected) {
      visibleTrips.forEach((trip) => next.delete(trip.reservation.id));
    } else {
      visibleTrips.forEach((trip) => next.add(trip.reservation.id));
    }
    onSelectedIdsChange(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectedIdsChange(next);
  }

  const selectedTrips = trips.filter((t) => selectedIds.has(t.reservation.id));
  const totalRevenue = selectedTrips.reduce((sum, t) => sum + t.reservation.total_amount, 0);
  const totalCommission = selectedTrips.reduce((sum, t) => sum + t.attribution.commission_amount, 0);
  const netPayout = totalCommission + adjustments;

  function handleAdjustmentChange(val: string) {
    setAdjustmentInput(val);
    const parsed = parseFloat(val);
    onAdjustmentsChange(isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100);
  }

  return (
    <div className="space-y-4">
      {/* Scrollable trip table */}
      <div className="flex justify-end">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.filter((agent) => agent.status === 'active').map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTrips.map((t) => (
                <TableRow key={t.reservation.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(t.reservation.id)}
                      onCheckedChange={() => toggleOne(t.reservation.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {t.reservation.order_number || t.reservation.confirmation_number || '--'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(t.reservation.pickup_date)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.attribution.agent_id ? agentMap.get(t.attribution.agent_id)?.name ?? '--' : '--'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.reservation.passenger_name || '--'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(t.reservation.total_amount)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(t.attribution.commission_amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Separator />

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Selected trips</span>
          <span className="font-semibold">{selectedTrips.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total revenue</span>
          <span className="font-semibold">{formatCurrency(totalRevenue)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total commission</span>
          <span className="font-semibold">{formatCurrency(totalCommission)}</span>
        </div>
      </div>

      {/* Adjustments */}
      <div className="space-y-1.5">
        <Label htmlFor="adjustments">Adjustments (+/-)</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-sm text-gray-400">$</span>
          <Input
            id="adjustments"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={adjustmentInput}
            onChange={(e) => handleAdjustmentChange(e.target.value)}
            className="pl-7"
          />
        </div>
        <p className="text-xs text-gray-500">Use negative values for deductions</p>
      </div>

      {/* Net payout */}
      <div className="flex justify-between items-center bg-gray-900 text-white rounded-lg px-4 py-3">
        <span className="text-sm font-medium">Net Payout</span>
        <span className="text-lg font-bold">{formatCurrency(netPayout)}</span>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} disabled={selectedTrips.length === 0}>
          Next
        </Button>
      </div>
    </div>
  );
}
