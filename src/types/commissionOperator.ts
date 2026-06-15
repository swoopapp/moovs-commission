// A commission rate assigned to a single shuttle route (Moovs shuttle_route_definition).
export interface RouteRate {
  route_id: string;
  name?: string | null;
  rate: number; // percent
}

// Operator-level, white-label rate config for shuttle routes.
// default_rate is the fallback for any shuttle route without an explicit rate
// (null => fall back to the agency's own commission_rate).
export interface RouteRateConfig {
  default_rate: number | null;
  routes: Record<string, RouteRate>; // keyed by route_id
  updated_at?: string;
}

export const EMPTY_ROUTE_RATE_CONFIG: RouteRateConfig = { default_rate: null, routes: {} };

// A shuttle route definition pulled live from Moovs, used to build the editor.
export interface ShuttleRoute {
  route_id: string;
  name: string;
}

export interface CommissionOperator {
  id: string;
  moovs_operator_id: string;
  slug: string;
  display_name: string;
  auth_password?: string;
  auth_password_set?: boolean;
  portal_token_enabled?: boolean;
  portal_token_copyable?: boolean;
  portal_token_created_at?: string | null;
  portal_token_last_used_at?: string | null;
  portal_token_expires_at?: string | null;
  portal_token?: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: 'active' | 'inactive';
  route_rate_config?: RouteRateConfig | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionOperatorConfig {
  operatorId: string;        // commission_operators.id
  moovsOperatorId: string;   // for Metabase queries
  slug: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  routeRateConfig: RouteRateConfig;
}
