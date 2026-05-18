import crypto from 'crypto';

const PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}$`);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!isPasswordHash(stored)) {
    const left = Buffer.from(password);
    const right = Buffer.from(stored);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}
