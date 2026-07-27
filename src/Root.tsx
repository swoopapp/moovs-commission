'use client';

import { useCallback, useEffect, useState } from 'react';
import App from './App';
import { OperatorProvider } from './contexts/OperatorContext';
import { NotFoundPage } from './components/NotFoundPage';
import { AdminPanel } from './components/admin/AdminPanel';
import { PortalView } from './components/portal/PortalView';

export function Root() {
  const [notFound, setNotFound] = useState(false);
  const [pathParts, setPathParts] = useState<string[] | null>(null);

  useEffect(() => {
    setPathParts(window.location.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean));
  }, []);

  const handleNotFound = useCallback(() => setNotFound(true), []);

  if (!pathParts) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="animate-pulse motion-reduce:animate-none text-gray-600 text-lg">Loading commissions…</div>
      </div>
    );
  }

  const slug = pathParts[0] || '';

  if (!slug) return <NotFoundPage />;
  if (slug === 'admin') return <AdminPanel />;
  if (slug === 'portal') {
    const token = pathParts[1] || '';
    if (!token) return <NotFoundPage />;
    return <PortalView token={token} />;
  }
  if (notFound) return <NotFoundPage />;

  return (
    <OperatorProvider slug={slug} onNotFound={handleNotFound}>
      <App />
    </OperatorProvider>
  );
}
