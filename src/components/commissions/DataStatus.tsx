import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Info, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

/** Quiet on success; incomplete reads always remain visible and actionable. */
export function DataStatus({
  label,
  available,
  timestamp,
  warning,
  onRefresh,
  busy = false,
  children,
}: {
  label: string;
  available: boolean;
  timestamp?: string | null;
  warning?: string;
  onRefresh?: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const age =
    timestamp && Number.isFinite(Date.parse(timestamp))
      ? Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000))
      : null;
  return (
    <section
      aria-label={label}
      className={
        available
          ? 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500'
          : 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
      }
    >
      <div
        className="flex min-w-0 items-center gap-2"
        role={available ? undefined : 'alert'}
      >
        {available ? (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          {available
            ? age === null
              ? 'Data loaded'
              : age === 0
                ? 'Updated just now'
                : `Updated ${age} min ago`
            : (warning ?? 'Data is incomplete. Refresh before reconciling.')}
        </span>
        {available && age !== null && age >= 5 && (
          <span>· Refresh recommended</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onRefresh}
            disabled={busy}
            aria-label="Refresh data"
          >
            <RefreshCw
              className={busy ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {busy ? 'Refreshing' : 'Refresh'}
          </Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Data details"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)] space-y-3 text-xs text-gray-600"
          >
            <h3 className="text-sm font-semibold text-gray-900">
              Data details
            </h3>
            {children}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
