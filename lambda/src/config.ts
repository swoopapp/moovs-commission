import crypto from 'crypto';

export function safeSecretEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function getDashboardSecret(): string | null {
  return process.env.DASHBOARD_SECRET || null;
}

export function getAdminSecret(): string | null {
  return process.env.ADMIN_SECRET || null;
}

export function hasDashboardSecret(headerValue?: string | null): boolean {
  return safeSecretEqual(headerValue, getDashboardSecret());
}

export function hasAdminSecret(headerValue?: string | null): boolean {
  return safeSecretEqual(headerValue, getAdminSecret());
}
