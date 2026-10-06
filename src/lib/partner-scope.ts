import type { Reservation, Payout } from '../types/commission';
import type { StatementLine } from '../types/workflow';
import type { CommissionQuestion } from '../types/workflow';
export function publicReservation(r: Reservation): Reservation {
  const { moovs_request_id, route_public_id, ...safe } = r;
  return safe;
}
export function partnerQuestions(
  questions: CommissionQuestion[],
  visibleTripIds: Set<string>,
  agentId?: string,
): CommissionQuestion[] {
  return questions.filter(
    (q) =>
      visibleTripIds.has(q.moovs_trip_id) &&
      (!agentId || q.agent_id === agentId),
  );
}
export function agentStatements(payouts: Payout[], agentId: string): Payout[] {
  return payouts
    .filter((p) =>
      p.statement_snapshot?.lines.some((l) => l.agent_id === agentId),
    )
    .map((p) => {
      const s = p.statement_snapshot!,
        lines = s.lines.filter((l) => l.agent_id === agentId);
      const total =
        Math.round(
          lines.reduce((n, l) => n + Number(l.commission_amount), 0) * 100,
        ) / 100;
      return {
        ...publicStatement(p),
        total_trips: lines.length,
        total_revenue: lines.reduce((n, l) => n + Number(l.gross), 0),
        total_commission: total,
        adjustments: 0,
        net_payout: total,
        statement_snapshot: {
          ...publicStatement(p).statement_snapshot!,
          adjustment_lines: [],
          manual_adjustments: 0,
          lines: lines.map(
            (l) =>
              publicStatement({
                ...p,
                statement_snapshot: { ...s, lines: [l] },
              }).statement_snapshot!.lines[0],
          ),
          adjustments: 0,
          adjustment_reason: null,
          total,
        },
      };
    });
}

export function publicStatement(p: Payout): Payout {
  const lines = p.statement_snapshot?.lines.map(
    (l): StatementLine => ({
      moovs_trip_id: l.moovs_trip_id,
      order_number: l.order_number,
      pickup_date: l.pickup_date,
      travel_day: l.travel_day,
      passenger_name: l.passenger_name,
      booking_contact_name: l.booking_contact_name,
      agent_id: l.agent_id,
      commission_rate: l.commission_rate,
      commission_type: l.commission_type,
      commission_base: l.commission_base,
      base_amount: l.base_amount,
      gross: l.gross,
      commission_amount: l.commission_amount,
      rule_source: l.rule_source,
    }),
  );
  return {
    ...p,
    notes: null,
    reference_number: null,
    statement_snapshot: p.statement_snapshot
      ? {
          version: p.statement_snapshot.version,
          agency_name: p.statement_snapshot.agency_name,
          period_start: p.statement_snapshot.period_start,
          period_end: p.statement_snapshot.period_end,
          adjustments: p.statement_snapshot.adjustments,
          manual_adjustments: p.statement_snapshot.manual_adjustments,
          total: p.statement_snapshot.total,
          time_zone: p.statement_snapshot.time_zone,
          include_carry_forward: p.statement_snapshot.include_carry_forward,
          lines: lines!,
          adjustment_reason: null,
          adjustment_lines: p.statement_snapshot.adjustment_lines?.map((l) => ({
            id: l.id,
            source_payout_id: l.source_payout_id,
            moovs_trip_id: l.moovs_trip_id,
            amount: l.amount,
            reason: null,
          })),
        }
      : undefined,
  };
}
