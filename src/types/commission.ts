export type AgencyType = 'Hotel' | 'DMC' | 'Travel Agent' | 'OTA' | 'Concierge' | 'Other';
export type CommissionType = 'percent' | 'flat';
export type CommissionBase = 'base_rate' | 'total_amount' | 'total_with_gratuity';
export type AgencyStatus = 'active' | 'suspended' | 'archived';
export type AgentRole = 'agent' | 'gm';
export type PayoutMethod = 'ACH' | 'Wire' | 'Check' | 'Cash' | 'Other';
export type PayoutStatus = 'draft' | 'pending' | 'paid';

export interface Agency {
  id: string;
  operator_id: string;
  moovs_company_id: string | null;
  name: string;
  type: AgencyType;
  commission_rate: number;
  commission_type: CommissionType;
  commission_base: CommissionBase;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  payment_terms: string | null;
  contract_start: string | null;
  contract_end: string | null;
  status: AgencyStatus;
  portal_token: string;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  agency_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: AgentRole;
  department: string | null;
  status: 'active' | 'inactive';
  portal_token: string;
  created_at: string;
}

export interface Reservation {
  id: string;
  operator_id: string;
  moovs_trip_id: string;
  moovs_company_id: string | null;
  order_number: string | null;
  confirmation_number: string | null;
  pickup_date: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  passenger_name: string | null;
  vehicle_type: string | null;
  trip_type: string | null;
  base_rate_amount: number;
  total_amount: number;
  total_with_gratuity: number;
  trip_status: string | null;
  synced_at: string;
}

export interface ReservationAttribution {
  id: string;
  reservation_id: string;
  agency_id: string;
  agent_id: string | null;
  commission_rate: number;
  commission_type: CommissionType;
  commission_base: CommissionBase;
  commission_amount: number;
  attributed_at: string;
}

export interface Payout {
  id: string;
  operator_id: string;
  agency_id: string;
  period_start: string;
  period_end: string;
  total_trips: number;
  total_revenue: number;
  total_commission: number;
  adjustments: number;
  net_payout: number;
  method: PayoutMethod;
  reference_number: string | null;
  status: PayoutStatus;
  notes: string | null;
  date_paid: string | null;
  created_at: string;
  updated_at: string;
}
