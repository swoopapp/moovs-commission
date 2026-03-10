import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AgencyDetailView } from './components/agency/AgencyDetailView';
import { Toaster } from './components/ui/sonner';

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [syncOpen, setSyncOpen] = useState(false);
  const exportFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleExport = useCallback(() => {
    exportFnRef.current?.();
  }, []);

  // Parse route for agency detail (Task 8)
  const agencyMatch = route.match(/^#\/agency\/(.+)$/);

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50">
        <AppHeader onSyncClick={() => setSyncOpen(true)} onExportClick={handleExport} />
        <main className="max-w-7xl mx-auto px-6 py-6">
          {agencyMatch ? (
            <AgencyDetailView agencyId={agencyMatch[1]} />
          ) : (
            <DashboardView
              syncOpen={syncOpen}
              onSyncOpenChange={setSyncOpen}
              onRegisterExport={(fn) => { exportFnRef.current = fn; }}
            />
          )}
        </main>
        <Toaster />
        <footer className="fixed bottom-0 left-0 right-0 text-center py-3">
          <p className="text-xs text-gray-400">Powered by Moovs</p>
        </footer>
      </div>
    </AuthGate>
  );
}

export default App;
