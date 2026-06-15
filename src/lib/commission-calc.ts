import type { Agency, PriceMode, Reservation } from '../types/commission';
import type { RouteRateConfig } from '../types/commissionOperator';

/**
 * Default price display mode derived from an agency's payment terms.
 * Prepay agencies pay net (gross minus their commission); billable agencies see gross.
 */
export function defaultPriceModeForTerms(paymentTerms: string | null | undefined): PriceMode {
  return /prepay/i.test(paymentTerms ?? '') ? 'net' : 'gross';
}

/**
 * Shared commission math. This is the single source of truth used by both the
 * browser services and the server-side portal API so rate logic never drifts.
 *
 * White-label rules:
 *  - rate_mode 'fixed'    -> always the agency's own commission_rate (overrides everything).
 *  - rate_mode 'standard' -> for SHUTTLE bookings, use the operator's per-route rate
 *                            (then route default, then the agency rate). Non-shuttle trips
 *                            keep the agency rate today; trip-side route logic comes later.
 */

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isShuttleReservation(reservation: Pick<Reservation, 'source' | 'trip_type'>): boolean {
  const marker = (reservation.source ?? reservation.trip_type ?? '').toString().toLowerCase();
  return marker === 'shuttle';
}

export type RateSource = 'fixed' | 'route' | 'route-default' | 'agency-default';

export interface RateResolution {
  rate: number; // percent for 'percent' type, dollar amount for 'flat'
  source: RateSource;
}

/** Resolve the commission rate that applies to a single reservation for an agency. */
export function resolveCommissionRate(
  reservation: Reservation,
  agency: Pick<Agency, 'commission_rate' | 'rate_mode'>,
  routeConfig?: RouteRateConfig | null,
): RateResolution {
  // Fixed override (and the legacy default) always wins.
  if (agency.rate_mode !== 'standard') {
    return { rate: agency.commission_rate, source: 'fixed' };
  }

  // Standard mode: shuttle bookings follow the operator's route rate config.
  if (routeConfig && isShuttleReservation(reservation)) {
    const routeId = reservation.shuttle_route_id ?? undefined;
    const routeRate = routeId ? routeConfig.routes?.[routeId] : undefined;
    if (routeRate && Number.isFinite(routeRate.rate)) {
      return { rate: routeRate.rate, source: 'route' };
    }
    if (routeConfig.default_rate != null && Number.isFinite(routeConfig.default_rate)) {
      return { rate: routeConfig.default_rate, source: 'route-default' };
    }
  }

  // Fallback: agency rate (non-shuttle trips, or no matching route config).
  return { rate: agency.commission_rate, source: 'agency-default' };
}

/** The dollar amount the commission percentage is applied to. */
export function commissionBaseAmount(reservation: Reservation, base: Agency['commission_base']): number {
  switch (base) {
    case 'base_rate':
      return reservation.base_rate_amount;
    case 'total_with_gratuity':
      return reservation.total_with_gratuity;
    case 'total_amount':
    default:
      return reservation.total_amount;
  }
}

/** Compute the commission amount for a reservation/agency, honoring route rates. */
export function calculateCommission(
  reservation: Reservation,
  agency: Pick<Agency, 'commission_rate' | 'commission_type' | 'commission_base' | 'rate_mode'>,
  routeConfig?: RouteRateConfig | null,
): number {
  // Flat commissions are a fixed dollar amount regardless of route.
  if (agency.commission_type === 'flat') return round2(agency.commission_rate);

  const { rate } = resolveCommissionRate(reservation, agency, routeConfig);
  const base = commissionBaseAmount(reservation, agency.commission_base);
  return round2(base * (rate / 100));
}

/** Gross revenue displayed for a reservation (full amount the customer pays). */
export function grossAmount(reservation: Reservation): number {
  return round2(reservation.total_amount);
}

/** Net = gross minus commission (what a prepay/net agency effectively pays). */
export function netAmount(reservation: Reservation, commissionAmount: number): number {
  return round2(reservation.total_amount - commissionAmount);
}
