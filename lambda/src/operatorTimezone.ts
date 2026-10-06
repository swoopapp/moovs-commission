import { query } from './db.js';
import { validTimeZone } from '../../src/lib/operator-time.ts';
export async function operatorTimezone(
  operatorId: string,
): Promise<string | null> {
  const row = (
    await query('SELECT timezone_id FROM operator WHERE operator_id=$1', [
      operatorId,
    ])
  ).rows[0];
  return validTimeZone(row?.timezone_id) ? row.timezone_id : null;
}
