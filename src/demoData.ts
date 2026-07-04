import { Agency, Agent, Payout, Reservation, ReservationAttribution } from './types/commission';
import { CommissionOperator, CommissionOperatorConfig, RouteRateConfig, ShuttleRoute } from './types/commissionOperator';
import { calculateCommission } from './lib/commission-calc';

export const DEMO_SLUG = 'demo';
export const DEMO_OPERATOR_ID = 'demo-operator';
export const DEMO_MOOVS_OPERATOR_ID = 'demo-moovs-operator';

const nowIso = '2026-07-02T12:00:00.000Z';

export function isDemoSlug(slug: string): boolean {
  return slug === DEMO_SLUG;
}

export function isDemoOperatorId(operatorId: string): boolean {
  return operatorId === DEMO_OPERATOR_ID;
}

export function isDemoMoovsOperatorId(operatorId: string): boolean {
  return operatorId === DEMO_MOOVS_OPERATOR_ID;
}

export function isDemoAgencyId(id: string): boolean {
  return id.startsWith('demo-agency-');
}

export function isDemoAgentId(id: string): boolean {
  return id.startsWith('demo-agent-');
}

export function isDemoReservationId(id: string): boolean {
  return id.startsWith('demo-res-');
}

export function isDemoPayoutId(id: string): boolean {
  return id.startsWith('demo-payout-');
}

export const demoRouteRateConfig: RouteRateConfig = {
  default_rate: 8,
  routes: {
    'demo-route-airport-downtown': { route_id: 'demo-route-airport-downtown', name: 'Airport ↔ Downtown Hotel Zone', rate: 9 },
    'demo-route-downtown-event-campus': { route_id: 'demo-route-downtown-event-campus', name: 'Downtown ↔ Event Campus', rate: 10 },
    'demo-route-corporate-loop': { route_id: 'demo-route-corporate-loop', name: 'Corporate Campus Shuttle Loop', rate: 7 },
  },
  updated_at: nowIso,
};

export const demoOperatorRecord: CommissionOperator = {
  id: DEMO_OPERATOR_ID,
  moovs_operator_id: DEMO_MOOVS_OPERATOR_ID,
  slug: DEMO_SLUG,
  display_name: 'Apex Demo Transportation',
  auth_password_set: false,
  logo_url: null,
  primary_color: '#0f766e',
  secondary_color: '#ccfbf1',
  contact_email: 'demo@moovsapp.com',
  contact_phone: '(312) 555-0199',
  status: 'active',
  route_rate_config: demoRouteRateConfig,
  created_at: nowIso,
  updated_at: nowIso,
};

export const demoOperatorConfig: CommissionOperatorConfig = {
  operatorId: DEMO_OPERATOR_ID,
  moovsOperatorId: DEMO_MOOVS_OPERATOR_ID,
  slug: DEMO_SLUG,
  displayName: demoOperatorRecord.display_name,
  logoUrl: demoOperatorRecord.logo_url,
  primaryColor: demoOperatorRecord.primary_color,
  secondaryColor: demoOperatorRecord.secondary_color,
  routeRateConfig: demoRouteRateConfig,
};

const agencySeed: Array<Pick<Agency, 'id' | 'name' | 'type' | 'commission_rate' | 'commission_type' | 'commission_base' | 'rate_mode' | 'price_mode' | 'contact_name' | 'contact_email' | 'contact_phone' | 'city' | 'state' | 'market_segment' | 'payment_terms'>> = [
  {
    id: 'demo-agency-grandview-hotels',
    name: 'Grandview Hotel Group',
    type: 'Hotel',
    commission_rate: 12,
    commission_type: 'percent',
    commission_base: 'total_amount',
    rate_mode: 'fixed',
    price_mode: 'gross',
    contact_name: 'Maya Chen',
    contact_email: 'maya.chen@example.com',
    contact_phone: '(212) 555-0101',
    city: 'New York',
    state: 'NY',
    market_segment: 'Hotel group',
    payment_terms: 'Paid monthly, net 15',
  },
  {
    id: 'demo-agency-summit-corporate',
    name: 'Summit Corporate Travel',
    type: 'Travel Agent',
    commission_rate: 8,
    commission_type: 'percent',
    commission_base: 'base_rate',
    rate_mode: 'standard',
    price_mode: 'net',
    contact_name: 'Jordan Lee',
    contact_email: 'jordan.lee@example.com',
    contact_phone: '(312) 555-0102',
    city: 'Chicago',
    state: 'IL',
    market_segment: 'Corporate travel',
    payment_terms: 'Prepaid net rate',
  },
  {
    id: 'demo-agency-metro-events',
    name: 'Metro Meetings & Events',
    type: 'DMC',
    commission_rate: 10,
    commission_type: 'percent',
    commission_base: 'total_with_gratuity',
    rate_mode: 'fixed',
    price_mode: 'gross',
    contact_name: 'Sophia Martinez',
    contact_email: 'sophia.martinez@example.com',
    contact_phone: '(303) 555-0103',
    city: 'Denver',
    state: 'CO',
    market_segment: 'Meetings and groups',
    payment_terms: 'Paid after event close',
  },
  {
    id: 'demo-agency-central-concierge',
    name: 'Central Concierge Desk',
    type: 'Concierge',
    commission_rate: 25,
    commission_type: 'flat',
    commission_base: 'total_amount',
    rate_mode: 'fixed',
    price_mode: 'gross',
    contact_name: 'Noah Kim',
    contact_email: 'noah.kim@example.com',
    contact_phone: '(214) 555-0104',
    city: 'Dallas',
    state: 'TX',
    market_segment: 'Hotel concierge',
    payment_terms: 'Weekly ACH',
  },
  {
    id: 'demo-agency-airport-express',
    name: 'Airport Express Partners',
    type: 'OTA',
    commission_rate: 6,
    commission_type: 'percent',
    commission_base: 'total_amount',
    rate_mode: 'standard',
    price_mode: 'net',
    contact_name: 'Avery Wilson',
    contact_email: 'avery.wilson@example.com',
    contact_phone: '(602) 555-0105',
    city: 'Phoenix',
    state: 'AZ',
    market_segment: 'Airport transfers',
    payment_terms: 'Prepaid net rate',
  },
  {
    id: 'demo-agency-northwest-tours',
    name: 'Northwest Premium Tours',
    type: 'Other',
    commission_rate: 9,
    commission_type: 'percent',
    commission_base: 'total_amount',
    rate_mode: 'fixed',
    price_mode: 'gross',
    contact_name: 'Kai Thompson',
    contact_email: 'kai.thompson@example.com',
    contact_phone: '(206) 555-0106',
    city: 'Seattle',
    state: 'WA',
    market_segment: 'Tours and activities',
    payment_terms: 'Monthly ACH',
  },
];

export const demoAgencies: Agency[] = agencySeed.map((seed, index) => {
  const clientId = seed.id.replace('demo-agency-', 'demo-client-');
  const clientType = index === 1 || index === 4 ? 'shuttle_client' : 'company';
  const clientKey = `${clientType}:${clientId}`;
  return {
    ...seed,
    operator_id: DEMO_OPERATOR_ID,
    moovs_company_id: clientType === 'company' ? clientId : null,
    address: `${100 + index * 12} ${['Market Street', 'Wacker Drive', 'Wynkoop Street', 'Commerce Street', 'Central Avenue', 'Pine Street'][index]}`,
    zip_code: index === 0 ? '10018' : index === 1 ? '60601' : index === 2 ? '80202' : index === 3 ? '75201' : index === 4 ? '85004' : '98101',
    country: 'US',
    contract_start: '2026-01-01',
    contract_end: '2026-12-31',
    status: index === 5 ? 'suspended' : 'active',
    portal_token: `demo-portal-${index + 1}`,
    notes: 'Demo fixture data only. No customer or production data is used.',
    last_synced_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    client_links: [{
      id: `demo-link-${index + 1}`,
      agency_id: seed.id,
      operator_id: DEMO_OPERATOR_ID,
      client_key: clientKey,
      client_type: clientType,
      client_id: clientId,
      display_name_snapshot: seed.name,
      is_primary: true,
      created_at: nowIso,
      updated_at: nowIso,
    }],
  };
});

export const demoAgents: Agent[] = demoAgencies.flatMap((agency, agencyIndex) => {
  const names = [
    ['Lena Park', 'Marcus Stone', 'Taylor Wong'],
    ['Riley Brooks', 'Priya Shah'],
    ['Emma Rivera', 'Lucas Morgan'],
    ['Hana Imai', 'Ben Carter'],
    ['Mason Patel', 'Olivia Reed'],
    ['Kevin Davis'],
  ][agencyIndex];
  return names.map((name, agentIndex) => ({
    id: `demo-agent-${agencyIndex + 1}-${agentIndex + 1}`,
    agency_id: agency.id,
    moovs_contact_id: `demo-contact-${agencyIndex + 1}-${agentIndex + 1}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    phone: `(555) 555-02${agencyIndex}${agentIndex}`,
    role: agentIndex === 0 ? 'gm' : 'agent',
    department: agentIndex === 0 ? 'Front Office' : 'Reservations',
    status: 'active',
    portal_token: `demo-agent-portal-${agencyIndex + 1}-${agentIndex + 1}`,
    created_at: nowIso,
  }));
});

const passengers = ['Alex Morgan', 'Jamie Parker', 'Casey Nguyen', 'Morgan Reed', 'Drew Anderson', 'Sam Taylor', 'Cameron Young', 'Quinn Bailey', 'Ari Johnson', 'Robin Clark'];
const pickupLocations = ['Metro International Airport', 'Grandview Hotel Group', 'Central City Hotel', 'Riverside Suites', 'Metro Convention Center', 'Lakeside Hotel'];
const dropoffLocations = ['Grandview Hotel Group', 'Event Campus', 'Resort District', 'Downtown District', 'Museum District', 'Metro International Airport'];
const vehicleTypes = ['Executive SUV', 'Mercedes Sprinter', 'Mini Coach', 'Luxury Sedan'];
const routeIds = Object.keys(demoRouteRateConfig.routes);

export const demoReservations: Reservation[] = Array.from({ length: 36 }, (_, index) => {
  const agency = demoAgencies[index % demoAgencies.length];
  const primaryLink = agency.client_links?.[0];
  const routeId = routeIds[index % routeIds.length];
  const isShuttle = agency.rate_mode === 'standard' || index % 3 === 0;
  const date = new Date(Date.UTC(2026, 6 - (index % 5), 2 - (index % 20), 16 + (index % 6), 30));
  const base = 145 + (index % 9) * 42;
  const total = base + 35 + (index % 5) * 22;
  return {
    id: `demo-res-${index + 1}`,
    operator_id: DEMO_OPERATOR_ID,
    moovs_trip_id: `DEMO-TRIP-${String(index + 1).padStart(4, '0')}`,
    moovs_company_id: agency.moovs_company_id,
    order_number: `ORD-${7400 + index}`,
    confirmation_number: `CNF-${93000 + index}`,
    pickup_date: date.toISOString(),
    pickup_location: pickupLocations[index % pickupLocations.length],
    dropoff_location: dropoffLocations[(index + 2) % dropoffLocations.length],
    passenger_name: passengers[index % passengers.length],
    booking_contact_id: `demo-booking-contact-${index + 1}`,
    booking_contact_name: demoAgents.find((agent) => agent.agency_id === agency.id)?.name ?? agency.contact_name,
    booking_contact_email: demoAgents.find((agent) => agent.agency_id === agency.id)?.email ?? agency.contact_email,
    vehicle_type: vehicleTypes[index % vehicleTypes.length],
    trip_type: isShuttle ? 'Shuttle' : 'Private Transfer',
    source: isShuttle ? 'shuttle' : 'trip',
    shuttle_route_id: isShuttle ? routeId : null,
    shuttle_route_name: isShuttle ? demoRouteRateConfig.routes[routeId]?.name ?? null : null,
    base_rate_amount: base,
    total_amount: total,
    total_with_gratuity: total + 45,
    trip_status: index % 11 === 0 ? 'confirmed' : 'completed',
    synced_at: nowIso,
    client_keys: primaryLink ? [primaryLink.client_key] : [],
  };
});

export const demoAttributions: ReservationAttribution[] = demoReservations.map((reservation, index) => {
  const agency = demoAgencies[index % demoAgencies.length];
  const agents = demoAgents.filter((agent) => agent.agency_id === agency.id);
  const agent = agents[index % Math.max(agents.length, 1)] ?? null;
  return {
    id: `demo-attr-${index + 1}`,
    reservation_id: reservation.id,
    agency_id: agency.id,
    agent_id: agent?.id ?? null,
    commission_rate: agency.rate_mode === 'standard' && reservation.shuttle_route_id
      ? demoRouteRateConfig.routes[reservation.shuttle_route_id]?.rate ?? demoRouteRateConfig.default_rate ?? agency.commission_rate
      : agency.commission_rate,
    commission_type: agency.commission_type,
    commission_base: agency.commission_base,
    commission_amount: calculateCommission(reservation, agency, demoRouteRateConfig),
    attributed_at: reservation.pickup_date ?? nowIso,
  };
});

export const demoPayouts: Payout[] = demoAgencies.flatMap((agency, index) => {
  const attrs = demoAttributions.filter((attr) => attr.agency_id === agency.id).slice(0, 4);
  const reservations = attrs.map((attr) => demoReservations.find((reservation) => reservation.id === attr.reservation_id)).filter((reservation): reservation is Reservation => Boolean(reservation));
  const totalRevenue = reservations.reduce((sum, reservation) => sum + reservation.total_amount, 0);
  const totalCommission = attrs.reduce((sum, attr) => sum + attr.commission_amount, 0);
  return [
    {
      id: `demo-payout-${index + 1}`,
      operator_id: DEMO_OPERATOR_ID,
      agency_id: agency.id,
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      total_trips: attrs.length,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_commission: Math.round(totalCommission * 100) / 100,
      adjustments: index === 2 ? -25 : 0,
      net_payout: Math.round((totalCommission + (index === 2 ? -25 : 0)) * 100) / 100,
      method: index % 2 === 0 ? 'ACH' : 'Check',
      reference_number: `DEMO-PAY-${202600 + index}`,
      status: index % 3 === 0 ? 'pending' : 'paid',
      notes: 'Demo payout generated from fixture data.',
      date_paid: index % 3 === 0 ? null : '2026-07-01',
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
});

export const demoPayoutReservations = demoPayouts.flatMap((payout, payoutIndex) =>
  demoAttributions
    .filter((attr) => attr.agency_id === payout.agency_id)
    .slice(0, payout.total_trips)
    .map((attr, index) => ({
      id: `demo-payout-res-${payoutIndex + 1}-${index + 1}`,
      payout_id: payout.id,
      reservation_id: attr.reservation_id,
      created_at: nowIso,
    })),
);

export const demoShuttleRoutes: ShuttleRoute[] = [
  { route_id: 'demo-route-airport-downtown', name: 'Airport ↔ Downtown Hotel Zone' },
  { route_id: 'demo-route-downtown-event-campus', name: 'Downtown ↔ Event Campus' },
  { route_id: 'demo-route-corporate-loop', name: 'Corporate Campus Shuttle Loop' },
  { route_id: 'demo-route-resort-connector', name: 'Resort Connector' },
  { route_id: 'demo-route-museum-district', name: 'Museum District Shuttle' },
];

export function getDemoAgencies(options?: { offset?: number; limit?: number; search?: string; matchedOnly?: boolean; unmatchedOnly?: boolean }) {
  const q = options?.search?.trim().toLowerCase();
  let rows = demoAgencies;
  if (q) {
    rows = rows.filter((agency) =>
      [agency.name, agency.contact_name, agency.city, agency.state, agency.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }
  if (options?.matchedOnly) rows = rows.filter((agency) => agency.client_links?.length || agency.moovs_company_id);
  if (options?.unmatchedOnly) rows = rows.filter((agency) => !agency.client_links?.length && !agency.moovs_company_id);
  const total = rows.length;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? total;
  return { agencies: rows.slice(offset, offset + limit), total };
}

export function getDemoAgencyById(id: string): Agency | null {
  return demoAgencies.find((agency) => agency.id === id) ?? null;
}

export function getDemoAgencyByPortalToken(token: string): Agency | null {
  return demoAgencies.find((agency) => agency.portal_token === token) ?? null;
}

export function getDemoAgentByPortalToken(token: string): Agent | null {
  return demoAgents.find((agent) => agent.portal_token === token) ?? null;
}

export function getDemoAgentsByAgency(agencyId: string): Agent[] {
  return demoAgents.filter((agent) => agent.agency_id === agencyId);
}

export function getDemoAgentsByAgencies(agencyIds: string[]): Agent[] {
  const ids = new Set(agencyIds);
  return demoAgents.filter((agent) => ids.has(agent.agency_id));
}

export function getDemoReservations(options?: { dateFrom?: string; dateTo?: string; companyId?: string; clientKey?: string; limit?: number; offset?: number }): Reservation[] {
  let rows = demoReservations;
  if (options?.companyId) rows = rows.filter((reservation) => reservation.moovs_company_id === options.companyId);
  if (options?.clientKey) {
    const clientKey = options.clientKey;
    rows = rows.filter((reservation) => reservation.client_keys?.includes(clientKey));
  }
  if (options?.dateFrom) rows = rows.filter((reservation) => !reservation.pickup_date || reservation.pickup_date.slice(0, 10) >= options.dateFrom!);
  if (options?.dateTo) rows = rows.filter((reservation) => !reservation.pickup_date || reservation.pickup_date.slice(0, 10) <= options.dateTo!);
  rows = [...rows].sort((a, b) => (b.pickup_date || '').localeCompare(a.pickup_date || ''));
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? rows.length;
  return rows.slice(offset, offset + limit);
}

export function getDemoReservationsByIds(ids: string[]): Reservation[] {
  const idSet = new Set(ids);
  return demoReservations.filter((reservation) => idSet.has(reservation.id));
}

export function getDemoAttributionsByAgency(agencyId: string): ReservationAttribution[] {
  return demoAttributions.filter((attr) => attr.agency_id === agencyId);
}

export function getDemoAttributionsByReservations(reservationIds: string[]): ReservationAttribution[] {
  const idSet = new Set(reservationIds);
  return demoAttributions.filter((attr) => idSet.has(attr.reservation_id));
}

export function getDemoPayoutsByOperator(operatorId: string): Payout[] {
  return isDemoOperatorId(operatorId) ? demoPayouts : [];
}

export function getDemoPayoutsByAgency(agencyId: string): Payout[] {
  return demoPayouts.filter((payout) => payout.agency_id === agencyId);
}

export function getDemoPayoutReservationsByPayouts(payoutIds: string[]) {
  const idSet = new Set(payoutIds);
  return demoPayoutReservations.filter((row) => idSet.has(row.payout_id));
}

export function getDemoLinkedClientKeys(): Set<string> {
  return new Set(demoAgencies.flatMap((agency) => agency.client_links?.map((link) => link.client_key) ?? []));
}

export function demoReadOnlyError(action: string): Error {
  return new Error(`${action} is disabled in demo mode. This link uses read-only fake data.`);
}
