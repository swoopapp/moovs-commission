import { wallClockDay } from './operator-time.ts';

/**
 * Format a Date for an HTML date input without converting the local calendar
 * day to UTC first.
 */
export function toLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Parse calendar dates without letting JavaScript reinterpret YYYY-MM-DD as UTC.
 * Wall-clock ISO containers also retain their written calendar components.
 * For true instants use operatorDay/explicit operator timezone instead.
 */
export function parseDisplayDate(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;
  const day = wallClockDay(value);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  fallback = '--',
): string {
  const day = wallClockDay(value);
  return day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
        ...options,
        timeZone: 'UTC',
      })
    : fallback;
}

export function calendarMonthKey(
  value: string | null | undefined,
): string | null {
  return wallClockDay(value)?.slice(0, 7) ?? null;
}
