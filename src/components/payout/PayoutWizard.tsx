import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { DateRangeStep, TripWithCommission } from './DateRangeStep';
import { TripSelectionStep } from './TripSelectionStep';
import { PaymentDetailsStep } from './PaymentDetailsStep';
import { createPayout, createPayoutReservations } from '../../services/payoutService';
import { toast } from 'sonner';
import type { PayoutMethod, PayoutStatus } from '../../types/commission';

interface PayoutWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operatorId: string;
  agencyId: string;
  onPayoutCreated: () => void;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

const STEP_LABELS = ['Date Range', 'Select Trips', 'Payment Details'];

export function PayoutWizard({
  open,
  onOpenChange,
  operatorId,
  agencyId,
  onPayoutCreated,
}: PayoutWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(toISODate(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(toISODate(now));
  const [trips, setTrips] = useState<TripWithCommission[]>([]);

  // Step 2 state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState(0);

  // Step 3 state
  const [method, setMethod] = useState<PayoutMethod>('ACH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(toISODate(now));
  const [notes, setNotes] = useState('');

  // Computed values
  const selectedTrips = trips.filter((t) => selectedIds.has(t.reservation.id));
  const totalRevenue = selectedTrips.reduce((sum, t) => sum + t.reservation.total_amount, 0);
  const totalCommission = selectedTrips.reduce((sum, t) => sum + t.attribution.commission_amount, 0);
  const netPayout = totalCommission + adjustments;

  const resetState = useCallback(() => {
    setStep(1);
    const resetNow = new Date();
    const resetThirtyAgo = new Date();
    resetThirtyAgo.setDate(resetThirtyAgo.getDate() - 30);
    setDateFrom(toISODate(resetThirtyAgo));
    setDateTo(toISODate(resetNow));
    setTrips([]);
    setSelectedIds(new Set());
    setAdjustments(0);
    setMethod('ACH');
    setReferenceNumber('');
    setPaymentDate(toISODate(resetNow));
    setNotes('');
  }, []);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetState();
    }
    onOpenChange(isOpen);
  }

  function handleTripsLoaded(loadedTrips: TripWithCommission[]) {
    setTrips(loadedTrips);
    // Pre-select all trips
    setSelectedIds(new Set(loadedTrips.map((t) => t.reservation.id)));
  }

  async function handleSave(status: PayoutStatus) {
    try {
      const payout = await createPayout({
        operator_id: operatorId,
        agency_id: agencyId,
        period_start: dateFrom,
        period_end: dateTo,
        total_trips: selectedTrips.length,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_commission: Math.round(totalCommission * 100) / 100,
        adjustments: Math.round(adjustments * 100) / 100,
        net_payout: Math.round(netPayout * 100) / 100,
        method,
        reference_number: referenceNumber || null,
        status,
        notes: notes || null,
        date_paid: status === 'paid' ? paymentDate : null,
      });

      // Create junction rows
      await createPayoutReservations(
        payout.id,
        selectedTrips.map((t) => t.reservation.id),
      );

      toast.success(
        status === 'paid'
          ? 'Payout created and marked as paid'
          : 'Payout draft saved',
      );

      handleOpenChange(false);
      onPayoutCreated();
    } catch (err) {
      console.error('Failed to create payout:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create payout');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent style={{ maxWidth: '40rem' }}>
        <DialogHeader>
          <DialogTitle>Create Payout</DialogTitle>
          <DialogDescription>
            {STEP_LABELS[step - 1]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                  s === step
                    ? 'bg-gray-900 text-white'
                    : s < step
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {s < step ? '\u2713' : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 ${s < step ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 1 && (
          <DateRangeStep
            operatorId={operatorId}
            agencyId={agencyId}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            trips={trips}
            onTripsLoaded={handleTripsLoaded}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <TripSelectionStep
            trips={trips}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            adjustments={adjustments}
            onAdjustmentsChange={setAdjustments}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <PaymentDetailsStep
            method={method}
            onMethodChange={setMethod}
            referenceNumber={referenceNumber}
            onReferenceNumberChange={setReferenceNumber}
            paymentDate={paymentDate}
            onPaymentDateChange={setPaymentDate}
            notes={notes}
            onNotesChange={setNotes}
            selectedTripCount={selectedTrips.length}
            totalRevenue={totalRevenue}
            totalCommission={totalCommission}
            adjustments={adjustments}
            netPayout={netPayout}
            onBack={() => setStep(2)}
            onSave={handleSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
