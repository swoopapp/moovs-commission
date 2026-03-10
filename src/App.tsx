import { useState, useEffect } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AgencyDetailView } from './components/agency/AgencyDetailView';
import { Toaster } from './components/ui/sonner';

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Parse route for agency detail (Task 8)
  const agencyMatch = route.match(/^#\/agency\/(.+)$/);

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-6 py-6">
          {agencyMatch ? (
            <AgencyDetailView agencyId={agencyMatch[1]} />
          ) : (
            <DashboardView />
          )}
        </main>
        <Toaster />
      </div>
    </AuthGate>
  );
}

export default App;
