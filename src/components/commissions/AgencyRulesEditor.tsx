import { useState, useEffect } from 'react';
import type { Agency, Reservation } from '../../types/commission';
import type { CommissionRule } from '../../types/workflow';
import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { fetchShuttleRoutes } from '../../services/shuttleRouteService';
import { saveWorkflow } from '../../services/workflowService';
import { validateRules } from '../../lib/commission-rules';
import { calculateCommission } from '../../lib/commission-calc';
import { operatorDay } from '../../lib/operator-time';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
interface Props {
  agency: Agency;
  reservations: Reservation[];
  onSaved: () => void;
}
export function AgencyRulesEditor({ agency, reservations, onSaved }: Props) {
  const operator = useOperator(),
    demo = useIsDemo();
  const [rules, setRules] = useState<CommissionRule[]>(
      agency.commission_rules ?? [],
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [routes, setRoutes] = useState<Array<{ route_id: string; name: string }>>(
      [],
    ),
    [preview, setPreview] = useState(false);
  useEffect(() => {
    setRules(agency.commission_rules ?? []);
    setPreview(false);
  }, [agency]);
  useEffect(() => {
    fetchShuttleRoutes(operator.moovsOperatorId)
      .then(setRoutes)
      .catch(() => toast.error('Route list unavailable'));
  }, [operator.moovsOperatorId]);
  const error = validateRules(rules, agency.commission_type);
  const changed = reservations.filter(
    (r) =>
      calculateCommission(r, agency, operator.routeRateConfig) !==
      calculateCommission(
        r,
        { ...agency, commission_rules: rules },
        operator.routeRateConfig,
      ),
  );
  function change(id: string, patch: Partial<CommissionRule>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setPreview(false);
  }
  async function save() {
    try {
      setBusy(true);
      await saveWorkflow('rules', {
        operator_id: operator.operatorId,
        agency_id: agency.id,
        rules,
        previous: JSON.stringify(agency.commission_rules ?? []),
        reason,
      });
      toast.success('Commission rules saved');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Agency commission exceptions
          </h2>
          <p className="text-sm text-gray-500">
            Dated rules override this agency’s default. A specific shuttle route
            wins over a service-wide rule.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setRules([
              ...rules,
              {
                id: crypto.randomUUID(),
                label: 'New exception',
                service: 'shuttle',
                route_id: null,
                rate: Number(agency.commission_rate),
                effective_from:
                  operatorDay(new Date(), operator.timeZone ?? '') ?? '',
                effective_to: null,
              },
            ]);
            setPreview(false);
          }}
        >
          Add exception
        </Button>
      </div>
      {!rules.length && (
        <p className="text-sm text-gray-500">
          No exceptions. Existing fixed/standard commission rules remain in
          effect.
        </p>
      )}
      {rules.map((r, index) => (
        <fieldset
          key={r.id}
          className="rounded-md border p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <legend className="px-2 text-sm font-medium">
            Exception {index + 1}
          </legend>
          <label className="text-sm">
            Name
            <Input
              value={r.label}
              maxLength={100}
              onChange={(e) => change(r.id, { label: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Service
            <select
              className="h-10 w-full rounded-md border px-2 bg-white"
              value={r.service}
              onChange={(e) =>
                change(r.id, {
                  service: e.target.value as CommissionRule['service'],
                  route_id: null,
                })
              }
            >
              <option value="shuttle">Shared shuttle</option>
              <option value="private-transfer">
                Private transfer (one-way)
              </option>
            </select>
          </label>
          <label className="text-sm">
            Shuttle route
            <select
              className="h-10 w-full rounded-md border px-2 bg-white"
              disabled={r.service !== 'shuttle'}
              value={r.route_id ?? ''}
              onChange={(e) =>
                change(r.id, { route_id: e.target.value || null })
              }
            >
              <option value="">All routes / service default</option>
              {routes.map((route) => (
                <option key={route.route_id} value={route.route_id}>
                  {route.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {agency.commission_type === 'percent'
              ? 'Rate (%)'
              : 'Flat amount ($)'}
            <Input
              type="number"
              min={0}
              max={agency.commission_type === 'percent' ? 100 : undefined}
              step="0.01"
              value={Number.isFinite(r.rate) ? r.rate : ''}
              onChange={(e) =>
                change(r.id, {
                  rate: e.target.value === '' ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="text-sm">
            Effective from
            <Input
              type="date"
              value={r.effective_from}
              onChange={(e) => change(r.id, { effective_from: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Effective through (optional)
            <Input
              type="date"
              value={r.effective_to ?? ''}
              onChange={(e) =>
                change(r.id, { effective_to: e.target.value || null })
              }
            />
          </label>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => {
              setRules(rules.filter((rule) => rule.id !== r.id));
              setPreview(false);
            }}
          >
            Remove exception
          </Button>
        </fieldset>
      ))}
      <label className="block text-sm">
        Change reason
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {preview && (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          <p>
            {changed.length} of {reservations.length} loaded bookings would
            calculate differently. This is not a full historical impact report.
          </p>
          <ul className="mt-2 space-y-1">
            {changed.slice(0, 10).map((r) => (
              <li key={r.id}>
                {r.order_number} · $
                {calculateCommission(
                  r,
                  agency,
                  operator.routeRateConfig,
                ).toFixed(2)}{' '}
                → $
                {calculateCommission(
                  r,
                  { ...agency, commission_rules: rules },
                  operator.routeRateConfig,
                ).toFixed(2)}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Finalized statement amounts remain unchanged. Unsettled approvals
            with changed calculations require re-review.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!!error}
          onClick={() => setPreview(true)}
        >
          Preview impact
        </Button>
        <Button
          disabled={
            demo || busy || !!error || !preview || reason.trim().length < 3
          }
          onClick={save}
        >
          Save exceptions
        </Button>
      </div>
      {demo && (
        <p className="text-xs text-gray-500">
          Preview only in the demo workspace.
        </p>
      )}
    </section>
  );
}
