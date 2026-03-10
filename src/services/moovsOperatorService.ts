import { config, EDGE_FUNCTION_URLS } from '../config/env';

/**
 * Operator details from the fetch-operators edge function.
 */
export interface MoovsOperatorDetails {
  operatorId: string;
  name: string;
  email: string;
  nameSlug: string;
  customDomain: string | null;
  plan: string | null;
  planName: string | null;
  status: string;
  isActive: boolean;
  vehiclesTotal: number;
  driversCount: number;
  totalMembers: number;
  totalReservations: number;
  last30DaysReservations: number;
  engagementStatus: string | null;
  daysSinceLastAssignment: number | null;
  createdDate: string | null;
}

/**
 * Look up operator details from the fetch-operators edge function.
 * The edge function enriches with name_slug from the Operator table.
 */
export async function lookupMoovsOperator(
  operatorId: string,
): Promise<MoovsOperatorDetails | null> {
  try {
    const res = await fetch(`${EDGE_FUNCTION_URLS.fetchOperators}?operator_id=${operatorId}`, {
      headers: {
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const op = data?.operator || data?.data || null;
    if (!op) return null;

    return {
      operatorId: op.operator_id || operatorId,
      name: op.name || op.display_name || '',
      email: op.email || '',
      nameSlug: op.name_slug || '',
      customDomain: op.custom_domain || null,
      plan: op.plan || null,
      planName: op.lago_plan_name || op.display_plan || null,
      status: op.status || 'unknown',
      isActive: op.is_active ?? false,
      vehiclesTotal: op.vehicles_total || 0,
      driversCount: op.drivers_count || 0,
      totalMembers: op.total_members || 0,
      totalReservations: op.total_reservations || 0,
      last30DaysReservations: op.last_30_days_reservations || 0,
      engagementStatus: op.engagement_status || null,
      daysSinceLastAssignment: op.days_since_last_assignment ?? null,
      createdDate: op.created_date || null,
    };
  } catch {
    return null;
  }
}
