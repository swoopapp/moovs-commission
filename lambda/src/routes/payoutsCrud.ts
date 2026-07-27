import { Hono } from 'hono';
import type { PoolClient } from 'pg';
import { appQuery, getAppPool } from '../appDb.js';
import { fetchAuthoritativeReservations } from '../moovsReservationFacts.js';

const app = new Hono();

const RESERVATION_FIELDS = [
  'operator_id',
  'moovs_trip_id',
  'moovs_company_id',
  'order_number',
  'confirmation_number',
  'pickup_date',
  'pickup_location',
  'dropoff_location',
  'passenger_name',
  'booking_contact_id',
  'booking_contact_name',
  'booking_contact_email',
  'vehicle_type',
  'trip_type',
  'source',
  'shuttle_route_id',
  'shuttle_route_name',
  'base_rate_amount',
  'total_amount',
  'total_with_gratuity',
  'trip_status',
  'client_keys',
] as const;

const PAYOUT_METHODS = new Set(['ACH', 'Wire', 'Check', 'Cash', 'Other']);
const PAYOUT_STATUSES = new Set(['draft', 'pending', 'paid']);
const COMMISSION_TYPES = new Set(['percent', 'flat']);
const COMMISSION_BASES = new Set(['base_rate', 'total_amount', 'total_with_gratuity']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
  }
}

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new RequestError(`${field} must be a finite number`);
  return parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateCommissionRate(rateValue: unknown, type: string): number {
  const rate = finiteNumber(rateValue, 'commission_rate');
  if (rate < 0 || (type === 'percent' && rate > 100)) {
    throw new RequestError(
      type === 'percent'
        ? 'Percent commission_rate must be between 0 and 100'
        : 'Flat commission_rate cannot be negative',
    );
  }
  return rate;
}

function effectiveAttribution(
  reservation: Record<string, any>,
  agency: Record<string, any>,
  routeConfigValue: unknown,
) {
  const commissionType = String(agency.commission_type);
  const commissionBase = String(agency.commission_base);
  if (!COMMISSION_TYPES.has(commissionType)) throw new RequestError('Agency has an invalid commission_type');
  if (!COMMISSION_BASES.has(commissionBase)) throw new RequestError('Agency has an invalid commission_base');

  let commissionRate = validateCommissionRate(agency.commission_rate, commissionType);
  const marker = String(reservation.source ?? reservation.trip_type ?? '').toLowerCase();
  if (commissionType === 'percent' && agency.rate_mode === 'standard' && marker === 'shuttle') {
    let routeConfig: any = routeConfigValue;
    if (typeof routeConfig === 'string') {
      try {
        routeConfig = JSON.parse(routeConfig);
      } catch {
        throw new RequestError('Operator route rate configuration is invalid');
      }
    }
    routeConfig = routeConfig && typeof routeConfig === 'object' ? routeConfig : {};
    const routeRate = reservation.shuttle_route_id
      ? routeConfig.routes?.[reservation.shuttle_route_id]?.rate
      : undefined;
    const configuredRate = routeRate ?? routeConfig.default_rate;
    if (configuredRate != null) {
      commissionRate = validateCommissionRate(configuredRate, 'percent');
    }
  }

  const baseAmount = commissionBase === 'base_rate'
    ? finiteNumber(reservation.base_rate_amount, 'base_rate_amount')
    : commissionBase === 'total_with_gratuity'
      ? finiteNumber(reservation.total_with_gratuity, 'total_with_gratuity')
      : finiteNumber(reservation.total_amount, 'total_amount');
  const commissionAmount = commissionType === 'flat'
    ? round2(commissionRate)
    : round2(baseAmount * (commissionRate / 100));

  return {
    commission_rate: commissionRate,
    commission_type: commissionType,
    commission_base: commissionBase,
    commission_amount: commissionAmount,
  };
}

function reservationValues(item: Record<string, any>): any[] {
  return RESERVATION_FIELDS.map((field) => {
    if (field === 'client_keys') {
      if (Array.isArray(item.client_keys)) {
        return [...new Set(item.client_keys.filter((value: unknown) => typeof value === 'string' && value.trim()))];
      }
      if (item.moovs_company_id) return [`company:${item.moovs_company_id}`];
      return [];
    }
    return item[field] ?? null;
  });
}

async function upsertReservation(client: PoolClient, item: Record<string, any>) {
  const placeholders = RESERVATION_FIELDS.map((_, index) => `$${index + 1}`).join(', ');
  const updates = RESERVATION_FIELDS
    .filter((field) => !['operator_id', 'moovs_trip_id'].includes(field))
    .map((field) => `${field} = EXCLUDED.${field}`);
  const result = await client.query(
    `INSERT INTO commission_reservations (${RESERVATION_FIELDS.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (operator_id, moovs_trip_id)
     DO UPDATE SET ${updates.join(', ')}, synced_at = now()
     RETURNING *`,
    reservationValues(item),
  );
  return result.rows[0];
}

function validateCreateFromTrips(body: any) {
  if (!body || typeof body !== 'object') throw new RequestError('Invalid request body');
  if (!UUID_PATTERN.test(body.idempotency_key ?? '')) {
    throw new RequestError('idempotency_key must be a UUID');
  }
  if (!body.operator_id || !body.agency_id) {
    throw new RequestError('Missing operator_id or agency_id');
  }
  if (!DATE_PATTERN.test(body.period_start ?? '') || !DATE_PATTERN.test(body.period_end ?? '')) {
    throw new RequestError('period_start and period_end must be YYYY-MM-DD dates');
  }
  if (body.period_start > body.period_end) {
    throw new RequestError('period_start must be on or before period_end');
  }
  if (!PAYOUT_METHODS.has(body.method)) throw new RequestError('Invalid payout method');
  if (!PAYOUT_STATUSES.has(body.status)) throw new RequestError('Invalid payout status');
  if (body.date_paid != null && !DATE_PATTERN.test(body.date_paid)) {
    throw new RequestError('date_paid must be a YYYY-MM-DD date');
  }
  if (body.status === 'paid' && !body.date_paid) {
    throw new RequestError('date_paid is required for a paid payout');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new RequestError('At least one payout trip is required');
  }
  if (body.items.length > 1000) throw new RequestError('A payout cannot contain more than 1000 trips');

  const tripIds = new Set<string>();
  for (const item of body.items) {
    const tripId = typeof item?.moovs_trip_id === 'string' ? item.moovs_trip_id.trim() : '';
    if (!tripId) {
      throw new RequestError('Every payout item must include a moovs_trip_id');
    }
    if (tripIds.has(tripId)) {
      throw new RequestError(`Duplicate trip ${tripId}`);
    }
    tripIds.add(tripId);
    if (item.agent_id != null && (typeof item.agent_id !== 'string' || !item.agent_id.trim())) {
      throw new RequestError('agent_id must be a non-empty string or null');
    }
  }

  finiteNumber(body.adjustments ?? 0, 'adjustments');
}

function payoutMatches(existing: Record<string, any>, expected: Record<string, any>): boolean {
  const comparableFields = [
    'operator_id',
    'agency_id',
    'period_start',
    'period_end',
    'adjustments',
    'method',
    'reference_number',
    'status',
    'notes',
    'date_paid',
  ];
  return comparableFields.every((field) => String(existing[field] ?? '') === String(expected[field] ?? ''));
}

// GET /payouts — ?operator_id=X or ?agency_id=X
app.get('/payouts', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    const agencyId = c.req.query('agency_id');

    if (operatorId) {
      const r = await appQuery('SELECT * FROM payouts WHERE operator_id = $1 ORDER BY created_at DESC', [operatorId]);
      return c.json(r.rows);
    }
    if (agencyId) {
      const r = await appQuery('SELECT * FROM payouts WHERE agency_id = $1 ORDER BY created_at DESC', [agencyId]);
      return c.json(r.rows);
    }
    return c.json({ error: 'Missing operator_id or agency_id' }, 400);
  } catch (err: any) {
    console.error('Error fetching payouts:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /payouts/create-from-trips
// Atomically snapshots trips, records their attributions, creates the payout, and links
// its reservations. The client-generated UUID is both the payout ID and idempotency key,
// so a retry after a lost response cannot create a second payout.
app.post('/payouts/create-from-trips', async (c) => {
  const pool = await getAppPool();
  const client = await pool.connect();
  try {
    const body = await c.req.json().catch(() => null);
    validateCreateFromTrips(body);

    const items = (body.items as Array<{ moovs_trip_id: string; agent_id?: string | null }>).map((item) => ({
      moovs_trip_id: item.moovs_trip_id.trim(),
      agent_id: item.agent_id?.trim() || null,
    }));
    const adjustments = round2(finiteNumber(body.adjustments ?? 0, 'adjustments'));
    const payoutRequest = {
      id: body.idempotency_key,
      operator_id: body.operator_id,
      agency_id: body.agency_id,
      period_start: body.period_start,
      period_end: body.period_end,
      adjustments,
      method: body.method,
      reference_number: body.reference_number || null,
      status: body.status,
      notes: body.notes || null,
      date_paid: body.status === 'paid' ? body.date_paid : null,
    };

    await client.query('BEGIN');
    // Serialize retries with the same key without requiring a schema migration.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [payoutRequest.id]);
    const existingResult = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutRequest.id]);
    if (existingResult.rowCount) {
      const existing = existingResult.rows[0];
      const linksResult = await client.query(
        `SELECT cr.moovs_trip_id, ra.agent_id
         FROM payout_reservations pr
         JOIN commission_reservations cr ON cr.id = pr.reservation_id
         LEFT JOIN reservation_attributions ra
           ON ra.reservation_id = cr.id AND ra.agency_id = $2
         WHERE pr.payout_id = $1`,
        [payoutRequest.id, payoutRequest.agency_id],
      );
      const existingItems = new Map(linksResult.rows.map((row) => [
        String(row.moovs_trip_id),
        row.agent_id ? String(row.agent_id) : null,
      ]));
      const sameItems = existingItems.size === items.length
        && items.every((item) => (
          existingItems.has(item.moovs_trip_id)
          && existingItems.get(item.moovs_trip_id) === item.agent_id
        ));
      if (!payoutMatches(existing, payoutRequest) || !sameItems) {
        throw new RequestError('Idempotency key is already used by a different payout request', 409);
      }
      await client.query('COMMIT');
      return c.json({ payout: existing, idempotent_replay: true }, 200);
    }

    const agencyResult = await client.query(
      `SELECT
         a.id, a.commission_rate, a.commission_type, a.commission_base, a.rate_mode,
         ARRAY(
           SELECT DISTINCT linked.client_key
           FROM (
             SELECT acl.client_key
             FROM agency_client_links acl
             WHERE acl.agency_id = a.id
             UNION ALL
             SELECT 'company:' || a.moovs_company_id
             WHERE a.moovs_company_id IS NOT NULL
           ) linked
         ) AS client_keys,
         co.moovs_operator_id, co.route_rate_config
       FROM agencies a
       LEFT JOIN commission_operators co ON co.id = a.operator_id
       WHERE a.id = $1 AND a.operator_id = $2
       FOR SHARE OF a`,
      [body.agency_id, body.operator_id],
    );
    if (agencyResult.rowCount === 0) throw new RequestError('Agency does not belong to operator');
    const agency = agencyResult.rows[0];
    if (!agency.moovs_operator_id) {
      throw new RequestError('Operator is not linked to a Moovs account');
    }
    const agencyClientKeys = new Set<string>(
      Array.isArray(agency.client_keys)
        ? agency.client_keys.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value))
        : [],
    );
    if (agencyClientKeys.size === 0) {
      throw new RequestError('Agency is not linked to a Moovs client');
    }

    const requestedTripIds = items.map((item) => item.moovs_trip_id);
    const authoritativeReservations = await fetchAuthoritativeReservations(
      body.operator_id,
      String(agency.moovs_operator_id),
      requestedTripIds,
    );
    if (authoritativeReservations.length !== requestedTripIds.length) {
      const found = new Set(authoritativeReservations.map((reservation) => reservation.moovs_trip_id));
      const missing = requestedTripIds.filter((tripId) => !found.has(tripId));
      throw new RequestError(`Trips were not found for this Moovs operator: ${missing.join(', ')}`);
    }
    const mismatchedTrips = authoritativeReservations
      .filter((reservation) => !reservation.client_keys.some((key) => agencyClientKeys.has(key)))
      .map((reservation) => reservation.moovs_trip_id);
    if (mismatchedTrips.length) {
      throw new RequestError(`Trips do not belong to the payout agency: ${mismatchedTrips.join(', ')}`);
    }

    const persistedReservations: any[] = [];
    for (const reservation of authoritativeReservations) {
      persistedReservations.push(await upsertReservation(client, reservation));
    }

    const reservationIds = persistedReservations.map((reservation) => reservation.id);
    const duplicateLinks = await client.query(
      `SELECT pr.reservation_id, pr.payout_id
       FROM payout_reservations pr
       WHERE pr.reservation_id = ANY($1::uuid[]) AND pr.payout_id <> $2
       LIMIT 1`,
      [reservationIds, payoutRequest.id],
    );
    if (duplicateLinks.rowCount) {
      throw new RequestError('One or more trips already belong to another payout', 409);
    }

    const existingAttributions = await client.query(
      `SELECT reservation_id, agency_id
       FROM reservation_attributions
       WHERE reservation_id = ANY($1::uuid[]) AND agency_id <> $2
       LIMIT 1`,
      [reservationIds, body.agency_id],
    );
    if (existingAttributions.rowCount) {
      throw new RequestError('One or more trips are attributed to another agency', 409);
    }

    const agentIds = [...new Set(items.map((item) => item.agent_id).filter(Boolean))];
    if (agentIds.length) {
      const agentResult = await client.query(
        'SELECT id FROM agents WHERE agency_id = $1 AND id = ANY($2::uuid[])',
        [body.agency_id, agentIds],
      );
      if (agentResult.rowCount !== agentIds.length) {
        throw new RequestError('One or more agents do not belong to the payout agency');
      }
    }

    const effectiveAttributions = persistedReservations.map((reservation) => (
      effectiveAttribution(reservation, agency, agency.route_rate_config)
    ));
    const totalRevenue = round2(persistedReservations.reduce(
      (sum, reservation) => sum + finiteNumber(reservation.total_amount, 'total_amount'),
      0,
    ));
    const totalCommission = round2(effectiveAttributions.reduce(
      (sum, attribution) => sum + attribution.commission_amount,
      0,
    ));
    const payoutResult = await client.query(
      `INSERT INTO payouts
        (id, operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
         total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        payoutRequest.id,
        payoutRequest.operator_id,
        payoutRequest.agency_id,
        payoutRequest.period_start,
        payoutRequest.period_end,
        items.length,
        totalRevenue,
        totalCommission,
        payoutRequest.adjustments,
        round2(totalCommission + payoutRequest.adjustments),
        payoutRequest.method,
        payoutRequest.reference_number,
        payoutRequest.status,
        payoutRequest.notes,
        payoutRequest.date_paid,
      ],
    );

    for (let index = 0; index < items.length; index += 1) {
      const attribution = effectiveAttributions[index];
      const reservationId = persistedReservations[index].id;
      await client.query(
        `INSERT INTO reservation_attributions
          (reservation_id, agency_id, agent_id, commission_rate, commission_type, commission_base, commission_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (reservation_id)
         DO UPDATE SET
           agency_id = EXCLUDED.agency_id,
           agent_id = EXCLUDED.agent_id,
           commission_rate = EXCLUDED.commission_rate,
           commission_type = EXCLUDED.commission_type,
           commission_base = EXCLUDED.commission_base,
           commission_amount = EXCLUDED.commission_amount
         RETURNING *`,
        [
          reservationId,
          body.agency_id,
          items[index].agent_id || null,
          attribution.commission_rate,
          attribution.commission_type,
          attribution.commission_base,
          attribution.commission_amount,
        ],
      );
      await client.query(
        `INSERT INTO payout_reservations (payout_id, reservation_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [payoutRequest.id, reservationId],
      );
    }

    await client.query('COMMIT');
    return c.json({ payout: payoutResult.rows[0], idempotent_replay: false }, 201);
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof RequestError) return c.json({ error: err.message }, err.status);
    console.error('Error creating payout from trips:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  } finally {
    client.release();
  }
});

// POST /payouts
app.post('/payouts', async (c) => {
  try {
    const body = await c.req.json();
    const {
      operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
      total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid,
    } = body;
    const r = await appQuery(
      `INSERT INTO payouts (operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
        total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, 'draft'), $13, $14)
       RETURNING *`,
      [operator_id, agency_id, period_start, period_end, total_trips, total_revenue,
       total_commission, adjustments, net_payout, method, reference_number, status, notes, date_paid],
    );
    return c.json(r.rows, 201);
  } catch (err: any) {
    console.error('Error creating payout:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// PATCH /payouts/:id
app.patch('/payouts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const allowedFields = [
      'period_start', 'period_end', 'total_trips', 'total_revenue', 'total_commission',
      'adjustments', 'net_payout', 'method', 'reference_number', 'status', 'notes', 'date_paid',
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (field in body) {
        sets.push(`${field} = $${idx++}`);
        vals.push(body[field]);
      }
    }
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

    vals.push(id);
    const r = await appQuery(
      `UPDATE payouts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error updating payout:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

// --- Payout Reservations ---

// GET /payout-reservations — ?payout_ids=X,Y,Z
app.get('/payout-reservations', async (c) => {
  try {
    const payoutIds = c.req.query('payout_ids');
    if (!payoutIds) return c.json({ error: 'Missing payout_ids' }, 400);
    const ids = payoutIds.split(',').filter(Boolean);
    if (ids.length === 0) return c.json([]);

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const r = await appQuery(
      `SELECT * FROM payout_reservations WHERE payout_id IN (${placeholders})`,
      ids,
    );
    return c.json(r.rows);
  } catch (err: any) {
    console.error('Error fetching payout reservations:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /payout-reservations — { payout_id, reservation_ids: string[] }
app.post('/payout-reservations', async (c) => {
  try {
    const { payout_id, reservation_ids } = await c.req.json();
    if (!payout_id || !reservation_ids?.length) return c.json({ error: 'Missing payout_id or reservation_ids' }, 400);

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const rid of reservation_ids) {
      values.push(`($${idx++}, $${idx++})`);
      params.push(payout_id, rid);
    }

    await appQuery(
      `INSERT INTO payout_reservations (payout_id, reservation_id) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`,
      params,
    );
    return c.json({ success: true }, 201);
  } catch (err: any) {
    console.error('Error creating payout reservations:', err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

export default app;
