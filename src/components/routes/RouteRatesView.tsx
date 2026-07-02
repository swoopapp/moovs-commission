import { useEffect, useMemo, useState } from 'react';
import { useIsDemo, useOperator, useRefreshOperator } from '../../contexts/OperatorContext';
import { ShuttleRoute, RouteRateConfig } from '../../types/commissionOperator';
import { fetchShuttleRoutes } from '../../services/shuttleRouteService';
import { updateOperatorRouteRates } from '../../services/commissionOperatorService';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Route, Loader2, Info, Search, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

function parseRate(text: string): number | null {
  if (text.trim() === '') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export function RouteRatesView() {
  const operator = useOperator();
  const refreshOperator = useRefreshOperator();
  const isDemo = useIsDemo();

  const [routes, setRoutes] = useState<ShuttleRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [defaultRate, setDefaultRate] = useState(
    operator.routeRateConfig.default_rate != null ? String(operator.routeRateConfig.default_rate) : '',
  );
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const [routeId, rr] of Object.entries(operator.routeRateConfig.routes ?? {})) {
      seed[routeId] = String(rr.rate);
    }
    return seed;
  });
  const [filter, setFilter] = useState('');
  const [bulkRate, setBulkRate] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchShuttleRoutes(operator.moovsOperatorId)
      .then((rows) => {
        if (cancelled) return;
        // Merge live routes with any config-only routes (so saved rates for routes not
        // currently returned aren't silently dropped).
        const seen = new Set(rows.map((r) => r.route_id));
        const configOnly: ShuttleRoute[] = Object.values(operator.routeRateConfig.routes ?? {})
          .filter((rr) => !seen.has(rr.route_id))
          .map((rr) => ({ route_id: rr.route_id, name: rr.name || 'Unknown route' }));
        setRoutes([...rows, ...configOnly].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load shuttle routes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [operator.moovsOperatorId, operator.routeRateConfig]);

  const filteredRoutes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) => r.name.toLowerCase().includes(q));
  }, [routes, filter]);

  const defaultRateNum = parseRate(defaultRate);
  const assignedCount = Object.values(rates).filter((v) => parseRate(v) != null).length;

  function applyBulk() {
    const value = bulkRate.trim();
    if (filteredRoutes.length === 0) return;
    setRates((prev) => {
      const next = { ...prev };
      for (const r of filteredRoutes) {
        if (value === '') delete next[r.route_id];
        else next[r.route_id] = value;
      }
      return next;
    });
    toast.success(
      value === ''
        ? `Cleared rate on ${filteredRoutes.length} route${filteredRoutes.length === 1 ? '' : 's'}`
        : `Set ${filteredRoutes.length} route${filteredRoutes.length === 1 ? '' : 's'} to ${value}%`,
    );
  }

  async function handleSave() {
    if (isDemo) {
      toast.info('Demo mode is read-only. Route rates are not saved.');
      return;
    }
    const config: RouteRateConfig = {
      default_rate: defaultRateNum,
      routes: {},
    };
    const nameById = new Map(routes.map((r) => [r.route_id, r.name]));
    for (const [routeId, text] of Object.entries(rates)) {
      const rate = parseRate(text);
      if (rate == null) continue;
      config.routes[routeId] = { route_id: routeId, name: nameById.get(routeId) ?? null, rate };
    }
    try {
      setSaving(true);
      await updateOperatorRouteRates(operator.operatorId, config);
      await refreshOperator();
      toast.success('Route rates saved');
    } catch (err) {
      console.error('Failed to save route rates:', err);
      toast.error('Failed to save route rates');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <a href="#/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </a>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Route className="h-6 w-6" /> Shuttle Route Rates
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Set the commission rate for each shuttle route. Agencies on the <strong>Standard</strong> rate
            source inherit these rates for shuttle bookings; routes with no rate fall back to the default below.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || isDemo} className="shrink-0">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</> : 'Save Route Rates'}
        </Button>
      </div>
      {isDemo && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Route rates are fake demo values. Edits are disabled so this link can be shared safely.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="default-rate">Fallback rate for shuttle routes without a specific rate</Label>
          <div className="relative max-w-[160px]">
            <Input
              id="default-rate"
              type="number"
              value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)}
              placeholder="No fallback"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
          </div>
          <p className="text-xs text-gray-500">
            Leave blank to fall back to each agency's own rate instead.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Routes</span>
            <Badge variant="secondary" className="font-normal">
              {assignedCount} of {routes.length} with a set rate
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter + bulk */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="route-filter">Filter routes</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="route-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="e.g. Oahu, HNL, Airport"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="bulk-rate">Set filtered to</Label>
                <div className="relative w-[120px]">
                  <Input
                    id="bulk-rate"
                    type="number"
                    value={bulkRate}
                    onChange={(e) => setBulkRate(e.target.value)}
                    placeholder="rate"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
              </div>
              <Button variant="outline" onClick={applyBulk} disabled={filteredRoutes.length === 0}>
                Apply to {filteredRoutes.length}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading shuttle routes...
            </div>
          ) : loadError ? (
            <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Could not load shuttle routes from Moovs. You can still set a default rate above.
                <p className="text-xs text-amber-700 mt-1 font-mono">{loadError}</p>
              </div>
            </div>
          ) : routes.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-500 border border-dashed rounded-lg">
              No shuttle routes found for this operator.
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-[55vh] overflow-y-auto">
              {filteredRoutes.map((route) => {
                const value = rates[route.route_id] ?? '';
                const usesDefault = parseRate(value) == null;
                return (
                  <div key={route.route_id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{route.name}</p>
                      {usesDefault && (
                        <p className="text-xs text-gray-400">
                          {defaultRateNum != null ? `Using default (${defaultRateNum}%)` : 'Using agency rate'}
                        </p>
                      )}
                    </div>
                    <div className="relative w-[120px] shrink-0">
                      <Input
                        type="number"
                        value={value}
                        onChange={(e) =>
                          setRates((prev) => {
                            const next = { ...prev };
                            if (e.target.value.trim() === '') delete next[route.route_id];
                            else next[route.route_id] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={defaultRateNum != null ? String(defaultRateNum) : 'default'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                    </div>
                  </div>
                );
              })}
              {filteredRoutes.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-500">No routes match “{filter}”.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
