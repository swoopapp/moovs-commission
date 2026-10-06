import { useRef, useState } from 'react';
import type { Agency, Payout } from '../../types/commission';
import type { CommissionAdjustment } from '../../types/workflow';
import {
  createCommissionAdjustment,
  cancelCommissionAdjustment,
} from '../../services/workflowService';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
export function CommissionAdjustments({
  agency,
  operatorId,
  payouts,
  adjustments,
  readOnly = false,
  onSaved,
}: {
  agency: Agency;
  operatorId: string;
  payouts: Payout[];
  adjustments: CommissionAdjustment[];
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [source, setSource] = useState(''),
    [trip, setTrip] = useState(''),
    [amount, setAmount] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  const keys = useRef(new Map<string, string>());
  const eligible = payouts.filter(
    (p) => p.status === 'paid' && p.statement_snapshot,
  );
  const origin = eligible.find((p) => p.id === source);
  const value = Number(amount),
    valid =
      !!origin &&
      Number.isFinite(value) &&
      value !== 0 &&
      Math.abs(value) <= 1000000 &&
      Math.abs(value * 100 - Math.round(value * 100)) < 0.000001 &&
      reason.trim().length >= 3;
  async function save() {
    if (readOnly || busy || !valid) return;
    const payload = {
      operator_id: operatorId,
      agency_id: agency.id,
      source_payout_id: source,
      moovs_trip_id: trip || null,
      amount: value,
      reason: reason.trim(),
    };
    const signature = JSON.stringify(payload);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    try {
      setBusy(true);
      await createCommissionAdjustment({ ...payload, request_key: key });
      keys.current.delete(signature);
      setAmount('');
      setReason('');
      toast.success(
        'Commission correction queued. Original statement unchanged.',
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add correction.');
    } finally {
      setBusy(false);
    }
  }
  async function cancel(a: CommissionAdjustment) {
    if (readOnly || busy) return;
    const explanation = window.prompt(
      'Cancel this unapplied correction? Explain why (history is retained):',
    );
    if (!explanation?.trim()) return;
    try {
      setBusy(true);
      await cancelCommissionAdjustment(a.id, {
        agency_id: agency.id,
        operator_id: operatorId,
        reason: explanation,
      });
      toast.success('Pending correction cancelled; history retained.');
      onSaved();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not cancel correction.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-lg border bg-white p-4"
      aria-label={`${agency.name} commission corrections`}
    >
      <div>
        <h2 className="text-lg font-semibold">Commission correction ledger</h2>
        <p className="mt-1 text-sm text-gray-500">
          Correct a paid statement without rewriting it. Positive amounts credit
          the agency; negative amounts reduce its next commission settlement.
          Apply pending rows in month-end settlement. No customer charges,
          refunds or bank transfers. These are agency-level corrections, not
          automatic agent allocations.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Original paid statement
          <select
            className="mt-1 w-full rounded-md border bg-white p-2"
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              setTrip('');
            }}
          >
            <option value="">Choose a paid statement</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_start.slice(0, 10)} – {p.period_end.slice(0, 10)} ·{' '}
                {p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Booking reference (optional)
          <select
            className="mt-1 w-full rounded-md border bg-white p-2"
            value={trip}
            disabled={busy || !origin}
            onChange={(e) => setTrip(e.target.value)}
          >
            <option value="">Agency-level correction</option>
            {origin?.statement_snapshot?.lines.map((l) => (
              <option key={l.moovs_trip_id} value={l.moovs_trip_id}>
                {l.order_number ?? l.moovs_trip_id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Signed commission amount (USD)
          <Input
            type="number"
            step="0.01"
            min="-1000000"
            max="1000000"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. -25.00"
          />
        </label>
        <label className="text-sm">
          Required operator reason
          <Textarea
            maxLength={2000}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this commission correction is needed"
          />
        </label>
      </div>
      <Button disabled={readOnly || busy || !valid} onClick={save}>
        Queue commission correction
      </Button>
      {!eligible.length && (
        <p className="text-sm text-gray-500">
          A paid statement with a finalized snapshot is required. Void an unpaid
          statement instead of correcting it.
        </p>
      )}
      <div className="space-y-2">
        {!adjustments.length && (
          <p className="text-sm text-gray-500">
            No commission corrections recorded.
          </p>
        )}
        {adjustments.map((a) => (
          <article key={a.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <strong className="tabular-nums">
                {Number(a.amount).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  signDisplay: 'always',
                })}
              </strong>
              <span>
                {a.cancelled_at
                  ? 'Cancelled'
                  : a.applied_payout_id
                    ? 'Applied to settlement'
                    : 'Pending next settlement'}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{a.reason}</p>
            <p className="mt-1 break-words text-xs text-gray-500">
              Correction {a.id} · Original statement {a.source_payout_id}
              {a.moovs_trip_id ? ` · Booking ${a.moovs_trip_id}` : ''}
              {a.applied_payout_id
                ? ` · Applied statement ${a.applied_payout_id}`
                : ''}{' '}
              · Recorded by {a.actor}
            </p>
            {!a.cancelled_at && !a.applied_payout_id && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={readOnly || busy}
                onClick={() => cancel(a)}
              >
                Cancel pending correction
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
