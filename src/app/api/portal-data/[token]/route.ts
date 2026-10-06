import { reconcileBookings } from '@/lib/finance-reconciliation';
import { reservationTravelDay } from '../../../../lib/operator-time';
import { commissionState } from '@/lib/commission-workflow';
import {
  publicReservation,
  partnerQuestions,
  agentStatements,
  publicStatement,
} from '@/lib/partner-scope';
import type { WorkflowData } from '@/types/workflow';
import { agentMatch } from '@/lib/commission-workflow';
export const dynamic = 'force-dynamic';

import { readCommissionJson, stripPortalToken } from '@/lib/commission-api';
import type {
  Agency,
  Agent,
  Payout,
  PayoutReservation,
  Reservation,
  ReservationAttribution,
} from '@/types/commission';
import type { RouteRateConfig } from '@/types/commissionOperator';
import { EMPTY_ROUTE_RATE_CONFIG } from '@/types/commissionOperator';
import {
  calculateCommission,
  resolveCommissionRate,
} from '@/lib/commission-calc';
import {
  getDemoWorkflow,
  demoRouteRateConfig,
  getDemoAgencyById,
  getDemoAgencyByPortalToken,
  getDemoAgentByPortalToken,
  getDemoAgentsByAgency,
  getDemoAttributionsByAgency,
  getDemoPayoutsByAgency,
  getDemoPayoutReservationsByPayouts,
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
  const parsed =
    typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => text(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function liveId(operatorId: string, moovsTripId: string): string {
  return `live:${operatorId}:${moovsTripId}`;
}

function transformLiveReservation(
  raw: RawMoovsReservation,
  operatorId: string,
): Reservation | null {
  const moovsTripId = text(raw['Trip ID']);
  if (!moovsTripId) return null;

  const baseRate = money(raw['Base Rate']);
  const totalAmount = money(raw['Total Amount ($)']);
  const gratuity = money(raw['Driver Gratuity Amount']);

  return {
    travel_day: text(raw['Travel Day']),
    booking_timezone: text(raw['Booking Timezone']),
    fact_origin: 'live',
    facts_fetched_at: text(raw['Facts Fetched At']) ?? undefined,
    id: liveId(operatorId, moovsTripId),
    operator_id: operatorId,
    moovs_trip_id: moovsTripId,
    moovs_request_id: text(raw['Request ID']),
    route_public_id: text(raw['Route Public ID']),
    refund_amount:
      raw['Refund Amount'] == null ? null : money(raw['Refund Amount']),
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

function agencyClientKeys(agency: Agency): string[] {
  return unique([
    ...(agency.client_links ?? []).map((l) => l.client_key),
    agency.moovs_company_id ? `company:${agency.moovs_company_id}` : null,
  ]);
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function findReservationAgent(
  reservation: Reservation,
  agents: Agent[] = [],
): Agent | null {
  return agentMatch(reservation, agents).agent;
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
    commission_rate: resolved.rate,
    commission_type: agency.commission_type,
    commission_base: agency.commission_base,
    commission_amount: calculateCommission(reservation, agency, routeConfig),
    attributed_at: new Date().toISOString(),
    rule_source: resolved.source,
  };
}

async function reservationsByIds(ids: string[]): Promise<Reservation[]> {
  if (ids.length === 0) return [];
  return readCommissionJson<Reservation[]>(
    `/commission-reservations/by-ids?ids=${ids.map(encodeURIComponent).join(',')}`,
  );
}

function parseRouteConfig(value: unknown): RouteRateConfig {
  if (!value || typeof value !== 'object') return EMPTY_ROUTE_RATE_CONFIG;
  const cfg = value as Partial<RouteRateConfig>;
  return {
    default_rate:
      typeof cfg.default_rate === 'number' ? cfg.default_rate : null,
    routes: cfg.routes && typeof cfg.routes === 'object' ? cfg.routes : {},
  };
}

async function fetchLivePortalReservations(
  agency: Agency,
  moovsOperatorId: string | null,
): Promise<Reservation[]> {
  if (!moovsOperatorId) return [];

  const { dateFrom, dateTo } = portalWindow();
  const clientKeys = agencyClientKeys(agency);
  if (!clientKeys.length) return [];
  const data = await readCommissionJson<{
    reservations?: RawMoovsReservation[];
  }>('/fetch-reservations', {
    method: 'POST',
    body: JSON.stringify({
      operator_id: moovsOperatorId,
      date_from: dateFrom,
      date_to: dateTo,
      client_keys: clientKeys,
    }),
    headers: { 'content-type': 'application/json' },
  });

  return (data.reservations ?? [])
    .map((raw) => transformLiveReservation(raw, agency.operator_id))
    .filter((row): row is Reservation => Boolean(row));
}

function isInPortalWindow(reservation: Reservation): boolean {
  const pickupDate = reservationTravelDay(reservation);
  if (!pickupDate) return false;
  const { dateFrom, dateTo } = portalWindow();
  return pickupDate >= dateFrom && pickupDate <= dateTo;
}

async function payoutReservationRows(
  payouts: Payout[],
): Promise<PayoutReservation[]> {
  const paidPayoutIds = payouts
    .filter((payout) => payout.status === 'paid')
    .map((payout) => payout.id);
  if (paidPayoutIds.length === 0) return [];

  const batches: string[][] = [];
  for (let index = 0; index < paidPayoutIds.length; index += 100) {
    batches.push(paidPayoutIds.slice(index, index + 100));
  }
  const results = await Promise.all(
    batches.map((ids) =>
      readCommissionJson<PayoutReservation[]>(
        `/payout-reservations?payout_ids=${ids.map(encodeURIComponent).join(',')}`,
      ),
    ),
  );
  return results.flat();
}

function outstandingCommission(
  attributions: ReservationAttribution[],
  paidReservationIds: Set<string>,
): number {
  return money(
    attributions.reduce(
      (sum, attribution) =>
        paidReservationIds.has(attribution.reservation_id)
          ? sum
          : sum + money(attribution.commission_amount),
      0,
    ),
  );
}

async function portalRows(agency: Agency, agents: Agent[]) {
  const operatorRow = await readCommissionJson<Row>(
    `/commission-operators/${encodeURIComponent(agency.operator_id)}`,
    {},
    true,
  ).catch(() => null);
  const routeConfig = parseRouteConfig(operatorRow?.route_rate_config);
  const moovsOperatorId =
    (operatorRow?.moovs_operator_id as string | undefined) ?? null;

  const [persistedAttributions, payouts, liveReservations] = await Promise.all([
    readCommissionJson<ReservationAttribution[]>(
      `/attributions?agency_id=${encodeURIComponent(agency.id)}`,
    ),
    readCommissionJson<Payout[]>(
      `/payouts?agency_id=${encodeURIComponent(agency.id)}`,
    ),
    fetchLivePortalReservations(agency, moovsOperatorId),
  ]);
  const payoutReservations = await payoutReservationRows(payouts);
  const paidReservationIds = new Set(
    payoutReservations.map((row) => row.reservation_id),
  );

  const persistedReservations = await reservationsByIds(
    unique(persistedAttributions.map((a) => a.reservation_id)),
  );
  const persistedByTripId = new Map(
    persistedReservations.map((row) => [row.moovs_trip_id, row]),
  );
  const persistedAttributionByReservationId = new Map(
    persistedAttributions.map((row) => [row.reservation_id, row]),
  );

  const reservations: Reservation[] = liveReservations.map((live) => {
    const persisted = persistedByTripId.get(live.moovs_trip_id);
    return persisted
      ? { ...live, id: persisted.id, synced_at: persisted.synced_at }
      : live;
  });

  const attributions: ReservationAttribution[] = reservations.map(
    (reservation) =>
      (paidReservationIds.has(reservation.id)
        ? persistedAttributionByReservationId.get(reservation.id)
        : null) ??
      syntheticAttribution(reservation, agency, agents, routeConfig),
  );

  const liveTripIds = new Set(liveReservations.map((row) => row.moovs_trip_id));
  for (const persistedReservation of persistedReservations) {
    if (
      liveTripIds.has(persistedReservation.moovs_trip_id) ||
      !isInPortalWindow(persistedReservation)
    )
      continue;
    reservations.push({ ...persistedReservation, fact_origin: 'snapshot' });
    const attribution = persistedAttributionByReservationId.get(
      persistedReservation.id,
    );
    if (attribution) attributions.push(attribution);
  }

  let workflow: WorkflowData = { reviews: [], events: [], questions: [] };
  let workflowAvailable = true;
  try {
    workflow = await readCommissionJson<WorkflowData>(
      `/workflow?agency_id=${encodeURIComponent(agency.id)}`,
    );
  } catch {
    workflowAvailable = false;
  }
  const financialRows = reconcileBookings(
    reservations,
    [{ agency, agents, workflow, workflowAvailable }],
    payouts,
    payoutReservations,
    persistedAttributions,
    routeConfig,
  );
  const commissionStates = Object.fromEntries(
    reservations.map((r) => {
      const review = workflow.reviews.find(
        (v) => v.moovs_trip_id === r.moovs_trip_id,
      );
      return [
        r.moovs_trip_id,
        {
          state:
            financialRows.find(
              (row) => row.reservation.moovs_trip_id === r.moovs_trip_id,
            )?.state ?? 'unavailable',
          expected_payment_date: review?.expected_payment_date ?? null,
          reason: review?.reason ?? null,
        },
      ];
    }),
  );
  return {
    workflow,
    workflowAvailable,
    commissionStates,
    reservations: reservations.sort((a, b) =>
      (b.pickup_date || '').localeCompare(a.pickup_date || ''),
    ),
    attributions: financialRows.flatMap((row) =>
      row.attribution ? [row.attribution] : [],
    ),
    payouts: payouts.map(publicStatement),
    paidReservationIds,
  };
}

function demoWorkflowFields(
  agency: Agency,
  reservations: Reservation[],
  agents: Agent[],
  paid: Set<string>,
  agentId?: string,
) {
  const workflow = getDemoWorkflow(agency.id);
  const payouts = getDemoPayoutsByAgency(agency.id);
  const rows = reconcileBookings(
    reservations,
    [{ agency, agents, workflow, workflowAvailable: true }],
    payouts,
    getDemoPayoutReservationsByPayouts(
      payouts.filter((p) => p.status !== 'void').map((p) => p.id),
    ),
    getDemoAttributionsByAgency(agency.id),
    demoRouteRateConfig,
  );
  return {
    workflowAvailable: true,
    questions: partnerQuestions(
      workflow.questions,
      new Set(reservations.map((r) => r.moovs_trip_id)),
      agentId,
    ),
    commissionStates: Object.fromEntries(
      reservations.map((r) => [
        r.moovs_trip_id,
        {
          state:
            rows.find(
              (row) => row.reservation.moovs_trip_id === r.moovs_trip_id,
            )?.state ?? 'unavailable',
          expected_payment_date: null,
        },
      ]),
    ),
  };
}
function demoPortalResponse(token: string): Response | null {
  const agency = getDemoAgencyByPortalToken(token);
  if (agency) {
    const agents = getDemoAgentsByAgency(agency.id);
    const attributions = getDemoAttributionsByAgency(agency.id);
    const reservations = getDemoReservationsByIds(
      attributions.map((attr) => attr.reservation_id),
    );
    const payouts = getDemoPayoutsByAgency(agency.id);
    const payoutReservations = getDemoPayoutReservationsByPayouts(
      payouts
        .filter((payout) => payout.status === 'paid')
        .map((payout) => payout.id),
    );
    const paidReservationIds = new Set(
      payoutReservations.map((row) => row.reservation_id),
    );

    return Response.json({
      view: 'gm',
      ...demoWorkflowFields(agency, reservations, agents, paidReservationIds),
      agency: stripPortalToken(agency as unknown as Row),
      agents: agents.map((agent) => stripPortalToken(agent as unknown as Row)),
      reservations: reservations.map(publicReservation),
      attributions,
      payouts: payouts.map(publicStatement),
      outstandingBalance: outstandingCommission(
        attributions,
        paidReservationIds,
      ),
    });
  }

  const agent = getDemoAgentByPortalToken(token);
  if (!agent) return null;

  const agentAgency = getDemoAgencyById(agent.agency_id);
  if (!agentAgency) return null;

  const allAttributions = getDemoAttributionsByAgency(agentAgency.id);
  const attributions = allAttributions.filter(
    (attr) => attr.agent_id === agent.id,
  );
  const reservations = getDemoReservationsByIds(
    attributions.map((attr) => attr.reservation_id),
  );
  const payouts = getDemoPayoutsByAgency(agentAgency.id);
  const payoutReservations = getDemoPayoutReservationsByPayouts(
    payouts
      .filter((payout) => payout.status === 'paid')
      .map((payout) => payout.id),
  );
  const paidReservationIds = new Set(
    payoutReservations.map((row) => row.reservation_id),
  );

  return Response.json({
    view: 'agent',
    ...demoWorkflowFields(
      agentAgency,
      reservations,
      getDemoAgentsByAgency(agentAgency.id),
      paidReservationIds,
      agent.id,
    ),
    agency: stripPortalToken(agentAgency as unknown as Row),
    agents: [],
    currentAgent: stripPortalToken(agent as unknown as Row),
    reservations: reservations.map(publicReservation),
    attributions,
    payouts: agentStatements(payouts, agent.id),
    outstandingBalance: outstandingCommission(attributions, paidReservationIds),
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const demoResponse = demoPortalResponse(token);
  if (demoResponse) return demoResponse;

  if (!token || token.length < 24) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const agencyRows = await readCommissionJson<Agency[]>(
    `/agencies/by-token/${encodeURIComponent(token)}`,
  );
  const agency = agencyRows[0];

  if (agency) {
    const agents = await readCommissionJson<Agent[]>(
      `/agents?agency_id=${encodeURIComponent(agency.id)}`,
    );
    const {
      reservations,
      attributions,
      payouts,
      paidReservationIds,
      workflow,
      workflowAvailable,
      commissionStates,
    } = await portalRows(agency, agents);

    return Response.json({
      view: 'gm',
      agency: stripPortalToken(agency as unknown as Row),
      agents: agents.map((agent) => stripPortalToken(agent as unknown as Row)),
      reservations: reservations.map(publicReservation),
      commissionStates,
      workflowAvailable,
      questions: partnerQuestions(
        workflow.questions,
        new Set(reservations.map((r) => r.moovs_trip_id)),
      ),
      attributions,
      payouts: payouts.map(publicStatement),
      outstandingBalance: outstandingCommission(
        attributions,
        paidReservationIds,
      ),
    });
  }

  const agentRows = await readCommissionJson<Agent[]>(
    `/agents/by-token/${encodeURIComponent(token)}`,
  );
  const agent = agentRows[0];
  if (!agent) return Response.json({ error: 'Not found' }, { status: 404 });

  const agencyById = await readCommissionJson<Agency[]>(
    `/agencies/${encodeURIComponent(agent.agency_id)}`,
  );
  const agentAgency = agencyById[0];
  if (!agentAgency)
    return Response.json({ error: 'Not found' }, { status: 404 });

  const agents = await readCommissionJson<Agent[]>(
    `/agents?agency_id=${encodeURIComponent(agentAgency.id)}`,
  );
  const {
    reservations: allReservations,
    attributions: allAttributions,
    paidReservationIds,
    payouts: allPayouts,
    workflow,
    workflowAvailable,
    commissionStates: allStates,
  } = await portalRows(agentAgency, agents);
  const attributions = allAttributions.filter((a) => a.agent_id === agent.id);
  const reservationIds = new Set(attributions.map((a) => a.reservation_id));
  const reservations = allReservations.filter((reservation) =>
    reservationIds.has(reservation.id),
  );

  return Response.json({
    view: 'agent',
    agency: stripPortalToken(agentAgency as unknown as Row),
    agents: [],
    currentAgent: stripPortalToken(agent as unknown as Row),
    reservations: reservations.map(publicReservation),
    commissionStates: Object.fromEntries(
      reservations.map((r) => [r.moovs_trip_id, allStates[r.moovs_trip_id]]),
    ),
    workflowAvailable,
    questions: partnerQuestions(
      workflow.questions,
      new Set(reservations.map((r) => r.moovs_trip_id)),
      agent.id,
    ),
    attributions,
    payouts: agentStatements(allPayouts, agent.id),
    outstandingBalance: outstandingCommission(attributions, paidReservationIds),
  });
}
