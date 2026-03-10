import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import App from './App.tsx';
import { OperatorProvider } from './contexts/OperatorContext.tsx';
import { NotFoundPage } from './components/NotFoundPage.tsx';
import { AdminPanel } from './components/admin/AdminPanel.tsx';
import { PortalView } from './components/portal/PortalView.tsx';
import './styles/globals.css';

function getSlugFromPath(): string {
  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  return path.split('/')[0] || '';
}

function Root() {
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

createRoot(document.getElementById('root')!).render(<Root />);
