import { operatorTimezone } from '../operatorTimezone.js';
import { Hono } from 'hono';
import { query } from '../db.js';

const app = new Hono();

// POST /fetch-reservations { operator_id, date_from?, date_to?, company_id?, client_key?, limit?, offset? }
// Returns BOTH regular trips and shuttle bookings in a unified format
app.post('/fetch-reservations', async (c) => {
  try {
    const { operator_id, date_from, date_to, company_id, client_key, client_keys, limit, offset, include_cancelled } = await c.req.json();

    if (!operator_id) {
      return c.json({ error: 'Missing operator_id' }, 400);
    }

    const timeZone=await operatorTimezone(operator_id);
    const params: any[] = [operator_id,timeZone];
    let tripDateFilter = '';
    let shuttleDateFilter = '';
    let tripCompanyFilter = '';
    let shuttleCompanyFilter = '';
    let tripClientFilter = '';
    let shuttleClientFilter = '';

    if (date_from) {
      params.push(date_from);
      tripDateFilter += ` AND pickup.date_time >= $${params.length}::date`;
      shuttleDateFilter += ` AND sb.travel_date >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      tripDateFilter += ` AND pickup.date_time < ($${params.length}::date + INTERVAL '1 day')`;
      shuttleDateFilter += ` AND sb.travel_date <= $${params.length}::date`;
    }
    if (company_id) {
      params.push(company_id);
      tripCompanyFilter += ` AND req.company_id::text = $${params.length}`;
      shuttleCompanyFilter += ` AND (
        sc.company_id::text = $${params.length}
        OR sp.company_id::text = $${params.length}
        OR rd.company_id::text = $${params.length}
      )`;
    }
    if (typeof client_key === 'string' && client_key.trim()) {
      const [clientType, clientId] = client_key.trim().split(':');
      if (clientType === 'company' && clientId) {
        params.push(clientId);
        tripClientFilter += ` AND req.company_id::text = $${params.length}`;
        shuttleClientFilter += ` AND (
          sc.company_id::text = $${params.length}
          OR sp.company_id::text = $${params.length}
          OR rd.company_id::text = $${params.length}
        )`;
      } else if (clientType === 'shuttle_client' && clientId) {
        params.push(clientId);
        tripClientFilter += ` AND req.company_id::text = $${params.length} AND false`;
        shuttleClientFilter += ` AND sb.shuttle_client_id::text = $${params.length}`;
      }
    }

    if (client_keys !== undefined) {
      if (!Array.isArray(client_keys) || !client_keys.length || client_keys.length > 100 || client_keys.some((k: unknown) => typeof k !== 'string' || !/^(company|shuttle_client):[^:,\s]+$/.test(k))) return c.json({error:'Invalid client_keys'},400);
      params.push(client_keys);
      const n=params.length;
      tripClientFilter += ` AND ('company:' || req.company_id::text) = ANY($${n}::text[])`;
      shuttleClientFilter += ` AND ARRAY_REMOVE(ARRAY['shuttle_client:' || sb.shuttle_client_id::text,'company:' || sc.company_id::text,'company:' || sp.company_id::text,'company:' || rd.company_id::text],NULL) && $${n}::text[]`;
    }

    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 250)
      : null;
    const parsedOffset = Number.parseInt(String(offset ?? 0), 10);
    const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    // Query 1: Regular trips (request/trip/route)
    const tripsResult = await query(
      `SELECT
        t.trip_id as "Trip ID",
        to_char(pickup.date_time,'YYYY-MM-DD') AS "Travel Day",
        $2::text AS "Booking Timezone",
        req.request_id::text as "Request ID",
        r.public_id as "Route Public ID",
        COALESCE((SELECT SUM(sr.sub_refund_amount) FROM sub_refund sr JOIN refund rf ON rf.refund_id = sr.refund_id AND rf.refund_status IN ('succeeded','pending') WHERE sr.route_id = r.route_id OR sr.farmed_route_id = fr.farmed_route_id),0) / 100.0 as "Refund Amount",
        req.order_number as "Order Number",
        req.order_number as "Confirmation Number",
        req.company_id as "Company ID",
        bc.contact_id as "Booking Contact ID",
        COALESCE(
          NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(bc.first_name), ''), NULLIF(BTRIM(bc.last_name), '')), ''),
          NULLIF(bc.email, '')
        ) as "Booking Contact Full Name",
        bc.email as "Booking Contact Email",
        -- Legacy API Z shape is a wall-clock container, not an instant. No timezone conversion.
        to_char(pickup.date_time, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "Pickup Date Time",
        to_char(dropoff.date_time, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "Dropoff Time Local",
        pickup.location as "Pickup Address",
        dropoff.location as "Dropoff Address",
        COALESCE(
          NULLIF(t.temporary_passenger->>'name', ''),
          NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(pc.first_name), ''), NULLIF(BTRIM(pc.last_name), '')), ''),
          NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(tc.first_name), ''), NULLIF(BTRIM(tc.last_name), '')), ''),
          NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(bc.first_name), ''), NULLIF(BTRIM(bc.last_name), '')), ''),
          NULLIF(bc.email, '')
        ) as "Passenger Contact Full Name",
        COALESCE(fv.name, v.name, '') as "Vehicle Name",
        req.type as "Trip Type",
        COALESCE(NULLIF(fr.base_rate_amt, 0), r.base_rate_amt, 0) / 100.0 as "Base Rate",
        COALESCE(NULLIF(fr.tax_amt, 0), r.tax_amt, 0) / 100.0 as "Tax Amount",
        COALESCE(NULLIF(fr.driver_gratuity_amt, 0), r.driver_gratuity_amt, 0) / 100.0 as "Driver Gratuity Amount",
        COALESCE(NULLIF(fr.promo_discount_amt, 0), r.promo_discount_amt, 0) / 100.0 as "Discount Amount ($)",
        COALESCE(NULLIF(fr.other_amt, 0), r.other_amt, 0) / 100.0 as "Other Amount",
        COALESCE(NULLIF(fr.other2_amt, 0), r.other2_amt, 0) / 100.0 as "Other2 Amt",
        COALESCE(NULLIF(fr.other3_amt, 0), r.other3_amt, 0) / 100.0 as "Other3 Amt",
        COALESCE(NULLIF(fr.meet_greet_amt, 0), r.meet_greet_amt, 0) / 100.0 as "Meet Greet Amount",
        COALESCE(NULLIF(fr.tolls_amt, 0), r.tolls_amt, 0) / 100.0 as "Tolls Amount",
        COALESCE(r.forward_facing_seat_amt, 0) / 100.0 as "Forward Facing Seat Amt",
        COALESCE(r.rear_facing_seat_amt, 0) / 100.0 as "Rear Facing Seat Amt",
        COALESCE(r.booster_seat_amt, 0) / 100.0 as "Booster Seat Amt",
        COALESCE(r.promo_code_amt, 0) / 100.0 as "Promo Code Amt",
        r.status_slug as "Status Slug",
        'trip' as "Source",
        CASE
          WHEN req.company_id IS NOT NULL THEN ARRAY['company:' || req.company_id::text]
          ELSE ARRAY[]::text[]
        END as "Client Keys"
      FROM request req
      JOIN trip t ON t.request_id = req.request_id AND t.removed_at IS NULL
      LEFT JOIN route r ON r.trip_id = t.trip_id AND r.removed_at IS NULL
      LEFT JOIN farmed_route fr ON fr.route_id = r.route_id AND fr.cancelled_at IS NULL
      LEFT JOIN LATERAL (
        SELECT ct.contact_id FROM contact_team ct WHERE ct.team_id = req.team_id LIMIT 1
      ) booking_team ON true
      LEFT JOIN contact bc ON booking_team.contact_id = bc.contact_id
      LEFT JOIN contact tc ON t.contact_id = tc.contact_id
      LEFT JOIN LATERAL (
        SELECT s.location, s.date_time, s.contact_id as passenger_contact_id FROM stop s WHERE s.trip_id = t.trip_id ORDER BY s.stop_index ASC LIMIT 1
      ) pickup ON true
      LEFT JOIN LATERAL (
        SELECT s.location, s.date_time FROM stop s WHERE s.trip_id = t.trip_id ORDER BY s.stop_index DESC LIMIT 1
      ) dropoff ON true
      LEFT JOIN vehicle v ON r.vehicle_id = v.vehicle_id
      LEFT JOIN vehicle fv ON fr.vehicle_id = fv.vehicle_id
      LEFT JOIN contact pc ON pickup.passenger_contact_id = pc.contact_id
      WHERE req.operator_id = $1${tripDateFilter}${tripCompanyFilter}${tripClientFilter}
      ORDER BY pickup.date_time ASC NULLS LAST`,
      params
    );

    // Query 2: Shuttle bookings
    const shuttleResult = await query(
      `SELECT
        sb.booking_id as "Trip ID",
        to_char(sb.travel_date,'YYYY-MM-DD') AS "Travel Day",
        $2::text AS "Booking Timezone",
        sb.external_reservation_id as "Order Number",
         -- Missing legacy booking-price facts must not become a payable zero-price booking.
         CASE WHEN pay.booking_id IS NULL THEN NULL ELSE (
           COALESCE((SELECT SUM(ra.refund_amount_in_cents) FROM shuttle_booking_refund_allocation ra
             JOIN shuttle_refund rf ON rf.shuttle_refund_id=ra.shuttle_refund_id AND rf.status IN ('succeeded','pending')
             WHERE ra.booking_id=sb.booking_id AND ra.operator_id=sb.operator_id),0)
           + COALESCE((SELECT SUM(rf.refund_amount_in_cents) FROM shuttle_refund rf
             JOIN shuttle_payment legacy ON legacy.shuttle_payment_id=rf.shuttle_payment_id
             WHERE legacy.booking_id=sb.booking_id AND rf.operator_id=sb.operator_id AND rf.status IN ('succeeded','pending')
               AND NOT EXISTS(SELECT 1 FROM shuttle_booking_refund_allocation ra WHERE ra.shuttle_refund_id=rf.shuttle_refund_id)),0)
         ) END / 100.0 AS "Refund Amount",
        sb.external_reservation_id as "Confirmation Number",
        COALESCE(sc.company_id, sp.company_id, rd.company_id) as "Company ID",
        NULL::uuid as "Booking Contact ID",
        NULL::text as "Booking Contact Full Name",
        NULL::text as "Booking Contact Email",
        sb.scheduled_pickup_time as "Pickup Date Time",
        sb.scheduled_dropoff_time as "Dropoff Time Local",
        sb.pickup_location as "Pickup Address",
        sb.dropoff_location as "Dropoff Address",
        CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, '')) as "Passenger Contact Full Name",
        '' as "Vehicle Name",
        'shuttle' as "Trip Type",
        COALESCE(pay.amount_in_cents, 0) / 100.0 as "Base Rate",
        0 as "Tax Amount",
        0 as "Driver Gratuity Amount",
        0 as "Discount Amount ($)",
        0 as "Other Amount",
        0 as "Other2 Amt",
        0 as "Other3 Amt",
        0 as "Meet Greet Amount",
        0 as "Tolls Amount",
        0 as "Forward Facing Seat Amt",
        0 as "Rear Facing Seat Amt",
        0 as "Booster Seat Amt",
        0 as "Promo Code Amt",
        sb.booking_status as "Status Slug",
        'shuttle' as "Source",
        sb.passenger_count as "Passenger Count",
        sc.name as "Shuttle Client Name",
        rd.route_definition_id as "Shuttle Route ID",
        rd.name as "Shuttle Route Name",
        ARRAY_REMOVE(ARRAY[
          CASE WHEN sb.shuttle_client_id IS NOT NULL THEN 'shuttle_client:' || sb.shuttle_client_id::text END,
          CASE WHEN sc.company_id IS NOT NULL THEN 'company:' || sc.company_id::text END,
          CASE WHEN sp.company_id IS NOT NULL THEN 'company:' || sp.company_id::text END,
          CASE WHEN rd.company_id IS NOT NULL THEN 'company:' || rd.company_id::text END
        ], NULL) as "Client Keys"
      FROM shuttle_booking sb
      LEFT JOIN shuttle_client sc ON sb.shuttle_client_id = sc.shuttle_client_id AND sc.operator_id = sb.operator_id
      LEFT JOIN shuttle_passenger sp ON sb.shuttle_passenger_id = sp.shuttle_passenger_id AND sp.operator_id = sb.operator_id
      LEFT JOIN shuttle_payment pay ON pay.booking_id = sb.booking_id
      LEFT JOIN shuttle_route_definition_version rv ON rv.route_version_id = sb.route_version_id
      LEFT JOIN shuttle_route_definition rd ON rd.route_definition_id = rv.route_definition_id AND rd.operator_id = sb.operator_id
      WHERE sb.operator_id = $1
        ${include_cancelled === true ? '' : 'AND sb.cancelled_at IS NULL'}${shuttleDateFilter}${shuttleCompanyFilter}${shuttleClientFilter}
      ORDER BY sb.travel_date ASC, sb.scheduled_pickup_time ASC NULLS LAST`,
      params
    );

    // Transform and merge both result sets
    const fetchedAt=new Date().toISOString();
    const health=(r:any)=>({...r,'Booking Timezone':timeZone,'Facts Fetched At':fetchedAt});
    const tripReservations = tripsResult.rows.map(formatTrip).map(health);
    const shuttleReservations = shuttleResult.rows.map(formatShuttle).map(health);

    // Merge and sort by pickup date
    const reservations = [...tripReservations, ...shuttleReservations].sort((a, b) => {
      const dateA = a['Travel Day'] || '';
      const dateB = b['Travel Day'] || '';
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });

    const total = reservations.length;
    const pagedReservations = safeLimit === null
      ? reservations
      : reservations.slice(safeOffset, safeOffset + safeLimit);

    return c.json({
      success: true,
      facts_metadata:{fetched_at:fetchedAt,time_zone:timeZone,source:'Moovs replica',complete:safeLimit===null || safeOffset+safeLimit>=total},
      reservations: pagedReservations,
      total,
      limit: safeLimit,
      offset: safeOffset,
      counts: {
        trips: tripReservations.length,
        shuttle_bookings: shuttleReservations.length,
        total,
        returned: pagedReservations.length,
      },
    });
  } catch (err: any) {
    console.error('Error fetching reservations:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// GET /fetch-shuttle-routes?operator_id=UUID — list an operator's shuttle routes (read-only)
app.get('/fetch-shuttle-routes', async (c) => {
  try {
    const operatorId = c.req.query('operator_id');
    if (!operatorId) return c.json({ error: 'Missing operator_id' }, 400);

    const r = await query(
      `SELECT DISTINCT ON (route_definition_id) route_definition_id, name
       FROM shuttle_route_definition
       WHERE operator_id = $1
       ORDER BY route_definition_id, name ASC`,
      [operatorId],
    );

    const routes = r.rows
      .map((row: any) => ({
        route_id: String(row.route_definition_id),
        name: row.name || 'Unnamed route',
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return c.json({ success: true, routes });
  } catch (err: any) {
    console.error('Error fetching shuttle routes:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

function formatTrip(row: any) {
  const baseRate = parseFloat(row['Base Rate']) || 0;
  const tax = parseFloat(row['Tax Amount']) || 0;
  const gratuity = parseFloat(row['Driver Gratuity Amount']) || 0;
  const discount = parseFloat(row['Discount Amount ($)']) || 0;
  const other = parseFloat(row['Other Amount']) || 0;
  const other2 = parseFloat(row['Other2 Amt']) || 0;
  const other3 = parseFloat(row['Other3 Amt']) || 0;
  const meetGreet = parseFloat(row['Meet Greet Amount']) || 0;
  const tolls = parseFloat(row['Tolls Amount']) || 0;
  const fwdSeat = parseFloat(row['Forward Facing Seat Amt']) || 0;
  const rearSeat = parseFloat(row['Rear Facing Seat Amt']) || 0;
  const boosterSeat = parseFloat(row['Booster Seat Amt']) || 0;
  const promoCode = parseFloat(row['Promo Code Amt']) || 0;
  // Keep gratuity separate so commission_base can distinguish total_amount from
  // total_with_gratuity. Browser/server transforms add gratuity exactly once.
  const total = baseRate + tax - discount + other + other2 + other3 + meetGreet + tolls + fwdSeat + rearSeat + boosterSeat + promoCode;

  const clientKeys = Array.isArray(row['Client Keys']) ? Array.from(new Set(row['Client Keys'].filter(Boolean))) : [];

  return {
    'Trip ID': row['Trip ID'],
    'Request ID': row['Request ID'] || null,
    'Route Public ID': row['Route Public ID'] || null,
    'Refund Amount': row['Refund Amount'] == null ? null : Number(row['Refund Amount']),
    'Order Number': row['Order Number'] || '',
    'Confirmation Number': row['Confirmation Number'] || '',
    'Company ID': row['Company ID'] || null,
    'Booking Contact ID': row['Booking Contact ID'] || null,
    'Booking Contact Full Name': (row['Booking Contact Full Name'] || '').trim() || null,
    'Booking Contact Email': row['Booking Contact Email'] || null,
    'Travel Day': row['Travel Day'] ?? null,
    'Pickup Date Time': row['Pickup Date Time'] || '',
    'Dropoff Time Local': row['Dropoff Time Local'] || '',
    'Pickup Address': row['Pickup Address'] || '',
    'Dropoff Address': row['Dropoff Address'] || '',
    'Passenger Contact Full Name': (row['Passenger Contact Full Name'] || '').trim(),
    'Vehicle Name': row['Vehicle Name'] || '',
    'Trip Type': row['Trip Type'] || '',
    'Base Rate': baseRate,
    'Tax Amount': tax,
    'Driver Gratuity Amount': gratuity,
    'Discount Amount ($)': discount,
    'Other Amount': other,
    'Other2 Amt': other2,
    'Other3 Amt': other3,
    'Meet Greet Amount': meetGreet,
    'Tolls Amount': tolls,
    'Total Amount ($)': total,
    'Status Slug': row['Status Slug'] || '',
    'Source': 'trip',
    'Client Keys': clientKeys,
  };
}

function formatShuttle(row: any) {
  const baseRate = parseFloat(row['Base Rate']) || 0;
  const clientKeys = Array.isArray(row['Client Keys']) ? Array.from(new Set(row['Client Keys'].filter(Boolean))) : [];

  return {
    'Trip ID': row['Trip ID'],
    'Request ID': row['Request ID'] || null,
    'Route Public ID': row['Route Public ID'] || null,
    'Refund Amount': row['Refund Amount'] == null ? null : Number(row['Refund Amount']),
    'Order Number': row['Order Number'] || '',
    'Confirmation Number': row['Confirmation Number'] || '',
    'Company ID': row['Company ID'] || null,
    'Booking Contact ID': row['Booking Contact ID'] || null,
    'Booking Contact Full Name': row['Booking Contact Full Name'] || null,
    'Booking Contact Email': row['Booking Contact Email'] || null,
    'Travel Day': row['Travel Day'] ?? null,
    'Pickup Date Time': row['Pickup Date Time'] || '',
    'Dropoff Time Local': row['Dropoff Time Local'] || '',
    'Pickup Address': row['Pickup Address'] || '',
    'Dropoff Address': row['Dropoff Address'] || '',
    'Passenger Contact Full Name': (row['Passenger Contact Full Name'] || '').trim(),
    'Vehicle Name': row['Vehicle Name'] || '',
    'Trip Type': 'shuttle',
    'Base Rate': baseRate,
    'Tax Amount': 0,
    'Driver Gratuity Amount': 0,
    'Discount Amount ($)': 0,
    'Other Amount': 0,
    'Other2 Amt': 0,
    'Other3 Amt': 0,
    'Meet Greet Amount': 0,
    'Tolls Amount': 0,
    'Total Amount ($)': baseRate,
    'Status Slug': row['Status Slug'] || '',
    'Source': 'shuttle',
    'Client Keys': clientKeys,
    'Passenger Count': row['Passenger Count'] || 1,
    'Shuttle Client Name': row['Shuttle Client Name'] || null,
    'Shuttle Route ID': row['Shuttle Route ID'] ? String(row['Shuttle Route ID']) : null,
    'Shuttle Route Name': row['Shuttle Route Name'] || null,
  };
}

export default app;
