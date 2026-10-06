import type { FinanceWorkspace } from '../../services/financeWorkspaceService';
import { DataStatus } from './DataStatus';
export function DataHealth({
  health,
  onRefresh,
  busy = false,
}: {
  health: FinanceWorkspace['health'];
  onRefresh?: () => void;
  busy?: boolean;
}) {
  const good =
    health.liveAvailable &&
    health.workflowAvailable &&
    health.carryAvailable &&
    !!health.timeZone &&
    !health.warnings.length &&
    !health.missingFacts;
  const stamp = health.lastSuccessfulRefresh
    ? health.timeZone
      ? new Date(health.lastSuccessfulRefresh).toLocaleString('en-US', {
          timeZone: health.timeZone,
        })
      : health.lastSuccessfulRefresh
    : 'Unavailable for this attempt';
  const warning = !health.liveAvailable
    ? 'Booking data could not be refreshed. Reload before reconciling.'
    : !health.workflowAvailable
      ? 'Commission reviews could not be loaded. Totals are incomplete.'
      : !health.carryAvailable
        ? 'Older reviewed bookings could not be refreshed. Reload before settling.'
        : !health.timeZone
          ? 'Operator timezone is unavailable. Local settlement periods need verification.'
          : 'Some booking facts need attention. Review before settling.';
  return (
    <DataStatus
      label="Commission data health"
      available={good}
      timestamp={health.lastSuccessfulRefresh}
      warning={warning}
      onRefresh={onRefresh}
      busy={busy}
    >
      <p>
        {health.source} · {health.timeZone ?? 'Operator timezone unverified'}
      </p>
      <p>Last successful portal refresh: {stamp}</p>
      <p>
        {health.snapshotOnly} snapshot-only bookings · {health.missingFacts}{' '}
        bookings with unavailable facts
      </p>
      {health.warnings.map((w) => (
        <p key={w} className="text-amber-800">
          {w}
        </p>
      ))}
      <p>
        Travel dates retain Moovs wall-clock/service dates. Refresh time is when
        this portal read the replica, not when the source was last updated.
        Settlements recheck facts.
      </p>
    </DataStatus>
  );
}
