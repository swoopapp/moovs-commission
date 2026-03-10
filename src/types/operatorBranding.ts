export interface OperatorBranding {
  id: string;
  operator_id: string;
  slug: string;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  auth_password: string;
  sso_provider: string | null;
  sso_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// What the operator context provides to the app
export interface OperatorConfig {
  operatorId: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  authPassword: string;
  ssoProvider: string | null;
  ssoConfig: Record<string, unknown> | null;
}
