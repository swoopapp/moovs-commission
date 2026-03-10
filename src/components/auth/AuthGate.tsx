// src/components/auth/AuthGate.tsx
import { useState } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { isAuthenticated } from '../../services/authService';
import { LoginPage } from './LoginPage';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const operator = useOperator();
  const [authed, setAuthed] = useState(() => isAuthenticated(operator.slug));

  if (!authed) {
    return <LoginPage onAuthenticated={() => setAuthed(true)} />;
  }

  return <>{children}</>;
}
