import { batchEncodedQueryValues } from '../lib/query-batching';
import { mapWithConcurrency } from '../lib/concurrency';
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
// Keep query strings within CloudFront/WAF limits. A missing agency is an incomplete read, not an empty workflow.
export async function fetchWorkflowsForAgencies(
  agencyIds: string[],
): Promise<Record<string, WorkflowData>> {
  const ids = [...new Set(agencyIds)];
  const result: Record<string, WorkflowData> = {};
  const real = ids.filter((id) => !isDemoAgencyId(id));
  for (const id of ids.filter(isDemoAgencyId)) result[id] = getDemoWorkflow(id);
  const batches = await mapWithConcurrency(
    batchEncodedQueryValues(real),
    2,
    async (chunk) => {
      const res = await fetch(
        `${config.apiBaseUrl}/workflow?agency_ids=${chunk.map(encodeURIComponent).join(',')}`,
      );
      if (!res.ok)
        throw new Error(
          'Commission workflow unavailable. Refresh before preparing settlements.',
        );
      const data = await res.json();
      for (const id of chunk) {
        const workflow = data?.[id];
        if (
          !workflow ||
          !['reviews', 'events', 'questions', 'adjustments'].every((key) =>
            Array.isArray(workflow[key]),
          )
        )
          throw new Error(
            'Incomplete commission workflow read. Refresh before preparing settlements.',
          );
      }
      return Object.fromEntries(chunk.map((id) => [id, data[id]]));
    },
  );
  return Object.assign(result, ...batches);
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
