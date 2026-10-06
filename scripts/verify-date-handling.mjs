import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  calendarMonthKey,
  formatDisplayDate,
  parseDisplayDate,
  toLocalDateInput,
} from '../src/lib/date.ts';
import {
  wallClockDay,
  operatorDay,
  reservationTravelDay,
  previousOperatorMonth,
} from '../src/lib/operator-time.ts';

// Same stored booking must yield the same day in every viewer/server timezone.
if (!process.env.COMMISSIONS_DATE_CHILD) {
  for (const TZ of [
    'UTC',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Pacific/Honolulu',
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', new URL(import.meta.url).pathname],
      {
        env: { ...process.env, TZ, COMMISSIONS_DATE_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${TZ}: ${result.stderr || result.stdout}`);
    process.stdout.write(result.stdout);
  }
  console.log(
    'Date contract verified in 4 runtime timezones (26 assertions each).',
  );
} else {
  let n = 0;
  const eq = (actual, expected) => {
    n++;
    assert.deepEqual(actual, expected);
  };
  eq(toLocalDateInput(new Date(2026, 6, 27, 23, 30)), '2026-07-27');
  eq(formatDisplayDate('2026-07-27'), '7/27/2026');
  eq(parseDisplayDate('2026-07-27')?.getDate(), 27);
  eq(calendarMonthKey('2026-08-01T01:00:00.000Z'), '2026-08');
  eq(calendarMonthKey('not-a-date'), null);
  for (const value of [
    '2026-10-01T00:01:00.000Z',
    '2026-10-01 00:01:00',
    '2026-10-01',
  ]) {
    eq(wallClockDay(value), '2026-10-01');
    eq(formatDisplayDate(value), '10/1/2026');
  }
  // DST gap and repeated hour are wall-clock labels: do not adjust them.
  eq(wallClockDay('2026-03-08T02:30:00.000Z'), '2026-03-08');
  eq(wallClockDay('2026-11-01T01:30:00.000Z'), '2026-11-01');
  eq(wallClockDay('2026-02-30'), null);
  eq(wallClockDay('2026-13-01'), null);
  eq(
    reservationTravelDay({
      source: 'trip',
      pickup_date: '2026-10-01T00:01:00.000Z',
      booking_timezone: 'America/Los_Angeles',
    }),
    '2026-10-01',
  );
  eq(
    reservationTravelDay({
      source: 'shuttle',
      travel_day: '2026-09-30',
      pickup_date: '2026-10-01T06:30:00.000Z',
    }),
    '2026-09-30',
  );
  // Service day may differ from actual local pickup day for an overnight schedule.
  eq(
    reservationTravelDay({
      source: 'shuttle',
      travel_day: '2026-09-30',
      pickup_date: '2026-10-01T09:00:00.000Z',
    }),
    '2026-09-30',
  );
  eq(
    reservationTravelDay({
      source: 'shuttle',
      pickup_date: '2026-10-01T06:30:00Z',
    }),
    null,
  );
  // True instants DO convert, with an explicit operator timezone (never viewer tz).
  eq(operatorDay('2026-10-01T06:30:00Z', 'America/Los_Angeles'), '2026-09-30');
  eq(operatorDay('2026-10-01T06:30:00Z', 'Asia/Tokyo'), '2026-10-01');
  eq(operatorDay('2026-10-01T00:00:00', 'America/Los_Angeles'), null);
  eq(operatorDay('2026-10-01', 'America/Los_Angeles'), null);
  eq(operatorDay('2026-10-01T06:30:00Z', 'bad-zone'), null);
  eq(
    previousOperatorMonth(
      'America/Los_Angeles',
      new Date('2026-10-01T06:30:00Z'),
    ),
    { from: '2026-08-01', to: '2026-08-31' },
  );
  eq(previousOperatorMonth('Asia/Tokyo', new Date('2026-10-01T06:30:00Z')), {
    from: '2026-09-01',
    to: '2026-09-30',
  });
  console.log(`${process.env.TZ}: ${n} date assertions passed.`);
}
