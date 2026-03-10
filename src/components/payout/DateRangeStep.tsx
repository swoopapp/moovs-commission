import { useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Reservation, ReservationAttribution } from '../../types/commission';
import { fetchAttributionsByAgency } from '../../services/attributionService';
import { fetchReservations } from '../../services/reservationService';
import { fetchAllPayoutReservations } from '../../services/payoutService';

export interface TripWithCommission {
  reservation: Reservation;
  attribution: ReservationAttribution;
}

interface DateRangeStepProps {
  operatorId: string;
  agencyId: string;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  trips: TripWithCommission[];
  onTripsLoaded: (trips: TripWithCommission[]) => void;
  onNext: () => void;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DateRangeStep({
  operatorId,
  agencyId,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  trips,
  onTripsLoaded,
  onNext,
}: DateRangeStepProps) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadTrips() {
    if (!dateFrom || !dateTo) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch attributions, reservations, and already-paid reservation IDs in parallel
      const [attributions, reservations, payoutReservations] = await Promise.all([
        fetchAttributionsByAgency(agencyId),
        fetchReservations(operatorId, { dateFrom, dateTo }),
        fetchAllPayoutReservations(agencyId),
      ]);

      // Build set of reservation IDs already in a payout
      const paidResIds = new Set(payoutReservations.map((pr) => pr.reservation_id));

      // Build a map of reservation_id -> attribution for this agency
      const attrByResId = new Map(attributions.map((a) => [a.reservation_id, a]));

      // Filter: reservations that have an attribution for this agency AND are not in a payout
      const result: TripWithCommission[] = [];
      for (const res of reservations) {
        const attr = attrByResId.get(res.id);
        if (attr && !paidResIds.has(res.id)) {
          result.push({ reservation: res, attribution: attr });
        }
      }

      // Sort by pickup date ascending
      result.sort((a, b) => {
        const dateA = a.reservation.pickup_date || '';
        const dateB = b.reservation.pickup_date || '';
        return dateA.localeCompare(dateB);
      });

      onTripsLoaded(result);
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load trips:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }

  const totalCommission = trips.reduce((sum, t) => sum + t.attribution.commission_amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date-from">From</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                onDateFromChange(e.target.value);
                setLoaded(false);
              }}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-to">To</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                onDateToChange(e.target.value);
                setLoaded(false);
              }}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Button
        onClick={handleLoadTrips}
        disabled={!dateFrom || !dateTo || loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Trips...
          </>
        ) : (
          'Load Trips'
        )}
      </Button>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {loaded && (
        <>
          <Separator />
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Unpaid trips found</span>
              <span className="font-semibold">{trips.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total commission</span>
              <span className="font-semibold">{formatCurrency(totalCommission)}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onNext} disabled={trips.length === 0}>
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
