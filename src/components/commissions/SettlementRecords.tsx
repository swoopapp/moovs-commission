import { useState } from 'react';
import type { Payout } from '../../types/commission';
import { downloadStatement } from '../../lib/statement-export';
import {
  recordExternalPayment,
  voidSettlement,
} from '../../services/workflowService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from 'sonner';
interface Props {
  payouts: Payout[];
  operatorId?: string;
  readOnly?: boolean;
  onSaved?: () => void;
}
export function SettlementRecords({
  payouts,
  operatorId,
  readOnly,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<Payout | null>(null),
    [date, setDate] = useState(''),
    [method, setMethod] = useState('Check'),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    if (!selected) return;
    try {
      setBusy(true);
      await recordExternalPayment(selected.id, {
        operator_id: operatorId,
        date_paid: date,
        method,
        reference_number: reference,
      });
      toast.success('External payment recorded. No money moved.');
      setSelected(null);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  async function voidRecord(p: Payout) {
    const reason = window.prompt(
      'Void this unpaid settlement? Its snapshot stays in history. Explain why:',
    );
    if (!reason?.trim()) return;
    try {
      setBusy(true);
      await voidSettlement(p.id, { operator_id: operatorId, reason });
      toast.success(
        'Statement voided. Re-review bookings before preparing a replacement.',
      );
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not void');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Settlement statements</h2>
      <p className="text-sm text-gray-500">
        Frozen booking detail and rates. Payment entries are records of payments
        made outside this portal.
      </p>
      {!payouts.length && (
        <p className="text-sm text-gray-500">No settlement records yet.</p>
      )}
      {payouts.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4"
        >
          <div>
            <p className="font-medium text-sm">
              {p.period_start.slice(0, 10)} – {p.period_end.slice(0, 10)}
            </p>
            <p className="text-sm text-gray-500">
              {p.status} · {p.total_trips} bookings · $
              {Number(p.net_payout).toFixed(2)}
              {p.date_paid
                ? ` · Paid externally ${p.date_paid.slice(0, 10)}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.statement_snapshot ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadStatement(p, 'pdf')}
                >
                  PDF statement
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadStatement(p, 'csv')}
                >
                  CSV statement
                </Button>
              </>
            ) : (
              <span className="text-xs text-gray-500">
                Legacy record · no detailed snapshot
              </span>
            )}
            {operatorId &&
              !['paid', 'void'].includes(p.status) &&
              p.statement_snapshot && (
                <>
                  <Button
                    size="sm"
                    disabled={readOnly || busy}
                    onClick={() => {
                      setSelected(p);
                      setDate('');
                      setReference('');
                    }}
                  >
                    Record external payment
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={readOnly || busy}
                    onClick={() => voidRecord(p)}
                  >
                    Void prepared record
                  </Button>
                </>
              )}
          </div>
        </div>
      ))}
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setSelected(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record payment made elsewhere</DialogTitle>
              <DialogDescription>
                No bank transfer will be initiated. Confirm the payment has
                already been made outside this portal.
              </DialogDescription>
            </DialogHeader>
            <label className="text-sm">
              External payment date
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full h-10 border rounded-md bg-white px-2"
              >
                {['Check', 'Cash', 'ACH', 'Wire', 'Other'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              External reference
              <Input
                value={reference}
                maxLength={200}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !date || !reference.trim()}
              onClick={save}
            >
              Confirm external payment record
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
