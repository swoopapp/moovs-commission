import { reservationTravelDay } from './operator-time.ts';
import type {
  Agency,
  Agent,
  Reservation,
  ReservationAttribution,
} from '../types/commission';
import type { CommissionReview } from '../types/workflow';
import {
  calculateCommission,
  commissionBaseAmount,
  resolveCommissionRate,
} from './commission-calc.ts';
import type { RouteRateConfig } from '../types/commissionOperator';
const normal = (s: string | null | undefined) =>
  s?.trim().toLowerCase() || null;
export function agentMatch(
  reservation: Pick<
    Reservation,
    'booking_contact_id' | 'booking_contact_email'
  >,
  agents: Agent[],
) {
  const active = agents.filter((a) => a.status === 'active');
  const id = normal(reservation.booking_contact_id),
    email = normal(reservation.booking_contact_email);
  const byId = id
    ? active.filter((a) => normal(a.moovs_contact_id) === id)
    : [];
  if (byId.length === 1)
    return { agent: byId[0], issue: null, method: 'contact-id' };
  if (byId.length > 1)
    return {
      agent: null,
      issue: 'Multiple agents share this Booking Contact ID.',
      method: null,
    };
  // Never use an email to override an explicitly different mapped contact ID.
  const byEmail = email
    ? active.filter(
        (a) => normal(a.email) === email && (!id || !a.moovs_contact_id),
      )
    : [];
  if (byEmail.length === 1)
    return { agent: byEmail[0], issue: null, method: 'email' };
  return {
    agent: null,
    issue:
      byEmail.length > 1
        ? 'Ambiguous Booking Contact email.'
        : 'Booking Contact is not mapped to an active agent.',
    method: null,
  };
}
export function commissionFingerprint(
  reservation: Reservation,
  agency: Agency,
  agentId: string | null,
  config?: RouteRateConfig | null,
): string {
  const resolved = resolveCommissionRate(reservation, agency, config);
  return JSON.stringify([
    reservation.moovs_trip_id,
    reservation.moovs_request_id ?? null,
    [...(reservation.client_keys ?? [])].sort(),
    reservation.booking_contact_id,
    reservation.booking_contact_email,
    agentId,
    reservation.pickup_date,
    reservation.travel_day ?? null,
    reservation.booking_timezone ?? null,
    reservation.trip_status,
    reservation.source,
    reservation.trip_type,
    reservation.shuttle_route_id,
    Number(reservation.total_amount),
    Number(reservation.total_with_gratuity),
    Number(reservation.base_rate_amount),
    agency.status,
    [
      ...new Set([
        ...(agency.client_links ?? []).map((l) => l.client_key),
        ...(agency.moovs_company_id
          ? [`company:${agency.moovs_company_id}`]
          : []),
      ]),
    ].sort(),
    agency.commission_type,
    agency.commission_base,
    resolved.rate,
    resolved.source,
    reservation.refund_amount ?? null,
  ]);
}
export function eligibilityIssues(
  reservation: Reservation,
  agency: Agency,
  agents: Agent[],
): string[] {
  const issues: string[] = [];
  if (agency.status !== 'active') issues.push('Agency is not active.');
  const keys =
    agency.client_links?.map((l) => l.client_key) ??
    (agency.moovs_company_id ? [`company:${agency.moovs_company_id}`] : []);
  const tripKeys = reservation.client_keys?.length
    ? reservation.client_keys
    : reservation.moovs_company_id
      ? [`company:${reservation.moovs_company_id}`]
      : [];
  if (!keys.some((k) => tripKeys.includes(k)))
    issues.push('Booking is not linked to this agency.');
  if (
    !['completed', 'closed', 'done'].includes(
      (reservation.trip_status ?? '').toLowerCase(),
    )
  )
    issues.push(
      'Trip is not completed/closed; cancellation or unknown status requires review.',
    );
  if (reservation.refund_amount == null)
    issues.push('Refund facts unavailable; verify before approval.');
  else if (
    !Number.isFinite(Number(reservation.refund_amount)) ||
    Number(reservation.refund_amount) < 0
  )
    issues.push('Refund facts invalid; verify before approval.');
  else if (Number(reservation.refund_amount) > 0)
    issues.push('Refund recorded; commission adjustment requires review.');
  if (reservation.booking_timezone===null) issues.push('Operator timezone unavailable; verify operator settings before approval.');
  if (reservation.fact_origin==='snapshot') issues.push('Current Moovs facts unavailable; snapshot is not payable evidence.');
  if (!reservationTravelDay(reservation)) issues.push('Travel date is missing; refresh authoritative calendar facts.');
  if (
    ![
      reservation.base_rate_amount,
      reservation.total_amount,
      reservation.total_with_gratuity,
    ].every((x) => Number.isFinite(Number(x)) && Number(x) >= 0)
  )
    issues.push('Pricing needs review.');
  // Agency-level bookings may legitimately have no individual agent. Ambiguity is never payable.
  const match = agentMatch(reservation, agents);
  if (
    match.issue?.startsWith('Ambiguous') ||
    match.issue?.startsWith('Multiple')
  )
    issues.push(match.issue);
  return issues;
}
export function commissionState(
  reservation: Reservation,
  agency: Agency,
  agents: Agent[],
  review?: CommissionReview,
  settled = false,
  config?: RouteRateConfig | null,
): string {
  if (settled) return 'settled';
  if (review?.status === 'held' || review?.status === 'rejected')
    return review.status;
  const match = agentMatch(reservation, agents);
  if (review?.status === 'approved') {
    if (
      review.fingerprint !==
      commissionFingerprint(
        reservation,
        agency,
        match.agent?.id ?? null,
        config,
      )
    )
      return 'needs-recheck';
    return eligibilityIssues(reservation, agency, agents).length
      ? 'needs-recheck'
      : 'approved';
  }
  return eligibilityIssues(reservation, agency, agents).length
    ? 'projected'
    : 'needs-review';
}
export function statementLine(
  reservation: Reservation,
  agency: Agency,
  attr: ReservationAttribution,
  config?: RouteRateConfig | null,
) {
  return {
    moovs_trip_id: reservation.moovs_trip_id,
    order_number: reservation.order_number,
    pickup_date: reservation.pickup_date,
    travel_day: reservationTravelDay(reservation),
    passenger_name: reservation.passenger_name,
    booking_contact_name: reservation.booking_contact_name,
    agent_id: attr.agent_id,
    commission_rate: Number(attr.commission_rate),
    commission_type: attr.commission_type,
    commission_base: attr.commission_base,
    base_amount: commissionBaseAmount(reservation, attr.commission_base),
    gross: Number(reservation.total_amount),
    commission_amount: Number(attr.commission_amount),
    rule_source:
      attr.rule_source ??
      resolveCommissionRate(reservation, agency, config).source,
  };
}
export { calculateCommission };
