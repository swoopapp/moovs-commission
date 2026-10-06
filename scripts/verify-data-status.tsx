import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataHealth } from '../src/components/commissions/DataHealth';
import { PortalDataHealth } from '../src/components/portal/PortalDataHealth';
import { KPICards } from '../src/components/dashboard/KPICards';
import type { FinanceWorkspace } from '../src/services/financeWorkspaceService';

const health: FinanceWorkspace['health'] = {
  liveAvailable: true,
  workflowAvailable: true,
  carryAvailable: true,
  timeZone: 'America/New_York',
  lastSuccessfulRefresh: new Date().toISOString(),
  attemptedAt: new Date().toISOString(),
  source: 'Moovs replica',
  snapshotOnly: 0,
  missingFacts: 0,
  warnings: [],
};
const render = (h: typeof health) =>
  renderToStaticMarkup(<DataHealth health={h} onRefresh={() => {}} />);
const good = render(health);
assert.ok(good.includes('Updated just now'));
assert.ok(good.includes('aria-label="Data details"'));
assert.ok(good.includes('aria-label="Refresh data"'));
assert.ok(!good.includes('Moovs replica'));
assert.ok(!good.includes('wall-clock'));
assert.ok(!good.includes('role="alert"'));
for (const key of [
  'liveAvailable',
  'workflowAvailable',
  'carryAvailable',
] as const) {
  const html = render({ ...health, [key]: false });
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes('Updated just now'));
}
assert.ok(
  render({ ...health, timeZone: null }).includes('timezone is unavailable'),
);
assert.ok(
  render({ ...health, missingFacts: 1 }).includes('facts need attention'),
);
assert.ok(
  render({ ...health, warnings: ['Incomplete source read'] }).includes(
    'role="alert"',
  ),
);
assert.ok(
  render({
    ...health,
    lastSuccessfulRefresh: new Date(Date.now() - 6 * 60000).toISOString(),
  }).includes('Refresh recommended'),
);
const partner = renderToStaticMarkup(
  <PortalDataHealth
    reservations={[{ fact_origin: 'snapshot' } as never]}
    onRefresh={() => {}}
    synthetic={false}
  />,
);
assert.ok(partner.includes('role="alert"'));
assert.ok(!partner.includes('Updated just now'));
const finance = {
  health,
  from: '2026-09-01',
  to: '2026-09-30',
  rows: [{ state: 'outside-program' }, { state: 'ambiguous' }],
  carryForward: [],
  pendingAdjustments: 0,
  totals: {
    calculated: 0,
    projected: 0,
    approved: 0,
    held: 0,
    prepared: 0,
    paid: 0,
    rejected: 0,
    needsReview: 10,
    unknownBookings: 2,
  },
} as FinanceWorkspace;
const kpis = renderToStaticMarkup(<KPICards finance={finance} />);
assert.ok(kpis.includes('1 booking needs attention'));
assert.ok(kpis.includes('1 bookings outside the agency program'));
assert.ok(kpis.includes('$10.00 needs review'));
assert.ok(kpis.includes('Calculation details'));
assert.ok(!kpis.includes('href="#/adjustments"'));
assert.ok(!kpis.includes('href="#/settlement"'));
const corrections = renderToStaticMarkup(
  <KPICards finance={{ ...finance, pendingAdjustments: -5 }} />,
);
assert.ok(corrections.includes('href="#/settlement"'));
assert.ok(corrections.includes('-$5.00 pending commission corrections'));
console.log('Shared compact data status verification passed (26 assertions).');
