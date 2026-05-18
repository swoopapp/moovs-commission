import { getCommissionApiBase, getDashboardSecret, getAdminSecret } from '@/lib/admin-auth';

export function sanitizeOperator<T extends Record<string, unknown>>(operator: T): Omit<T, 'auth_password'> & { auth_password_set: boolean } {
  const { auth_password, ...rest } = operator;
  return {
    ...rest,
    auth_password_set: typeof auth_password === 'string' && auth_password.length > 0,
  } as Omit<T, 'auth_password'> & { auth_password_set: boolean };
}

export function stripPortalToken<T extends Record<string, unknown>>(row: T): Omit<T, 'portal_token'> {
  const { portal_token, ...rest } = row;
  return rest;
}

export async function fetchCommissionApi(path: string, init: RequestInit = {}, admin = false): Promise<Response> {
  const apiBase = getCommissionApiBase();
  const headers = new Headers(init.headers);
  headers.set('x-dashboard-secret', getDashboardSecret());
  if (admin) headers.set('x-admin-secret', getAdminSecret());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  return fetch(`${apiBase}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function readCommissionJson<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const response = await fetchCommissionApi(path, init, admin);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Commission API ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}
