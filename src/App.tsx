import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AgencyDetailView } from './components/agency/AgencyDetailView';
import { AgencyMatchingView } from './components/agency/AgencyMatchingView';
import { RouteRatesView } from './components/routes/RouteRatesView';
import { Toaster } from './components/ui/sonner';
import { PoweredByMoovs } from './components/layout/PoweredByMoovs';

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const exportFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleExport = useCallback(() => {
    exportFnRef.current?.();
  }, []);

  const agencyMatch = route.match(/^#\/agency\/(.+)$/);
  const isMatching = route === '#/matching';
  const isRouteRates = route === '#/route-rates';

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50 pb-16">
        <AppHeader onExportClick={handleExport} />
        <main className="max-w-7xl mx-auto px-6 py-6">
          {isRouteRates ? (
            <RouteRatesView />
          ) : isMatching ? (
            <AgencyMatchingView />
          ) : agencyMatch ? (
            <AgencyDetailView agencyId={agencyMatch[1]} />
          ) : (
            <DashboardView
              onRegisterExport={(fn) => { exportFnRef.current = fn; }}
            />
          )}
        </main>
        <Toaster />
        <PoweredByMoovs />
      </div>
    </AuthGate>
  );
}

export default App;
