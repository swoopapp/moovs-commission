import { useEffect, useState } from 'react';
import type { FinanceWorkspace } from '../../services/financeWorkspaceService';
import { Button } from '../ui/button';
export function DataHealth({
  health,
  onRefresh,
  busy = false,
}: {
  health: FinanceWorkspace['health'];
  onRefresh?: () => void;
  busy?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const age = health.lastSuccessfulRefresh
    ? Math.max(
        0,
        Math.floor((now - Date.parse(health.lastSuccessfulRefresh)) / 60000),
      )
    : null;
  const good =
    health.liveAvailable &&
    health.workflowAvailable &&
    health.carryAvailable &&
    !!health.timeZone;
  const stamp = health.lastSuccessfulRefresh
    ? health.timeZone
      ? new Date(health.lastSuccessfulRefresh).toLocaleString('en-US', {
          timeZone: health.timeZone,
        })
      : health.lastSuccessfulRefresh
    : 'Unavailable for this attempt';
  return (
    <section
      aria-label="Commission data health"
      className="rounded-lg border bg-white p-4 text-sm space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {good ? 'Current data loaded' : 'Data needs attention'}
          {age != null && age >= 5 ? ' · refresh recommended' : ''}
        </p>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={busy}
          >
            Refresh data
          </Button>
        )}
      </div>
      <p className="text-gray-500">
        {health.timeZone ?? 'Operator timezone unverified'} · {health.source}
      </p>
      <p className="text-gray-500">
        Last successful portal refresh: {stamp}
        {age != null ? ` (${age} min ago)` : ''} · {health.snapshotOnly}{' '}
        snapshot-only bookings · {health.missingFacts} bookings with unavailable
        facts
      </p>
      <p className="text-xs text-gray-500">
        Travel dates preserve Moovs wall-clock/service dates. Refresh time
        records when the portal read the replica—not the upstream replica’s last
        update. Settlements recheck facts on the server.
      </p>
      {health.warnings.map((w) => (
        <p key={w} role="alert" className="text-amber-800">
          {w}
        </p>
      ))}
    </section>
  );
}
