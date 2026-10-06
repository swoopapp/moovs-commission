import { CommissionWorkbench } from './components/commissions/CommissionWorkbench';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AgencyDetailView } from './components/agency/AgencyDetailView';
import { AgencyMatchingView } from './components/agency/AgencyMatchingView';
import { RouteRatesView } from './components/routes/RouteRatesView';
import { Toaster } from './components/ui/sonner';
import { PoweredByMoovs } from './components/layout/PoweredByMoovs';
import { WorkspaceSessionProvider } from './contexts/WorkspaceSessionContext';
import { useIsDemo, useOperator } from './contexts/OperatorContext';
import * as Dialog from '@radix-ui/react-dialog';
import { MobileWorkspaceNavigation, WorkspaceSidebar } from './components/layout/WorkspaceNavigation';
import { workspaceSection } from './lib/workspace-navigation';

function App() {
  const isDemo = useIsDemo();
  const operator = useOperator();
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const exportFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash || '#/');
      setNavigationOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeMobileOnDesktop = () => { if (desktop.matches) setNavigationOpen(false); };
    desktop.addEventListener('change', closeMobileOnDesktop);
    return () => {
      window.removeEventListener('hashchange', onHash);
      desktop.removeEventListener('change', closeMobileOnDesktop);
    };
  }, []);

  const handleExport = useCallback(() => {
    exportFnRef.current?.();
  }, []);

  const agencyMatch = route.match(/^#\/agency\/(.+)$/);
  const section = workspaceSection(route);
  const isMatching = route === '#/matching';
  const isRouteRates = route === '#/route-rates';
  const isWorkflow = section === 'review' || section === 'settlement';
  const isDashboard = !isWorkflow && !isRouteRates && !isMatching && !agencyMatch;
  const sectionTitle = section === 'agencies' ? 'Agencies' : 'Overview';

  return (
    <AuthGate>
      <WorkspaceSessionProvider key={operator.operatorId}>
      <Dialog.Root open={navigationOpen} onOpenChange={setNavigationOpen}>
        <div className="min-h-screen bg-gray-50 pb-16">
          <a
            href="#main-content"
            onClick={(event) => {
              event.preventDefault();
              const main = document.getElementById('main-content');
              main?.focus();
              main?.scrollIntoView();
            }}
            className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-gray-950 px-4 py-2 text-sm font-medium text-white transition-transform focus:translate-y-0"
          >
            Skip to main content
          </a>
          <AppHeader onExportClick={isDashboard ? handleExport : undefined} />
          <MobileWorkspaceNavigation section={section} onNavigate={() => setNavigationOpen(false)} />
          <div className="flex items-start">
            <WorkspaceSidebar section={section} />
            <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {isDemo && (
                <div className="mb-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                  Demo workspace · Read-only sample data. No production customer accounts are accessed.
                </div>
              )}
              {isDashboard && (
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold text-gray-900">{sectionTitle}</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {section === 'agencies' ? 'Manage your agency relationships, bookings, and commissions.' : 'Track agency commissions and outstanding balances.'}
                  </p>
                </div>
              )}
              {isWorkflow ? (
                <CommissionWorkbench key={section} mode={section === 'review' ? 'review' : 'settlement'} />
              ) : isRouteRates ? (
                <RouteRatesView />
              ) : isMatching ? (
                <AgencyMatchingView />
              ) : agencyMatch ? (
                <AgencyDetailView agencyId={agencyMatch[1]} />
              ) : (
                <DashboardView
                  showOverview={section === 'overview'}
                  onRegisterExport={(fn) => { exportFnRef.current = fn; }}
                />
              )}
            </main>
          </div>
          <Toaster />
          <PoweredByMoovs />
        </div>
      </Dialog.Root>
      </WorkspaceSessionProvider>
    </AuthGate>
  );
}

export default App;
