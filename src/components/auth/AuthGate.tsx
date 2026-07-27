// src/components/auth/AuthGate.tsx
import { useEffect, useState } from 'react';
import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { authenticateWithPortalToken, hasValidOperatorSession } from '../../services/authService';
import { LoginPage } from './LoginPage';
import { Loader2 } from 'lucide-react';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const operator = useOperator();
  const isDemo = useIsDemo();
  const [authed, setAuthed] = useState(isDemo);
  const [checkingToken, setCheckingToken] = useState(!isDemo);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      setAuthed(true);
      setCheckingToken(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('commission_token') || params.get('token');
    let cancelled = false;

    setCheckingToken(true);
    setTokenError(null);

    if (token) {
      // Remove bearer credentials from the visible URL as soon as they are captured.
      const url = new URL(window.location.href);
      url.searchParams.delete('commission_token');
      url.searchParams.delete('token');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }

    const authenticate = token
      ? authenticateWithPortalToken(operator.slug, token)
      : hasValidOperatorSession(operator.slug);

    authenticate
      .then((ok) => {
        if (cancelled) return;
        setAuthed(ok);
        if (!ok && token) {
          setTokenError('This secure link is invalid or has been revoked. Ask Moovs for a new link.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAuthed(false);
        setTokenError(
          token
            ? 'This secure link could not be verified. Check your connection or ask Moovs for a new link.'
            : 'Your session could not be verified. Check your connection and reload the page.',
        );
      })
      .finally(() => {
        if (!cancelled) setCheckingToken(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo, operator.slug]);

  if (isDemo) {
    return <>{children}</>;
  }

  if (checkingToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" aria-hidden="true" />
        <span className="sr-only">Verifying secure session</span>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage error={tokenError} />;
  }

  return <>{children}</>;
}
