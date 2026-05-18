import { auth } from '@/lib/auth';

export function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET environment variable is required');
  return secret;
}

export function getDashboardSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error('DASHBOARD_SECRET environment variable is required');
  return secret;
}

export function getCommissionApiBase(): string {
  const apiBase = (
    process.env.COMMISSION_API_URL ||
    process.env.DASHBOARD_API_URL ||
    process.env.API_PROXY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.VITE_LAMBDA_API_URL ||
    ''
  ).replace(/\/+$/, '');

  if (!apiBase) throw new Error('Commission API upstream is not configured');
  return apiBase;
}

export async function requireAuthResponse(): Promise<Response | null> {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Treat invalid/stale cookies as unauthenticated.
  }

  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
