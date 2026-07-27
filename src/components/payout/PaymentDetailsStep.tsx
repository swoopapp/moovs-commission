import { useRef, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { PayoutMethod, PayoutStatus } from '../../types/commission';

interface PaymentDetailsStepProps {
  method: PayoutMethod;
  onMethodChange: (val: PayoutMethod) => void;
  referenceNumber: string;
  onReferenceNumberChange: (val: string) => void;
  paymentDate: string;
  onPaymentDateChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  // Summary data
  selectedTripCount: number;
  totalRevenue: number;
  totalCommission: number;
  adjustments: number;
  netPayout: number;
  // Actions
  onBack: () => void;
  onSave: (status: PayoutStatus) => Promise<void>;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYMENT_METHODS: PayoutMethod[] = ['ACH', 'Wire', 'Check', 'Cash', 'Other'];

export function PaymentDetailsStep({
  method,
  onMethodChange,
  referenceNumber,
  onReferenceNumberChange,
  paymentDate,
  onPaymentDateChange,
  notes,
  onNotesChange,
  selectedTripCount,
  totalRevenue,
  totalCommission,
  adjustments,
  netPayout,
  onBack,
  onSave,
}: PaymentDetailsStepProps) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSave(status: PayoutStatus) {
    if (savingRef.current) return;
    if (status === 'paid' && !paymentDate) return;
    if (
      status === 'paid'
      && !window.confirm(`Mark this ${formatCurrency(netPayout)} payout for ${selectedTripCount} trip${selectedTripCount === 1 ? '' : 's'} as paid?`)
    ) {
      return;
    }
    try {
      savingRef.current = true;
      setSaving(true);
      await onSave(status);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payment-method">Payment Method</Label>
          <Select value={method} onValueChange={(val) => onMethodChange(val as PayoutMethod)}>
            <SelectTrigger id="payment-method">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ref-number">Reference Number</Label>
          <Input
            id="ref-number"
            placeholder="e.g. CHK-1234"
            value={referenceNumber}
            onChange={(e) => onReferenceNumberChange(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-date">Payment Date</Label>
        <Input
          id="payment-date"
          type="date"
          value={paymentDate}
          onChange={(e) => onPaymentDateChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Optional notes about this payout..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
        />
      </div>

      <Separator />

      {/* Payout summary card */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Payout Summary</h4>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Selected trips</span>
          <span className="font-medium">{selectedTripCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total revenue</span>
          <span className="font-medium">{formatCurrency(totalRevenue)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total commission</span>
          <span className="font-medium">{formatCurrency(totalCommission)}</span>
        </div>
        {adjustments !== 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Adjustments</span>
            <span className={`font-medium ${adjustments < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {adjustments > 0 ? '+' : ''}{formatCurrency(adjustments)}
            </span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between text-base">
          <span className="font-semibold text-gray-900">Net Payout</span>
          <span className="font-bold text-gray-900">{formatCurrency(netPayout)}</span>
        </div>
      </div>

      {/* Navigation + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => handleSave('draft')}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save as Draft
          </Button>
          <Button
            onClick={() => handleSave('paid')}
            disabled={saving || !paymentDate}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Mark as Paid
          </Button>
        </div>
      </div>
    </div>
  );
}
