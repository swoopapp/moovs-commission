// src/contexts/OperatorContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CommissionOperator, CommissionOperatorConfig, EMPTY_ROUTE_RATE_CONFIG, RouteRateConfig } from '../types/commissionOperator';
import { fetchOperatorBySlug } from '../services/commissionOperatorService';
import { demoOperatorConfig, isDemoSlug } from '../demoData';

function normalizeRouteRateConfig(value: RouteRateConfig | null | undefined): RouteRateConfig {
  if (!value || typeof value !== 'object') return EMPTY_ROUTE_RATE_CONFIG;
  return {
    default_rate: typeof value.default_rate === 'number' ? value.default_rate : null,
    routes: value.routes && typeof value.routes === 'object' ? value.routes : {},
  };
}

function toOperatorConfig(op: CommissionOperator): CommissionOperatorConfig {
  return {
    operatorId: op.id,
    moovsOperatorId: op.moovs_operator_id,
    slug: op.slug,
    displayName: op.display_name,
    logoUrl: op.logo_url,
    primaryColor: op.primary_color,
    secondaryColor: op.secondary_color,
    routeRateConfig: normalizeRouteRateConfig(op.route_rate_config),
  };
}

interface OperatorContextValue {
  operator: CommissionOperatorConfig;
  refreshOperator: () => Promise<void>;
  isDemo: boolean;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function useOperator(): CommissionOperatorConfig {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error('useOperator must be used within OperatorProvider');
  return ctx.operator;
}

export function useRefreshOperator(): () => Promise<void> {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error('useRefreshOperator must be used within OperatorProvider');
  return ctx.refreshOperator;
}

export function useIsDemo(): boolean {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error('useIsDemo must be used within OperatorProvider');
  return ctx.isDemo;
}

interface OperatorProviderProps {
  slug: string;
  children: ReactNode;
  onNotFound: () => void;
}

export function OperatorProvider({ slug, children, onNotFound }: OperatorProviderProps) {
  const demoMode = isDemoSlug(slug);
  const [operator, setOperator] = useState<CommissionOperatorConfig | null>(demoMode ? demoOperatorConfig : null);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (demoMode) {
      setOperator(demoOperatorConfig);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setOperator(null);
      try {
        const op = await fetchOperatorBySlug(slug);
        if (!op) {
          if (!cancelled) onNotFound();
          return;
        }

        if (!cancelled) {
          setOperator(toOperatorConfig(op));
        }
      } catch (err) {
        console.error('Failed to load operator:', err);
        if (!cancelled) {
          setError('We could not load this commission portal. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, onNotFound, demoMode, retryKey]);

  const refreshOperator = useCallback(async () => {
    if (demoMode) {
      setOperator(demoOperatorConfig);
      return;
    }
    const op = await fetchOperatorBySlug(slug);
    if (!op) return;
    setOperator(toOperatorConfig(op));
  }, [slug, demoMode]);

  // Apply operator branding colors as CSS custom properties
  useEffect(() => {
    if (!operator) return;
    const root = document.documentElement;
    if (operator.primaryColor) {
      root.style.setProperty('--primary', operator.primaryColor);
      root.style.setProperty('--sidebar-primary', operator.primaryColor);
      root.style.setProperty('--secondary-foreground', operator.primaryColor);
      root.style.setProperty('--accent-foreground', operator.primaryColor);
    }
    if (operator.secondaryColor) {
      root.style.setProperty('--secondary', operator.secondaryColor);
    }
    // Update page title
    document.title = `${operator.displayName} — Commissions`;

    return () => {
      // Reset on unmount
      root.style.removeProperty('--primary');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--secondary-foreground');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--secondary');
    };
  }, [operator]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="animate-pulse motion-reduce:animate-none text-gray-600 text-lg">Loading operator…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm" role="alert">
          <h1 className="text-lg font-semibold text-gray-900">Portal unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button
            type="button"
            className="mt-4 h-10 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!operator) return null;

  return (
    <OperatorContext.Provider value={{ operator, refreshOperator, isDemo: demoMode }}>
      {children}
    </OperatorContext.Provider>
  );
}
