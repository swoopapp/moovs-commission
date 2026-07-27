import crypto from 'crypto';
import { cookies } from 'next/headers';

export const OPERATOR_SESSION_COOKIE = '__Host-moovs-commission-operator';

export interface OperatorSession {
  operatorId: string;
  moovsOperatorId: string;
  slug: string;
  displayName: string;
  exp: number;
}

function getSessionSecret(): string {
  const secret = process.env.OPERATOR_SESSION_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('OPERATOR_SESSION_SECRET or AUTH_SECRET is required');
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function createOperatorSessionToken(session: Omit<OperatorSession, 'exp'>, maxAgeSeconds = 60 * 60 * 12): string {
  const payload = base64url(JSON.stringify({
    ...session,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifyOperatorSessionToken(token: string | undefined | null): OperatorSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OperatorSession;
    if (
      typeof session.operatorId !== 'string' ||
      !session.operatorId ||
      typeof session.moovsOperatorId !== 'string' ||
      !session.moovsOperatorId ||
      typeof session.slug !== 'string' ||
      !session.slug ||
      !Number.isSafeInteger(session.exp)
    ) return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getOperatorSession(): Promise<OperatorSession | null> {
  const store = await cookies();
  return verifyOperatorSessionToken(store.get(OPERATOR_SESSION_COOKIE)?.value);
}

export async function setOperatorSessionCookie(token: string, maxAgeSeconds = 60 * 60 * 12): Promise<void> {
  const store = await cookies();
  store.set(OPERATOR_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearOperatorSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(OPERATOR_SESSION_COOKIE);
}
