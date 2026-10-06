import { reservationTravelDay } from '../../lib/operator-time';
import { useState } from 'react';
import type {
  Agency,
  Agent,
  Reservation,
  ReservationAttribution,
} from '../../types/commission';
import type { CommissionReview, WorkflowEvent } from '../../types/workflow';
import type { RouteRateConfig } from '../../types/commissionOperator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  commissionBaseAmount,
  resolveCommissionRate,
} from '../../lib/commission-calc';
import {
  agentMatch,
  commissionFingerprint,
  commissionState,
  eligibilityIssues,
} from '../../lib/commission-workflow';
import { operatorReservationUrl } from '../../lib/moovs-links';
import { saveWorkflow } from '../../services/workflowService';
import { toast } from 'sonner';
const money = (n: number) => `$${Number(n).toFixed(2)}`;
interface Props {
  reservation: Reservation;
  attribution: ReservationAttribution;
  agency: Agency;
  agents: Agent[];
  config?: RouteRateConfig | null;
  review?: CommissionReview;
  events?: WorkflowEvent[];
  operatorId?: string;
  readOnly?: boolean;
  stateOverride?: string;
  expectedDate?: string | null;
  settled?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onQuestion?: (message: string) => Promise<void>;
}
export function CommissionDetail({
  reservation: r,
  attribution: a,
  agency,
  agents,
  config,
  review,
  events = [],
  operatorId,
  readOnly,
  stateOverride,
  expectedDate,
  settled,
  onClose,
  onSaved,
  onQuestion,
}: Props) {
  const [reason, setReason] = useState(''),
    [expected, setExpected] = useState(review?.expected_payment_date ?? ''),
    [busy, setBusy] = useState(false);
  const match = agentMatch(r, agents),
    state =
      stateOverride ??
      commissionState(r, agency, agents, review, settled, config),
    issues = eligibilityIssues(r, agency, agents);
  const link = operatorId ? operatorReservationUrl(r) : null;
  const rateSource =
    a.rule_source ??
    (settled
      ? 'Finalized settlement rate'
      : resolveCommissionRate(r, agency, config).source);
  async function act(status: 'approved' | 'held' | 'rejected' | 'correction') {
    try {
      setBusy(true);
      await saveWorkflow(status === 'correction' ? 'correction' : 'review', {
        operator_id: operatorId,
        agency_id: agency.id,
        moovs_trip_id: r.moovs_trip_id,
        status,
        reason,
        fingerprint: commissionFingerprint(
          r,
          agency,
          match.agent?.id ?? null,
          config,
        ),
        expected_payment_date: expected || null,
      });
      toast.success('Commission record saved');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  async function question() {
    try {
      setBusy(true);
      await onQuestion?.(reason);
      toast.success(
        'Question recorded for operator review. No email was sent.',
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save question');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        style={{ maxWidth: '42rem' }}
      >
        <DialogHeader>
          <DialogTitle>Commission · {r.order_number ?? 'Booking'}</DialogTitle>
          <DialogDescription>
            Partner credit and calculation—not customer billing.
          </DialogDescription>
        </DialogHeader>
        <Badge variant="secondary" className="w-fit">
          {state.replace(/-/g, ' ')}
        </Badge>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
          {[
            ['Agency / Company', agency.name],
            [
              'Agent / Booking Contact',
              agents.find((ag) => ag.id === a.agent_id)?.name ??
                r.booking_contact_name ??
                'Agency-level booking',
            ],
            ['Passenger', r.passenger_name ?? 'Not listed'],
            ['Travel date', reservationTravelDay(r) ?? 'Not listed'],
            [
              'Calculation base',
              `${a.commission_base.replace(/_/g, ' ')} · ${money(commissionBaseAmount(r, a.commission_base))}`,
            ],
            [
              'Applied rate',
              `${a.commission_rate}${a.commission_type === 'percent' ? '%' : ' flat'}`,
            ],
            ['Commission', money(a.commission_amount)],
            ['Rate source', rateSource],
            [
              'Expected payment date',
              expectedDate ?? review?.expected_payment_date ?? 'Not scheduled',
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500">{label}</dt>
              <dd className="mt-1 break-words font-medium text-gray-900">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {operatorId && (
          <>
            <p className="text-xs text-gray-500">
              Agent match: {match.method ?? 'unmapped'} · Passenger identity is
              never used for partner credit.
            </p>
            {match.issue && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                {match.issue} Agency-level settlement can still be valid when no
                individual agent is mapped.
              </p>
            )}
            {issues.length > 0 && !settled && (
              <ul className="list-disc rounded-md bg-amber-50 px-6 py-3 text-sm text-amber-900">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {link ? (
              <Button asChild variant="outline">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  Open trip in Moovs ↗
                </a>
              </Button>
            ) : (
              <p className="text-xs text-gray-500">
                Moovs reservation link unavailable for this record type or
                missing request ID.
              </p>
            )}
          </>
        )}
        {review && (
          <p className="text-sm text-gray-600">
            Review: {review.reason} ·{' '}
            {new Date(review.updated_at).toLocaleString()}
          </p>
        )}
        {operatorId && (
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-semibold text-sm">
              {settled ? 'Record a correction' : 'Review commission'}
            </h3>
            <label className="block text-sm" htmlFor="review-reason">
              {settled
                ? 'Correction note (original statement stays unchanged)'
                : 'Reason'}
              <Textarea
                id="review-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </label>
            {!settled && (
              <label className="block text-sm" htmlFor="expected-date">
                Expected payment date (optional)
                <Input
                  id="expected-date"
                  type="date"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {settled ? (
                <Button
                  disabled={readOnly || busy || reason.trim().length < 3}
                  onClick={() => act('correction')}
                >
                  Record correction note
                </Button>
              ) : (
                <>
                  <Button
                    disabled={
                      readOnly ||
                      busy ||
                      reason.trim().length < 3 ||
                      issues.length > 0
                    }
                    onClick={() => act('approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={readOnly || busy || reason.trim().length < 3}
                    onClick={() => act('held')}
                  >
                    Hold
                  </Button>
                  <Button
                    variant="outline"
                    disabled={readOnly || busy || reason.trim().length < 3}
                    onClick={() => act('rejected')}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
            {readOnly && (
              <p className="text-xs text-gray-500">
                Read-only preview; no changes saved.
              </p>
            )}
          </section>
        )}
        {onQuestion && (
          <section className="border-t pt-4 space-y-3">
            <label className="block text-sm" htmlFor="commission-question">
              Question this commission
              <Textarea
                id="commission-question"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </label>
            <Button
              disabled={readOnly || busy || reason.trim().length < 3}
              onClick={question}
            >
              Submit for review
            </Button>
          </section>
        )}
        {operatorId && events.length > 0 && (
          <section className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-2">History</h3>
            <ul className="space-y-2 text-xs text-gray-600">
              {events
                .filter((e) => e.moovs_trip_id === r.moovs_trip_id)
                .slice(0, 20)
                .map((e) => (
                  <li key={e.id}>
                    {e.action} · {e.actor} ·{' '}
                    {new Date(e.created_at).toLocaleString()}
                    <p className="text-gray-900">{e.reason}</p>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
