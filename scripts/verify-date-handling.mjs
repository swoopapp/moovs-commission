import assert from 'node:assert/strict';
import {
  calendarMonthKey,
  formatDisplayDate,
  parseDisplayDate,
  toLocalDateInput,
} from '../src/lib/date.ts';

const localDate = new Date(2026, 6, 27, 23, 30);
assert.equal(toLocalDateInput(localDate), '2026-07-27');
assert.equal(formatDisplayDate('2026-07-27'), '7/27/2026');
assert.equal(calendarMonthKey('2026-07-01'), '2026-07');
assert.equal(calendarMonthKey('2026-08-01T01:00:00.000Z'), '2026-07');
assert.equal(calendarMonthKey('not-a-date'), null);
assert.equal(parseDisplayDate('2026-07-27')?.getDate(), 27);

console.log('Local date verification passed (6 assertions).');
