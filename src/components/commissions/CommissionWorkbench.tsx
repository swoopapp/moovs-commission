import { useEffect, useRef, useState } from 'react';
import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { fetchAgencies } from '../../services/agencyService';
import {
  fetchFinanceWorkspace,
  type FinanceWorkspace,
} from '../../services/financeWorkspaceService';
import { createPayoutFromTrips } from '../../services/payoutService';
import { saveWorkflow } from '../../services/workflowService';
import type { ReconciliationRow } from '../../lib/finance-reconciliation';
import { previousOperatorMonth } from '../../lib/operator-time';
import { validDate } from '../../lib/commission-rules';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { CommissionDetail } from './CommissionDetail';
import { SettlementRecords } from './SettlementRecords';
import { CommissionAdjustments } from './CommissionAdjustments';
import { DataHealth } from './DataHealth';
import { ReconciliationPanel } from './ReconciliationPanel';
import { toast } from 'sonner';
export function CommissionWorkbench({
  mode,
}: {
  mode: 'review' | 'settlement';
}) {
  const operator = useOperator(),
    demo = useIsDemo();
  const initial = () => {
    try {
      return previousOperatorMonth(operator.timeZone ?? '');
    } catch {
      return { from: '', to: '' };
    }
  };
  const [period] = useState(initial),
    [from, setFrom] = useState(period.from),
    [to, setTo] = useState(period.to);
  const [data, setData] = useState<FinanceWorkspace | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [detail, setDetail] = useState<ReconciliationRow | null>(null),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(new Set<string>()),
    [notes, setNotes] = useState(''),
    [result, setResult] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [includeCarry, setIncludeCarry] = useState(false),
    [includeLedger, setIncludeLedger] = useState(false);
  const running = useRef(false),
    generation = useRef(0),
    keys = useRef(new Map<string, string>());
  const rangeValid =
    validDate(from) &&
    validDate(to) &&
    from <= to &&
    Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const stale = !data || data.from !== from || data.to !== to;
  const healthy =
    !!data &&
    data.health.liveAvailable &&
    data.health.workflowAvailable &&
    data.health.carryAvailable &&
    !!data.health.timeZone;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function load() {
    if (!rangeValid || running.current) return;
    const run = ++generation.current;
    running.current = true;
    setBusy(true);
    setError('');
    setAck(false);
    setSelected(new Set());
    setDetail(null);
    try {
      const agencies = await fetchAgencies(operator.operatorId);
      const next = await fetchFinanceWorkspace(operator, agencies, from, to);
      if (generation.current === run) setData(next);
    } catch (e) {
      if (generation.current === run) {
        setData(null);
        setError(
          e instanceof Error ? e.message : 'Could not load commissions.',
        );
      }
    } finally {
      running.current = false;
      if (generation.current === run) setBusy(false);
    }
  }
  const allRows = data ? [...data.rows, ...data.carryForward] : [];
  const approved = (agencyId: string) =>
    allRows.filter(
      (r) =>
        r.agency?.id === agencyId &&
        r.state === 'approved' &&
        r.attribution &&
        (data!.rows.includes(r) || includeCarry),
    );
  const pending = (agencyId: string) =>
    includeLedger
      ? (
          data?.agencies.find((w) => w.agency.id === agencyId)?.workflow
            .adjustments ?? []
        ).filter((a) => !a.cancelled_at && !a.applied_payout_id)
      : [];
  async function prepare() {
    if (
      running.current ||
      stale ||
      !healthy ||
      !ack ||
      !selected.size ||
      demo ||
      !data
    )
      return;
    if (
      !window.confirm(
        `Prepare ${selected.size} agency settlement record(s)? This records commission statements only. No funds move.`,
      )
    )
      return;
    running.current = true;
    setBusy(true);
    const outcomes: string[] = [];
    try {
      for (const w of data.agencies.filter((w) => selected.has(w.agency.id))) {
        const items = approved(w.agency.id),
          adjustments = pending(w.agency.id);
        if (!items.length && !adjustments.length) {
          outcomes.push(`${w.agency.name}: nothing eligible`);
          continue;
        }
        const payload = {
          operator_id: operator.operatorId,
          agency_id: w.agency.id,
          period_start: from,
          period_end: to,
          adjustments: 0,
          adjustment_ids: adjustments.map((a) => a.id).sort(),
          include_carry_forward: includeCarry,
          method: 'Other' as const,
          reference_number: null,
          status: 'draft' as const,
          notes:
            notes ||
            'Reconciliation reviewed; unresolved bookings remain unallocated.',
          date_paid: null,
          items: items
            .map((r) => ({
              moovs_trip_id: r.reservation.moovs_trip_id,
              agent_id: r.attribution!.agent_id,
            }))
            .sort((a, b) => a.moovs_trip_id.localeCompare(b.moovs_trip_id)),
        };
        const signature = JSON.stringify(payload);
        let key = keys.current.get(signature);
        if (!key) {
          key = crypto.randomUUID();
          keys.current.set(signature, key);
        }
        try {
          await createPayoutFromTrips({ ...payload, idempotency_key: key });
          keys.current.delete(signature);
          outcomes.push(
            `${w.agency.name}: prepared (${items.length} bookings, ${adjustments.length} corrections)`,
          );
        } catch (e) {
          outcomes.push(
            `${w.agency.name}: ${e instanceof Error ? e.message : 'failed'}`,
          );
        }
      }
      setResult(outcomes);
    } finally {
      running.current = false;
      setBusy(false);
    }
    await load();
  }
  async function resolve(agencyId: string, id: string) {
    if (demo) return;
    const resolution = window.prompt(
      'Resolution visible to the partner (no email will be sent):',
    );
    if (!resolution?.trim()) return;
    try {
      await saveWorkflow('question-resolution', {
        operator_id: operator.operatorId,
        agency_id: agencyId,
        id,
        resolution,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resolve');
    }
  }
  const detailAgency =
    detail && data?.agencies.find((w) => w.agency.id === detail.agency?.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">
          {mode === 'review' ? 'Commission review' : 'Month-end settlement'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {mode === 'review'
            ? 'Resolve attribution and booking exceptions before commissions become payable.'
            : 'Reconcile the period, then prepare approved bookings and selected commission corrections. Payments happen outside this portal.'}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
        <label className="text-sm">
          Travel from
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setAck(false);
            }}
            disabled={busy}
          />
        </label>
        <label className="text-sm">
          Travel through
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setAck(false);
            }}
            disabled={busy}
          />
        </label>
        <Button onClick={load} disabled={busy || !rangeValid}>
          {busy ? 'Working…' : 'Load period'}
        </Button>
        {data && (
          <p className="text-xs text-gray-500">
            {stale
              ? 'Dates changed—reload before acting.'
              : `${data.agencies.length} agencies · ${data.rows.length} period bookings`}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-800"
        >
          {error} No settlement records were created.
        </p>
      )}
      {data && !stale && (
        <>
          <DataHealth health={data.health} onRefresh={load} busy={busy} />
          <ReconciliationPanel
            data={data}
            onInspect={setDetail}
            acknowledged={ack}
            onAcknowledge={setAck}
          />
          {mode === 'review' ? (
            <>
              <label className="block text-sm">
                Commission state
                <select
                  className="ml-3 rounded-md border bg-white p-2"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    'all',
                    'projected',
                    'needs-review',
                    'approved',
                    'held',
                    'rejected',
                    'needs-recheck',
                    'prepared',
                    'paid',
                    'ambiguous',
                    'outside-program',
                    'unavailable',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      {[
                        'Agency',
                        'Booking',
                        'Booking contact',
                        'Passenger',
                        'Commission',
                        'Review',
                      ].map((h) => (
                        <th key={h} className="p-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows
                      .filter((r) => filter === 'all' || r.state === filter)
                      .map((r) => (
                        <tr
                          key={r.reservation.moovs_trip_id}
                          className="border-t"
                        >
                          <td className="p-3">
                            {r.agency?.name ?? 'Unmatched'}
                          </td>
                          <td className="p-3">
                            {r.agency && r.attribution ? (
                              <button
                                className="text-blue-700 underline"
                                onClick={() => setDetail(r)}
                              >
                                {r.reservation.order_number ?? 'Booking'}
                              </button>
                            ) : (
                              (r.reservation.order_number ?? 'Booking')
                            )}
                          </td>
                          <td className="p-3">
                            {r.reservation.booking_contact_name ??
                              'Agency-level'}
                          </td>
                          <td className="p-3">
                            {r.reservation.passenger_name ?? 'Not listed'}
                          </td>
                          <td className="p-3">
                            {r.attribution
                              ? `$${Number(r.attribution.commission_amount).toFixed(2)}`
                              : 'Unverified'}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary">{r.state}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Partner questions</h2>
                {data.agencies.every((w) => !w.workflow.questions.length) && (
                  <p className="text-sm text-gray-500">
                    No questions in the loaded agencies.
                  </p>
                )}
                {data.agencies.flatMap((w) =>
                  w.workflow.questions.map((q) => (
                    <div key={q.id} className="rounded-lg border bg-white p-4">
                      <p className="font-medium text-sm">
                        {w.agency.name} · {q.status}
                      </p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">
                        {q.message}
                      </p>
                      {q.resolution && (
                        <p className="text-sm text-gray-600 mt-2">
                          Resolution: {q.resolution}
                        </p>
                      )}
                      {q.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={demo || busy || !healthy}
                          onClick={() => resolve(w.agency.id, q.id)}
                        >
                          Resolve question
                        </Button>
                      )}
                    </div>
                  )),
                )}
              </section>
            </>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
                <label className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={includeCarry}
                    disabled={busy}
                    onChange={(e) => {
                      setIncludeCarry(e.target.checked);
                      setAck(false);
                      setSelected(new Set());
                    }}
                  />
                  Include eligible approved older reviewed bookings in this
                  settlement period (travel dates stay visible on the statement)
                </label>
                <label className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={includeLedger}
                    disabled={busy}
                    onChange={(e) => {
                      setIncludeLedger(e.target.checked);
                      setAck(false);
                      setSelected(new Set());
                    }}
                  />
                  Include pending commission ledger corrections, including
                  adjustment-only settlements
                </label>
              </div>
              <div className="space-y-3">
                {data.agencies.map((w) => {
                  const eligible = approved(w.agency.id),
                    corrections = pending(w.agency.id),
                    sum =
                      eligible.reduce(
                        (n, r) => n + Number(r.attribution!.commission_amount),
                        0,
                      ) + corrections.reduce((n, a) => n + Number(a.amount), 0);
                  const allocated = allRows.filter(
                    (r) =>
                      r.agency?.id === w.agency.id &&
                      ['paid', 'prepared'].includes(r.state),
                  ).length;
                  return (
                    <label
                      key={w.agency.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${w.agency.name}`}
                        checked={selected.has(w.agency.id)}
                        disabled={
                          busy ||
                          !healthy ||
                          (!eligible.length && !corrections.length) ||
                          eligible.length > 1000 ||
                          corrections.length > 1000
                        }
                        onChange={(e) => {
                          const next = new Set(selected);
                          e.target.checked
                            ? next.add(w.agency.id)
                            : next.delete(w.agency.id);
                          setSelected(next);
                        }}
                      />
                      <span className="flex-1 font-medium text-sm">
                        {w.agency.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {eligible.length} approved · {corrections.length}{' '}
                        corrections · {allocated} already allocated
                      </span>
                      <span className="font-semibold text-sm tabular-nums">
                        {sum.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        })}
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="block text-sm">
                Close notes
                <Textarea
                  maxLength={2000}
                  value={notes}
                  disabled={busy}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <Button
                disabled={demo || busy || !selected.size || !ack || !healthy}
                onClick={prepare}
              >
                Prepare {selected.size || ''} agency settlement records
              </Button>
              <p className="text-xs text-gray-500">
                Reconciliation acknowledgement is required. Agencies commit
                independently with retry-safe keys. Unresolved bookings stay
                unallocated; no customer invoices or bank transfers are created.
              </p>
              {result.length > 0 && (
                <ul className="text-sm" aria-live="polite">
                  {result.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              {data.agencies.map((w) => (
                <section key={w.agency.id} className="pt-4 space-y-4">
                  <h3 className="font-semibold">{w.agency.name}</h3>
                  <SettlementRecords
                    payouts={data.payouts.filter(
                      (p) => p.agency_id === w.agency.id,
                    )}
                    operatorId={operator.operatorId}
                    readOnly={demo || busy || !healthy}
                    onSaved={load}
                  />
                  <CommissionAdjustments
                    agency={w.agency}
                    operatorId={operator.operatorId}
                    payouts={data.payouts.filter(
                      (p) => p.agency_id === w.agency.id,
                    )}
                    adjustments={w.workflow.adjustments ?? []}
                    readOnly={demo || busy || !healthy}
                    onSaved={load}
                  />
                </section>
              ))}
            </>
          )}
        </>
      )}
      {detail?.agency && detail.attribution && detailAgency && (
        <CommissionDetail
          reservation={detail.reservation}
          attribution={detail.attribution}
          agency={detail.agency}
          agents={detailAgency.agents}
          config={operator.routeRateConfig}
          review={detailAgency.workflow.reviews.find(
            (v) => v.moovs_trip_id === detail.reservation.moovs_trip_id,
          )}
          events={detailAgency.workflow.events}
          operatorId={operator.operatorId}
          readOnly={
            demo ||
            busy ||
            !healthy ||
            detail.reservation.fact_origin === 'snapshot'
          }
          settled={!!detail.payoutId}
          onClose={() => setDetail(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
