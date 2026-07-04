export const dynamic = 'force-dynamic';

import { readCommissionJson, stripPortalToken } from '@/lib/commission-api';
import type { Agency, Agent, Reservation, ReservationAttribution } from '@/types/commission';
import type { RouteRateConfig } from '@/types/commissionOperator';
import { EMPTY_ROUTE_RATE_CONFIG } from '@/types/commissionOperator';
import { calculateCommission, resolveCommissionRate } from '@/lib/commission-calc';
import {
  getDemoAgencyById,
  getDemoAgencyByPortalToken,
  getDemoAgentByPortalToken,
  getDemoAgentsByAgency,
  getDemoAttributionsByAgency,
  getDemoPayoutsByAgency,
  getDemoReservationsByIds,
} from '@/demoData';

type Row = Record<string, any>;
type RawMoovsReservation = Record<string, unknown>;

const PORTAL_LOOKBACK_DAYS = 90;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function portalWindow() {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - PORTAL_LOOKBACK_DAYS);
  return { dateFrom: isoDate(dateFrom), dateTo: isoDate(dateTo) };
}

function money(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => text(item)).filter((item): item is string => Boolean(item))));
}

function liveId(operatorId: string, moovsTripId: string): string {
  return `live:${operatorId}:${moovsTripId}`;
}

function transformLiveReservation(raw: RawMoovsReservation, operatorId: string): Reservation | null {
  const moovsTripId = text(raw['Trip ID']);
  if (!moovsTripId) return null;

  const baseRate = money(raw['Base Rate']);
  const totalAmount = money(raw['Total Amount ($)']);
  const gratuity = money(raw['Driver Gratuity Amount']);

  return {
    id: liveId(operatorId, moovsTripId),
    operator_id: operatorId,
    moovs_trip_id: moovsTripId,
    moovs_company_id: text(raw['Company ID']),
    order_number: text(raw['Order Number']),
    confirmation_number: text(raw['Confirmation Number']),
    pickup_date: text(raw['Pickup Date Time']),
    pickup_location: text(raw['Pickup Address']),
    dropoff_location: text(raw['Dropoff Address']),
    passenger_name: text(raw['Passenger Contact Full Name']),
    booking_contact_id: text(raw['Booking Contact ID']),
    booking_contact_name: text(raw['Booking Contact Full Name']),
    booking_contact_email: text(raw['Booking Contact Email']),
    vehicle_type: text(raw['Vehicle Name']),
    trip_type: text(raw['Trip Type']) ?? text(raw['Source']),
    source: text(raw['Source']),
    shuttle_route_id: text(raw['Shuttle Route ID']),
    shuttle_route_name: text(raw['Shuttle Route Name']),
    base_rate_amount: baseRate,
    total_amount: totalAmount,
    total_with_gratuity: Math.round((totalAmount + gratuity) * 100) / 100,
    trip_status: text(raw['Status Slug']),
    client_keys: textArray(raw['Client Keys']),
    synced_at: new Date().toISOString(),
  };
}

function primaryAgencyClientKey(agency: Agency): string | undefined {
  const primary = agency.client_links?.find((link) => link.is_primary) ?? agency.client_links?.[0];
  return primary?.client_key ?? (agency.moovs_company_id ? `company:${agency.moovs_company_id}` : undefined);
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function findReservationAgent(reservation: Reservation, agents: Agent[] = []): Agent | null {
  const bookingContactId = normalize(reservation.booking_contact_id);
  const bookingContactEmail = normalize(reservation.booking_contact_email);

  if (!bookingContactId && !bookingContactEmail) return null;

  return agents.find((agent) => {
    if (agent.status !== 'active') return false;
    if (bookingContactId && normalize(agent.moovs_contact_id) === bookingContactId) return true;
    if (bookingContactEmail && normalize(agent.email) === bookingContactEmail) return true;
    return false;
  }) ?? null;
}

function syntheticAttribution(
  reservation: Reservation,
  agency: Agency,
  agents: Agent[],
  routeConfig: RouteRateConfig,
): ReservationAttribution {
  const agent = findReservationAgent(reservation, agents);
  const resolved = resolveCommissionRate(reservation, agency, routeConfig);
  return {
    id: `live:${agency.id}:${reservation.moovs_trip_id}`,
    reservation_id: reservation.id,
    agency_id: agency.id,
    agent_id: agent?.id ?? null,
    commission_rate: agency.commission_type === 'flat' ? agency.commission_rate : resolved.rate,
    commission_type: agency.commission_type,
    commission_base: agency.commission_base,
    commission_amount: calculateCommission(reservation, agency, routeConfig),
    attributed_at: new Date().toISOString(),
  };
}

async function reservationsByIds(ids: string[]): Promise<Reservation[]> {
  if (ids.length === 0) return [];
  return readCommissionJson<Reservation[]>(`/commission-reservations/by-ids?ids=${ids.map(encodeURIComponent).join(',')}`);
}

function parseRouteConfig(value: unknown): RouteRateConfig {
  if (!value || typeof value !== 'object') return EMPTY_ROUTE_RATE_CONFIG;
  const cfg = value as Partial<RouteRateConfig>;
  return {
    default_rate: typeof cfg.default_rate === 'number' ? cfg.default_rate : null,
    routes: cfg.routes && typeof cfg.routes === 'object' ? cfg.routes : {},
  };
}

async function fetchLivePortalReservations(agency: Agency, moovsOperatorId: string | null): Promise<Reservation[]> {
  if (!moovsOperatorId) return [];

  const { dateFrom, dateTo } = portalWindow();
  const clientKey = primaryAgencyClientKey(agency);
  const data = await readCommissionJson<{ reservations?: RawMoovsReservation[] }>(
    '/fetch-reservations',
    {
      method: 'POST',
      body: JSON.stringify({
        operator_id: moovsOperatorId,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: agency.moovs_company_id ?? undefined,
        client_key: clientKey,
      }),
      headers: { 'content-type': 'application/json' },
    },
  );

  return (data.reservations ?? [])
    .map((raw) => transformLiveReservation(raw, agency.operator_id))
    .filter((row): row is Reservation => Boolean(row));
}

async function portalRows(agency: Agency, agents: Agent[]) {
  const operatorRow = await readCommissionJson<Row>(
    `/commission-operators/${encodeURIComponent(agency.operator_id)}`,
    {},
    true,
  ).catch(() => null);
  const routeConfig = parseRouteConfig(operatorRow?.route_rate_config);
  const moovsOperatorId = (operatorRow?.moovs_operator_id as string | undefined) ?? null;

  const [persistedAttributions, payouts, liveReservations] = await Promise.all([
    readCommissionJson<ReservationAttribution[]>(`/attributions?agency_id=${encodeURIComponent(agency.id)}`),
    readCommissionJson<Row[]>(`/payouts?agency_id=${encodeURIComponent(agency.id)}`),
    fetchLivePortalReservations(agency, moovsOperatorId),
  ]);

  const persistedReservations = await reservationsByIds(unique(persistedAttributions.map((a) => a.reservation_id)));
  const persistedByTripId = new Map(persistedReservations.map((row) => [row.moovs_trip_id, row]));
  const persistedAttributionByReservationId = new Map(persistedAttributions.map((row) => [row.reservation_id, row]));

  const reservations: Reservation[] = liveReservations.map((live) => {
    const persisted = persistedByTripId.get(live.moovs_trip_id);
    return persisted ? { ...live, id: persisted.id, synced_at: persisted.synced_at } : live;
  });

  const attributions: ReservationAttribution[] = reservations.map((reservation) => (
    persistedAttributionByReservationId.get(reservation.id) ?? syntheticAttribution(reservation, agency, agents, routeConfig)
  ));

  const liveTripIds = new Set(liveReservations.map((row) => row.moovs_trip_id));
  for (const persistedReservation of persistedReservations) {
    if (liveTripIds.has(persistedReservation.moovs_trip_id)) continue;
    reservations.push(persistedReservation);
    const attribution = persistedAttributionByReservationId.get(persistedReservation.id);
    if (attribution) attributions.push(attribution);
  }

  return {
    reservations: reservations.sort((a, b) => (b.pickup_date || '').localeCompare(a.pickup_date || '')),
    attributions,
    payouts,
  };
}

function demoPortalResponse(token: string): Response | null {
  const agency = getDemoAgencyByPortalToken(token);
  if (agency) {
    const agents = getDemoAgentsByAgency(agency.id);
    const attributions = getDemoAttributionsByAgency(agency.id);
    const reservations = getDemoReservationsByIds(attributions.map((attr) => attr.reservation_id));
    const payouts = getDemoPayoutsByAgency(agency.id);

    return Response.json({
      view: 'gm',
      agency: stripPortalToken(agency as unknown as Row),
      agents: agents.map((agent) => stripPortalToken(agent as unknown as Row)),
      reservations,
      attributions,
      payouts,
    });
  }

  const agent = getDemoAgentByPortalToken(token);
  if (!agent) return null;

  const agentAgency = getDemoAgencyById(agent.agency_id);
  if (!agentAgency) return null;

  const allAttributions = getDemoAttributionsByAgency(agentAgency.id);
  const attributions = allAttributions.filter((attr) => attr.agent_id === agent.id);
  const reservations = getDemoReservationsByIds(attributions.map((attr) => attr.reservation_id));

  return Response.json({
    view: 'agent',
    agency: stripPortalToken(agentAgency as unknown as Row),
    agents: [],
    currentAgent: stripPortalToken(agent as unknown as Row),
    reservations,
    attributions,
    payouts: [],
  });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const demoResponse = demoPortalResponse(token);
  if (demoResponse) return demoResponse;

  if (!token || token.length < 24) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const agencyRows = await readCommissionJson<Agency[]>(`/agencies/by-token/${encodeURIComponent(token)}`);
  const agency = agencyRows[0];

  if (agency) {
    const agents = await readCommissionJson<Agent[]>(`/agents?agency_id=${encodeURIComponent(agency.id)}`);
    const { reservations, attributions, payouts } = await portalRows(agency, agents);

    return Response.json({
      view: 'gm',
      agency: stripPortalToken(agency as unknown as Row),
      agents: agents.map((agent) => stripPortalToken(agent as unknown as Row)),
      reservations,
      attributions,
      payouts,
    });
  }

  const agentRows = await readCommissionJson<Agent[]>(`/agents/by-token/${encodeURIComponent(token)}`);
  const agent = agentRows[0];
  if (!agent) return Response.json({ error: 'Not found' }, { status: 404 });

  const agencyById = await readCommissionJson<Agency[]>(`/agencies/${encodeURIComponent(agent.agency_id)}`);
  const agentAgency = agencyById[0];
  if (!agentAgency) return Response.json({ error: 'Not found' }, { status: 404 });

  const agents = await readCommissionJson<Agent[]>(`/agents?agency_id=${encodeURIComponent(agentAgency.id)}`);
  const { reservations: allReservations, attributions: allAttributions } = await portalRows(agentAgency, agents);
  const attributions = allAttributions.filter((a) => a.agent_id === agent.id);
  const reservationIds = new Set(attributions.map((a) => a.reservation_id));
  const reservations = allReservations.filter((reservation) => reservationIds.has(reservation.id));

  return Response.json({
    view: 'agent',
    agency: stripPortalToken(agentAgency as unknown as Row),
    agents: [],
    currentAgent: stripPortalToken(agent as unknown as Row),
    reservations,
    attributions,
    payouts: [],
  });
}
