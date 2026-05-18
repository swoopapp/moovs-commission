// src/services/authService.ts

interface AuthSession {
  authenticated: boolean;
  method: 'password' | 'sso';
  timestamp: number;
}

function authKey(slug: string): string {
  return `commission_auth_${slug}`;
}

export function isAuthenticated(slug: string): boolean {
  try {
    const raw = sessionStorage.getItem(authKey(slug));
    if (!raw) return false;
    const session: AuthSession = JSON.parse(raw);
    return session.authenticated === true;
  } catch {
    return false;
  }
}

export async function authenticateWithPassword(slug: string, password: string): Promise<boolean> {
  const response = await fetch('/api/operator-auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password }),
  });

  if (!response.ok) return false;

  const session: AuthSession = {
    authenticated: true,
    method: 'password',
    timestamp: Date.now(),
  };
  sessionStorage.setItem(authKey(slug), JSON.stringify(session));
  return true;
}

export function logout(slug: string): void {
  sessionStorage.removeItem(authKey(slug));
}
