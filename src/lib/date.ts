const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Parse calendar dates without letting JavaScript reinterpret YYYY-MM-DD as UTC.
 * That UTC behavior displays the prior day for users west of Greenwich.
 */
export function parseDisplayDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  fallback = '--',
): string {
  const date = parseDisplayDate(value);
  return date ? date.toLocaleDateString('en-US', options) : fallback;
}
