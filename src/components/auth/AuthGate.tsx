// src/components/auth/AuthGate.tsx
import { useEffect, useState } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { authenticateWithPortalToken, isAuthenticated } from '../../services/authService';
import { LoginPage } from './LoginPage';
import { Loader2 } from 'lucide-react';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const operator = useOperator();
  const [authed, setAuthed] = useState(() => isAuthenticated(operator.slug));
  const [checkingToken, setCheckingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (authed) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('commission_token') || params.get('token');
    if (!token) return;

    setCheckingToken(true);
    setTokenError(null);
    authenticateWithPortalToken(operator.slug, token)
      .then((ok) => {
        const url = new URL(window.location.href);
        url.searchParams.delete('commission_token');
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

        if (ok) {
          setAuthed(true);
        } else {
          setTokenError('This secure link is invalid or has been revoked. Ask Moovs for a new link.');
        }
      })
      .catch(() => {
        setTokenError('This secure link is invalid or has been revoked. Ask Moovs for a new link.');
      })
      .finally(() => setCheckingToken(false));
  }, [authed, operator.slug]);

  if (checkingToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginPage error={tokenError} />;
  }

  return <>{children}</>;
}
