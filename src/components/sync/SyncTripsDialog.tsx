import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { syncTrips, type SyncResult } from '../../services/tripSyncService';
import { fetchAgencies } from '../../services/agencyService';
import { fetchReservations } from '../../services/reservationService';
import { fetchAttributionsByReservations } from '../../services/attributionService';
import type { Agency, Reservation } from '../../types/commission';
import AttributionReview from './AttributionReview';

interface SyncTripsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operatorId: string;
  onSyncComplete: () => void;
}

type SyncPhase = 'initial' | 'syncing' | 'results' | 'attribution';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never synced';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function defaultDateFrom(lastSyncedAt: string | null): string {
  if (lastSyncedAt) {
    return toISODate(new Date(lastSyncedAt));
  }
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toISODate(d);
}

export default function SyncTripsDialog({
  open,
  onOpenChange,
  operatorId,
  onSyncComplete,
}: SyncTripsDialogProps) {
  const [phase, setPhase] = useState<SyncPhase>('initial');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  // Attribution review state
  const [unmatchedReservations, setUnmatchedReservations] = useState<Reservation[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);

  // Load last synced date from agencies on open
  useEffect(() => {
    if (!open) return;

    // Reset state when dialog opens
    setPhase('initial');
    setResult(null);
    setError(null);
    setUnmatchedReservations([]);

    async function loadLastSync() {
      try {
        const agencyList = await fetchAgencies(operatorId);
        setAgencies(agencyList);

        // Find the most recent last_synced_at across all agencies
        const syncDates = agencyList
          .map((a) => a.last_synced_at)
          .filter(Boolean) as string[];
        const latest = syncDates.length > 0
          ? syncDates.sort().reverse()[0]
          : null;

        setLastSyncedAt(latest);
        setDateFrom(defaultDateFrom(latest));
        setDateTo(toISODate(new Date()));
      } catch {
        // Silently fail — defaults will be used
        setDateFrom(defaultDateFrom(null));
        setDateTo(toISODate(new Date()));
      }
    }

    loadLastSync();
  }, [open, operatorId]);

  async function handleSync() {
    setPhase('syncing');
    setError(null);

    try {
      const syncResult = await syncTrips({
        operatorId,
        dateFrom,
        dateTo,
      });
      setResult(syncResult);

      // If there are unmatched trips, load them for attribution review
      if (syncResult.unmatched > 0) {
        await loadUnmatchedReservations();
      }

      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setPhase('initial');
    }
  }

  async function loadUnmatchedReservations() {
    try {
      const allReservations = await fetchReservations(operatorId, {
        dateFrom,
        dateTo,
      });

      if (allReservations.length === 0) return;

      // Find which reservations already have attributions
      const reservationIds = allReservations.map((r) => r.id);
      const attributions = await fetchAttributionsByReservations(reservationIds);
      const attributedIds = new Set(attributions.map((a) => a.reservation_id));

      // Also load fresh agencies for the dropdown
      const agencyList = await fetchAgencies(operatorId);
      setAgencies(agencyList);

      // Build a set of known company IDs from agencies
      const knownCompanyIds = new Set(
        agencyList.map((a) => a.moovs_company_id).filter(Boolean),
      );

      // Unmatched = no attribution AND (no company_id OR company_id not in agencies)
      const unmatched = allReservations.filter(
        (r) =>
          !attributedIds.has(r.id) &&
          (!r.moovs_company_id || !knownCompanyIds.has(r.moovs_company_id)),
      );

      setUnmatchedReservations(unmatched);
    } catch {
      // Non-critical — user can still close the dialog
    }
  }

  function handleDone() {
    onSyncComplete();
    onOpenChange(false);
  }

  function handleAttributionComplete() {
    setPhase('results');
    setUnmatchedReservations([]);
    onSyncComplete();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={phase === 'attribution' ? { maxWidth: '48rem' } : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === 'attribution' ? 'Review Attributions' : 'Sync Trips'}
          </DialogTitle>
          {phase === 'initial' && (
            <DialogDescription>
              Pull trip data from Moovs and auto-attribute to agencies.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Initial State */}
        {phase === 'initial' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4" />
              <span>Last synced: {formatDate(lastSyncedAt)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="sync-from" className="text-sm font-medium text-gray-700">
                  From
                </label>
                <Input
                  id="sync-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="sync-to" className="text-sm font-medium text-gray-700">
                  To
                </label>
                <Input
                  id="sync-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSync} disabled={!dateFrom || !dateTo}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Trips
              </Button>
            </div>
          </div>
        )}

        {/* Syncing State */}
        {phase === 'syncing' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="text-sm text-gray-600">Syncing trips from Moovs...</p>
          </div>
        )}

        {/* Results State */}
        {phase === 'results' && result && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Sync complete</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{result.synced}</p>
                <p className="text-xs text-gray-500">Trips synced</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{result.attributed}</p>
                <p className="text-xs text-gray-500">Auto-attributed</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {result.unmatched}
                </p>
                <p className="text-xs text-gray-500">Need review</p>
              </div>
            </div>

            {result.unmatched > 0 && unmatchedReservations.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  {unmatchedReservations.length} unmatched
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPhase('attribution')}
                >
                  Review Attributions
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleDone}>Done</Button>
            </div>
          </div>
        )}

        {/* Attribution Review State */}
        {phase === 'attribution' && (
          <AttributionReview
            operatorId={operatorId}
            reservations={unmatchedReservations}
            agencies={agencies}
            onComplete={handleAttributionComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
