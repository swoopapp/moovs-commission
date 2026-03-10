// src/contexts/OperatorContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OperatorConfig } from '../types/operatorBranding';
import { fetchBrandingBySlug } from '../services/operatorBrandingService';
import { fetchOperator } from '../services/supabaseService';

interface OperatorContextValue {
  operator: OperatorConfig;
  refreshOperator: () => Promise<void>;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function useOperator(): OperatorConfig {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error('useOperator must be used within OperatorProvider');
  return ctx.operator;
}

export function useRefreshOperator(): () => Promise<void> {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error('useRefreshOperator must be used within OperatorProvider');
  return ctx.refreshOperator;
}

interface OperatorProviderProps {
  slug: string;
  children: ReactNode;
  onNotFound: () => void;
}

export function OperatorProvider({ slug, children, onNotFound }: OperatorProviderProps) {
  const [operator, setOperator] = useState<OperatorConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const branding = await fetchBrandingBySlug(slug);
        if (!branding) {
          if (!cancelled) onNotFound();
          return;
        }

        // Validate operator exists via edge function
        const op = await fetchOperator(branding.operator_id);

        if (!cancelled) {
          setOperator({
            operatorId: branding.operator_id,
            slug: branding.slug,
            displayName: branding.display_name || op.name,
            logoUrl: branding.logo_url,
            primaryColor: branding.primary_color,
            secondaryColor: branding.secondary_color,
            authPassword: branding.auth_password,
            ssoProvider: branding.sso_provider,
            ssoConfig: branding.sso_config,
          });
        }
      } catch (err) {
        console.error('Failed to load operator:', err);
        if (!cancelled) onNotFound();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, onNotFound]);

  const refreshOperator = useCallback(async () => {
    const branding = await fetchBrandingBySlug(slug);
    if (!branding) return;
    const op = await fetchOperator(branding.operator_id);
    setOperator({
      operatorId: branding.operator_id,
      slug: branding.slug,
      displayName: branding.display_name || op.name,
      logoUrl: branding.logo_url,
      primaryColor: branding.primary_color,
      secondaryColor: branding.secondary_color,
      authPassword: branding.auth_password,
      ssoProvider: branding.sso_provider,
      ssoConfig: branding.sso_config,
    });
  }, [slug]);

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!operator) return null;

  return (
    <OperatorContext.Provider value={{ operator, refreshOperator }}>
      {children}
    </OperatorContext.Provider>
  );
}
