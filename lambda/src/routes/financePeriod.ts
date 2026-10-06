import { Hono } from 'hono';
import { appQuery } from '../appDb.js';
import { query } from '../db.js';
import { operatorTimezone } from '../operatorTimezone.js';
import { validDate } from '../../../src/lib/commission-rules.ts';
const app = new Hono();
const MAX_RECORDS = 25000;
// A fixed identity manifest avoids repeated full enrichment and unstable OFFSET ties.
// This SELECT does not price, deduplicate or repair bookings; authoritative enrichment
// must return exactly one fact per manifest identity or the client fails closed.
app.post('/workflow/period', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (
    !b ||
    typeof b.operator_id !== 'string' ||
    !validDate(b.date_from) ||
    !validDate(b.date_to) ||
    b.date_from > b.date_to
  )
    return c.json({ error: 'Invalid finance period' }, 400);
  const op = (
    await appQuery(
      'SELECT moovs_operator_id FROM commission_operators WHERE id=$1',
      [b.operator_id],
    )
  ).rows[0];
  if (!op) return c.json({ error: 'Operator not found' }, 404);
  const timeZone = await operatorTimezone(op.moovs_operator_id);
  const result = await query(
    `WITH identities AS (
    SELECT t.trip_id::text AS moovs_trip_id,to_char(pickup.date_time,'YYYY-MM-DD') AS travel_day,'trip'::text AS source
    FROM request req JOIN trip t ON t.request_id=req.request_id AND t.removed_at IS NULL
    LEFT JOIN LATERAL (SELECT s.date_time FROM stop s WHERE s.trip_id=t.trip_id ORDER BY s.stop_index ASC LIMIT 1) pickup ON true
    WHERE req.operator_id=$1 AND pickup.date_time >= $2::date AND pickup.date_time < ($3::date + INTERVAL '1 day')
    UNION ALL
    SELECT sb.booking_id::text,to_char(sb.travel_date,'YYYY-MM-DD'),'shuttle'::text FROM shuttle_booking sb
    WHERE sb.operator_id=$1 AND sb.travel_date >= $2::date AND sb.travel_date <= $3::date
  ) SELECT *,count(*) OVER()::int AS total FROM identities
    ORDER BY travel_day,source,moovs_trip_id LIMIT $4`,
    [op.moovs_operator_id, b.date_from, b.date_to, MAX_RECORDS + 1],
  );
  const total = result.rows[0]?.total ?? 0;
  const complete = total <= MAX_RECORDS;
  return c.json({
    total,
    max_records: MAX_RECORDS,
    // Never return a partial manifest that could be mistaken for complete financial totals.
    identities: complete
      ? result.rows.map(({ total, ...identity }) => identity)
      : [],
    metadata: {
      fetched_at: new Date().toISOString(),
      time_zone: timeZone,
      source: 'Moovs replica',
      complete,
    },
  });
});
export default app;
