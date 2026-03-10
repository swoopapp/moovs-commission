import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { Agency, Reservation } from '../../types/commission';
import {
  createAttributions,
  calculateCommission,
  type CreateAttributionInput,
} from '../../services/attributionService';

interface AttributionReviewProps {
  operatorId: string;
  reservations: Reservation[];
  agencies: Agency[];
  onComplete: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function AttributionReview({
  reservations,
  agencies,
  onComplete,
}: AttributionReviewProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedCount = Object.values(assignments).filter((v) => v && v !== 'skip').length;

  function handleAssign(reservationId: string, agencyId: string) {
    setAssignments((prev) => ({ ...prev, [reservationId]: agencyId }));
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);

    try {
      const inputs: CreateAttributionInput[] = [];

      for (const reservation of reservations) {
        const agencyId = assignments[reservation.id];
        if (!agencyId || agencyId === 'skip') continue;

        const agency = agencies.find((a) => a.id === agencyId);
        if (!agency) continue;

        const commissionAmount = calculateCommission(reservation, agency);

        inputs.push({
          reservation_id: reservation.id,
          agency_id: agency.id,
          agent_id: null,
          commission_rate: agency.commission_rate,
          commission_type: agency.commission_type,
          commission_base: agency.commission_base,
          commission_amount: commissionAmount,
        });
      }

      if (inputs.length > 0) {
        await createAttributions(inputs);
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attributions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {reservations.length} trip{reservations.length !== 1 ? 's' : ''} need manual attribution.
          Select an agency for each or skip.
        </p>
        <span className="text-sm font-medium text-gray-900">
          {assignedCount} assigned
        </span>
      </div>

      <div className="max-h-[400px] overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Order #</TableHead>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Trip Type</TableHead>
              <TableHead className="text-right w-[100px]">Revenue</TableHead>
              <TableHead className="w-[180px]">Agency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((res) => (
              <TableRow key={res.id}>
                <TableCell className="font-mono text-xs">
                  {res.order_number || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {formatDate(res.pickup_date)}
                </TableCell>
                <TableCell className="text-sm">
                  {res.passenger_name || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {res.trip_type || '-'}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatCurrency(res.total_amount)}
                </TableCell>
                <TableCell>
                  <Select
                    value={assignments[res.id] || ''}
                    onValueChange={(val) => handleAssign(res.id, val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select agency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip</SelectItem>
                      {agencies.map((agency) => (
                        <SelectItem key={agency.id} value={agency.id}>
                          {agency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onComplete} disabled={saving}>
          Skip All
        </Button>
        <Button onClick={handleConfirm} disabled={saving || assignedCount === 0}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            `Confirm ${assignedCount} Attribution${assignedCount !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </div>
  );
}
