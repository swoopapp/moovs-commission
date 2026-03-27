import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AgencyDetailView } from './components/agency/AgencyDetailView';
import { AgencyMatchingView } from './components/agency/AgencyMatchingView';
import { Toaster } from './components/ui/sonner';

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

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50">
        <AppHeader onExportClick={handleExport} />
        <main className="max-w-7xl mx-auto px-6 py-6">
          {isMatching ? (
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
        <footer className="text-center py-6">
          <p className="text-xs text-gray-400">Powered by Moovs</p>
        </footer>
      </div>
    </AuthGate>
  );
}

export default App;
