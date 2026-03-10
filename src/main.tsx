import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import App from './App.tsx';
import { OperatorProvider } from './contexts/OperatorContext.tsx';
import { NotFoundPage } from './components/NotFoundPage.tsx';
import { AdminPanel } from './components/admin/AdminPanel.tsx';
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
    return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">Portal coming soon</p></div>;
  }
  if (notFound) return <NotFoundPage />;

  return (
    <OperatorProvider slug={slug} onNotFound={() => setNotFound(true)}>
      <App />
    </OperatorProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
