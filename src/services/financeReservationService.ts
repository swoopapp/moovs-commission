import { packUuidIds } from '../lib/uuid-packing';
import { config } from '../config/env';
import type { Reservation } from '../types/commission';
import { isDemoOperatorId } from '../demoData';
import {
  fetchLiveReservationPage,
  type FetchReservationsOptions,
} from './reservationService';
import { mapWithConcurrency } from '../lib/concurrency';
import { reservationTravelDay, validTimeZone } from '../lib/operator-time';
export async function fetchFinancePeriod(
  operatorId: string,
  moovsOperatorId: string,
  options?: FetchReservationsOptions,
) {
  if (isDemoOperatorId(operatorId))
    return fetchLiveReservationPage(operatorId, moovsOperatorId, {
      ...options,
      limit: undefined,
      offset: undefined,
    });
  const res = await fetch(`${config.apiBaseUrl}/workflow/period`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operator_id: operatorId,
      date_from: options?.dateFrom,
      date_to: options?.dateTo,
    }),
  });
  if (!res.ok)
    throw new Error(
      'Current Moovs period manifest unavailable. Reload before reconciling.',
    );
  const manifest = await res.json();
  if (
    !Number.isInteger(manifest.total) ||
    manifest.total < 0 ||
    !Array.isArray(manifest.identities) ||
    !Number.isInteger(manifest.max_records) ||
    manifest.max_records < 1 ||
    manifest.max_records > 25000
  )
    throw new Error(
      'Invalid Moovs period manifest. Reload before reconciling.',
    );
  if (!manifest.metadata?.complete)
    throw new Error(
      `More than ${manifest.max_records.toLocaleString('en-US')} bookings. Narrow the period for complete reconciliation.`,
    );
  if (
    manifest.total > manifest.max_records ||
    manifest.identities.length !== manifest.total ||
    !validTimeZone(manifest.metadata.time_zone) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(manifest.metadata.fetched_at ?? '') ||
    !Number.isFinite(Date.parse(manifest.metadata.fetched_at))
  )
    throw new Error(
      'Incomplete Moovs period manifest. Reload before reconciling.',
    );
  const expected = new Map<
    string,
    { moovs_trip_id: string; travel_day: string; source: string }
  >();
  for (const identity of manifest.identities) {
    if (
      typeof identity.moovs_trip_id !== 'string' ||
      !identity.moovs_trip_id ||
      expected.has(identity.moovs_trip_id) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(identity.travel_day ?? '') ||
      !['trip', 'shuttle'].includes(identity.source) ||
      identity.travel_day < options!.dateFrom! ||
      identity.travel_day > options!.dateTo!
    )
      throw new Error(
        'Duplicate or invalid Moovs period identity. Reload before reconciling.',
      );
    expected.set(identity.moovs_trip_id, identity);
  }
  const ids = [...expected.keys()],
    chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 350) chunks.push(ids.slice(i, i + 350));
  const controller = new AbortController();
  const pages = await mapWithConcurrency(chunks, 3, async (chunk) => {
    if (controller.signal.aborted)
      throw new Error('Moovs period read cancelled after an incomplete chunk.');
    const r = await fetch(`${config.apiBaseUrl}/workflow/facts`, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operator_id: operatorId,
        trip_ids_packed: packUuidIds(chunk),
        include_cancelled: true,
      }),
    });
    if (!r.ok)
      throw new Error(
        'Current Moovs facts unavailable. Reload before reconciling.',
      );
    const facts: Reservation[] = await r.json();
    if (!Array.isArray(facts) || facts.length !== chunk.length)
      throw new Error('Incomplete Moovs facts. Reload before reconciling.');
    const remaining = new Set(chunk);
    for (const fact of facts) {
      const identity = expected.get(fact.moovs_trip_id);
      if (
        !identity ||
        !remaining.delete(fact.moovs_trip_id) ||
        fact.operator_id !== operatorId ||
        fact.source !== identity.source ||
        fact.booking_timezone !== manifest.metadata.time_zone ||
        reservationTravelDay(fact) !== identity.travel_day
      )
        throw new Error(
          'Bookings changed since period selection. Reload for consistent reconciliation.',
        );
      if (
        !fact.facts_fetched_at ||
        !Number.isFinite(Date.parse(fact.facts_fetched_at)) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(fact.facts_fetched_at)
      )
        throw new Error('Moovs fact refresh metadata unavailable.');
    }
    return facts.map((fact) => ({
      ...fact,
      id: `live:${operatorId}:${fact.moovs_trip_id}`,
      fact_origin: 'live' as const,
    }));
  }).catch((error) => {
    controller.abort();
    throw error;
  });
  const reservations = pages.flat();
  return { reservations, total: manifest.total, metadata: manifest.metadata };
}
