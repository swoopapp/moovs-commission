'use client';

import { useState } from 'react';
import App from './App';
import { OperatorProvider } from './contexts/OperatorContext';
import { NotFoundPage } from './components/NotFoundPage';
import { AdminPanel } from './components/admin/AdminPanel';
import { PortalView } from './components/portal/PortalView';

function getSlugFromPath(): string {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  return path.split('/')[0] || '';
}

export function Root() {
  const [notFound, setNotFound] = useState(false);
  const slug = getSlugFromPath();

  if (!slug) return <NotFoundPage />;
  if (slug === 'admin') return <AdminPanel />;
  if (slug === 'portal') {
    const pathParts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
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
