export interface CommissionOperator {
  id: string;
  moovs_operator_id: string;
  slug: string;
  display_name: string;
  auth_password?: string;
  auth_password_set?: boolean;
  portal_token_enabled?: boolean;
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
}
