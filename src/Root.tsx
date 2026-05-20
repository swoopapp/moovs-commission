'use client';

import { useEffect, useState } from 'react';
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

  if (!pathParts) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-lg">Loading...</div>
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
    <OperatorProvider slug={slug} onNotFound={() => setNotFound(true)}>
      <App />
    </OperatorProvider>
  );
}
