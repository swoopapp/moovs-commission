import { config } from '../config/env';
import {
  isDemoAgencyId,
  demoReadOnlyError,
  getDemoWorkflow,
} from '../demoData';
import type { WorkflowData } from '../types/workflow';
export const emptyWorkflow: WorkflowData = {
  reviews: [],
  events: [],
  questions: [],
};
export async function fetchWorkflow(agencyId: string): Promise<WorkflowData> {
  if (isDemoAgencyId(agencyId)) return getDemoWorkflow(agencyId);
  const res = await fetch(
    `${config.apiBaseUrl}/workflow?agency_id=${encodeURIComponent(agencyId)}`,
  );
  if (!res.ok)
    throw new Error(
      'Commission workflow unavailable. A reviewed backend/schema release is required.',
    );
  return res.json();
}
export async function saveWorkflow(
  action: 'review' | 'rules' | 'question-resolution' | 'correction',
  body: Record<string, unknown>,
): Promise<void> {
  if (isDemoAgencyId(String(body.agency_id)))
    throw demoReadOnlyError('Changing commissions');
  const res = await fetch(`${config.apiBaseUrl}/workflow/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error || 'Could not save commission change.');
  }
}
export async function recordExternalPayment(
  payoutId: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(
    `${config.apiBaseUrl}/payouts/${encodeURIComponent(payoutId)}/record-payment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error || 'Could not record external payment.');
  }
}

export async function voidSettlement(
  payoutId: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(
    `${config.apiBaseUrl}/payouts/${encodeURIComponent(payoutId)}/void`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error || 'Could not void prepared settlement.');
  }
}

export async function createCommissionAdjustment(
  body: Record<string, unknown>,
) {
  if (isDemoAgencyId(String(body.agency_id)))
    throw demoReadOnlyError('Changing commissions');
  const res = await fetch(`${config.apiBaseUrl}/workflow/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(result.error ?? 'Could not add commission correction.');
  return result.adjustment;
}
export async function cancelCommissionAdjustment(
  id: string,
  body: Record<string, unknown>,
) {
  if (isDemoAgencyId(String(body.agency_id)))
    throw demoReadOnlyError('Changing commissions');
  const res = await fetch(
    `${config.apiBaseUrl}/workflow/adjustments/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error ?? 'Could not cancel correction.');
  }
}
