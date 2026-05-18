export const dynamic = 'force-dynamic';

import { readCommissionJson, stripPortalToken } from '@/lib/commission-api';

type Row = Record<string, any>;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

async function reservationsByIds(ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  return readCommissionJson<Row[]>(`/commission-reservations/by-ids?ids=${ids.map(encodeURIComponent).join(',')}`);
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 24) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const agencyRows = await readCommissionJson<Row[]>(`/agencies/by-token/${encodeURIComponent(token)}`);
  const agency = agencyRows[0];

  if (agency) {
    const [agents, attributions, payouts] = await Promise.all([
      readCommissionJson<Row[]>(`/agents?agency_id=${encodeURIComponent(agency.id)}`),
      readCommissionJson<Row[]>(`/attributions?agency_id=${encodeURIComponent(agency.id)}`),
      readCommissionJson<Row[]>(`/payouts?agency_id=${encodeURIComponent(agency.id)}`),
    ]);
    const reservations = await reservationsByIds(unique(attributions.map((a) => a.reservation_id)));

    return Response.json({
      view: 'gm',
      agency: stripPortalToken(agency),
      agents: agents.map(stripPortalToken),
      reservations,
      attributions,
      payouts,
    });
  }

  const agentRows = await readCommissionJson<Row[]>(`/agents/by-token/${encodeURIComponent(token)}`);
  const agent = agentRows[0];
  if (!agent) return Response.json({ error: 'Not found' }, { status: 404 });

  const agencyById = await readCommissionJson<Row[]>(`/agencies/${encodeURIComponent(agent.agency_id)}`);
  const agentAgency = agencyById[0];
  if (!agentAgency) return Response.json({ error: 'Not found' }, { status: 404 });

  const allAttributions = await readCommissionJson<Row[]>(`/attributions?agency_id=${encodeURIComponent(agentAgency.id)}`);
  const attributions = allAttributions.filter((a) => a.agent_id === agent.id);
  const reservations = await reservationsByIds(unique(attributions.map((a) => a.reservation_id)));

  return Response.json({
    view: 'agent',
    agency: stripPortalToken(agentAgency),
    agents: [],
    currentAgent: stripPortalToken(agent),
    reservations,
    attributions,
    payouts: [],
  });
}
