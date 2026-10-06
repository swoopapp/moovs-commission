export interface CommissionRule {
  id: string;
  label: string;
  service: 'shuttle' | 'private-transfer';
  route_id: string | null;
  rate: number;
  effective_from: string;
  effective_to: string | null;
}
export interface CommissionReview {
  agency_id: string;
  moovs_trip_id: string;
  status: 'approved' | 'held' | 'rejected';
  reason: string;
  fingerprint: string;
  expected_payment_date: string | null;
  updated_at: string;
  actor: string;
}
export interface WorkflowEvent {
  id: string;
  agency_id: string;
  moovs_trip_id: string | null;
  action: string;
  actor: string;
  reason: string;
  created_at: string;
}
export interface CommissionQuestion {
  id: string;
  agency_id: string;
  agent_id: string | null;
  moovs_trip_id: string;
  message: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}
export interface WorkflowData {
  reviews: CommissionReview[];
  events: WorkflowEvent[];
  questions: CommissionQuestion[];
  adjustments?: CommissionAdjustment[];
}
export interface StatementLine {
  moovs_trip_id: string;
  order_number: string | null;
  pickup_date: string | null;
  travel_day?: string | null;
  passenger_name: string | null;
  booking_contact_name: string | null;
  agent_id: string | null;
  commission_rate: number;
  commission_type: string;
  commission_base: string;
  base_amount: number;
  gross: number;
  commission_amount: number;
  rule_source: string;
}
export interface SettlementStatement {
  version: 1;
  agency_name: string;
  period_start: string;
  period_end: string;
  lines: StatementLine[];
  adjustments: number;
  adjustment_reason: string | null;
  total: number;
  time_zone?: string | null;
  manual_adjustments?: number;
  adjustment_lines?: SettlementAdjustmentLine[];
  include_carry_forward?: boolean;
}

export interface CommissionAdjustment {
 id:string;agency_id:string;source_payout_id:string;moovs_trip_id:string|null;
 amount:number;reason:string;actor:string;request_key:string;applied_payout_id:string|null;cancelled_at:string|null;created_at:string;
}

export interface SettlementAdjustmentLine {
 id:string; source_payout_id:string; moovs_trip_id:string|null; amount:number; reason:string|null;
}
