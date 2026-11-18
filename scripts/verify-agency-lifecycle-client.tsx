import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { AgencyLifecycleControls, holdLinks, lifecycleSignal, partnerLink, releaseAfterReload } from '../src/components/agency/AgencyLifecycleControls';
import { mutateAgencyLifecycle, projectLifecycleState, readAgencyLifecycle } from '../src/services/agencyLifecycleService';

const agency = '11111111-1111-4111-8111-111111111111', operator = '22222222-2222-4222-8222-222222222222';
const agent = '33333333-3333-4333-8333-333333333333', foreign = '44444444-4444-4444-8444-444444444444';
const revision = '2026-11-18T15:00:00.123456';
const facts = () => ({ agency_id: agency, status: 'inactive', revision, agency_link: false,
  agents: [{ agent_id: agent, status: 'active', link: false }],
  obligations: { open_payouts: 0, open_adjustments: 0, approved_unsettled: 0, held_unsettled: 1 } });
const fetchBefore = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchBefore; });

test('advice preserves the exact revision and counts without exposing credentials', () => {
  assert.deepEqual(projectLifecycleState(facts(), agency), facts());
  for (const bad of [
    { ...facts(), agency_id: foreign }, { ...facts(), portal_token: 'NEVER_RETURN_THIS' },
    { ...facts(), revision: '2026-11-18T15:00:00.123Z' },
    { ...facts(), obligations: { ...facts().obligations, held_unsettled: -1 } },
    { ...facts(), obligations: { ...facts().obligations, extra: 0 } },
    { ...facts(), agents: [facts().agents[0], facts().agents[0]] },
    { ...facts(), agents: [{ ...facts().agents[0], portal_token: 'NEVER_RETURN_THIS' }] },
  ]) assert.throws(() => projectLifecycleState(bad, agency), /could not be confirmed/);
});

test('read carries only the scoped operator and projects a bounded JSON reply', async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'https://fictional.invalid');
    assert.equal(url.pathname, `/api/commission-api/agencies/${agency}/lifecycle`);
    assert.equal(url.search, `?operator_id=${operator}`);
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    assert(init?.signal instanceof AbortSignal);
    return Response.json({ kind: 'advice', data: facts() });
  };
  assert.deepEqual(await readAgencyLifecycle(agency, operator, new AbortController().signal), facts());
});

test('explicit archive body binds operator and revision; committed output has IDs only', async () => {
  let sends = 0;
  globalThis.fetch = async (input, init) => {
    sends++; assert.equal(String(input), `/api/commission-api/agencies/${agency}/archive`);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { expected_status: 'inactive', expected_revision: revision, reason: 'Fictional closure', operator_id: operator });
    return Response.json({ kind: 'committed', result: { agency_id: agency } });
  };
  assert.deepEqual(await mutateAgencyLifecycle(agency, operator, 'archive', { operator_id: foreign, expected_status: 'inactive', expected_revision: revision, reason: 'Fictional closure' }, new AbortController().signal), { kind: 'committed', result: { agency_id: agency } });
  assert.equal(sends, 1);
});

test('known refusals and unknown commit are distinct, neither retries', async () => {
  let sends = 0;
  for (const reply of [{ kind: 'refused', code: 'OBLIGATIONS_OPEN' }, { kind: 'unconfirmed', code: 'OUTCOME_UNCONFIRMED' }]) {
    globalThis.fetch = async () => { sends++; return Response.json(reply, { status: reply.kind === 'refused' ? 409 : 503 }); };
    assert.deepEqual(await mutateAgencyLifecycle(agency, operator, 'restore', { expected_revision: revision, reason: 'Fictional restore' }, new AbortController().signal), reply);
  }
  assert.equal(sends, 2);
});

test('dropped sends, HTML errors and corrupted replies fail closed with no retry or raw error', async () => {
  for (const response of [null, new Response('NEVER_RETURN_THIS', { status: 502, headers: { 'content-type': 'text/html' } }),
    Response.json({ kind: 'committed', result: { agency_id: foreign } }),
    Response.json({ kind: 'committed', result: { agency_id: agency, portal_token: 'NEVER_RETURN_THIS' } })]) {
    let sends = 0;
    globalThis.fetch = async () => { sends++; if (!response) throw new Error('fictional disconnect'); return response; };
    await assert.rejects(mutateAgencyLifecycle(agency, operator, 'issue-link', { expected_revision: revision }, new AbortController().signal));
    assert.equal(sends, 1);
  }
});

test('agent issuance binds the result to the requested agency and agent', async () => {
  globalThis.fetch = async () => Response.json({ kind: 'committed', result: { agency_id: agency, agent_id: foreign } });
  await assert.rejects(mutateAgencyLifecycle(agency, operator, 'issue-agent-link', { agent_id: agent, expected_revision: revision }, new AbortController().signal));
  globalThis.fetch = async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { agent_id: agent, expected_revision: revision, operator_id: operator });
    return Response.json({ kind: 'committed', result: { agency_id: agency, agent_id: agent } });
  };
  assert.deepEqual(await mutateAgencyLifecycle(agency, operator, 'issue-agent-link', { agent_id: agent, expected_revision: revision }, new AbortController().signal), { kind: 'committed', result: { agency_id: agency, agent_id: agent } });
});

test('pre-dispatch proxy refusals are known refusals, never a retry or a raw message', async () => {
  for (const status of [401, 403, 405]) {
    let sends = 0;
    globalThis.fetch = async () => { sends++; return Response.json({ error: 'NEVER_RETURN_THIS' }, { status }); };
    assert.deepEqual(await mutateAgencyLifecycle(agency, operator, 'archive', { expected_revision: revision }, new AbortController().signal), { kind: 'refused', code: 'ACTION_DENIED' });
    assert.equal(sends, 1);
  }
});

test('agent lifecycle UI uses explicit issuance and refuses archived or absent links', () => {
  const source = readFileSync('src/components/agency/AgentsTab.tsx', 'utf8');
  assert.match(source, /return partnerLink\(window\.location\.origin, agency\.status, agent\.portal_token, linksHeld\)/);
  assert.match(source, /if \(!portalUrl\(agent\) \|\| linkAgent \|\| isDemo\) return/);
  assert.match(source, /disabled=\{agency\.status === 'archived'\}/);
  assert.match(source, /agent=\{\{id: linkAgent\.id, name: linkAgent\.name\}\}/);
  assert.doesNotMatch(source, /agent\.portal_token\}|onReload|onMutationStart/);
  const html = renderToStaticMarkup(createElement(AgencyLifecycleControls, { agencyId: agency, operatorId: operator, agent: { id: agent, name: 'Fictional agent' }, isDemo: true, held: false, onLifecycle: () => {} }));
  assert.match(html, /Partner link for Fictional agent/);
  assert.doesNotMatch(html, /<button|Archive agency|Restore agency|\/portal\//);
});

test('oversized advice is rejected rather than truncated into a complete status', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ kind: 'advice', data: { ...facts(), status: 'x'.repeat(2 * 1024 * 1024) } }), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(readAgencyLifecycle(agency, operator, new AbortController().signal));
});

test('fictional demo render makes zero calls and offers no live action', () => {
  let sends = 0; globalThis.fetch = async () => { sends++; throw new Error('No provider or business requests in demo'); };
  const html = renderToStaticMarkup(createElement(AgencyLifecycleControls, { agencyId: agency, operatorId: operator, isDemo: true, held: false, onLifecycle: () => {} }));
  assert.match(html, /Sample view only/); assert.doesNotMatch(html, /<button/); assert.equal(sends, 0);
});

// ---- Partner links stay hidden until the page has a confirmed fresh read (state is held by AgencyDetailView) ----
const origin = 'https://fictional.example', oldToken = 'OLD_FICTIONAL_TOKEN';
const read = (path: string) => readFileSync(path, 'utf8');

test('archive then restore in one sitting never shows the pre-archive agent or agency link', () => {
  let held: string | null = null; const shown = (status: string) => partnerLink(origin, status, oldToken, held === agency);
  assert.equal(shown('active'), `${origin}/portal/${oldToken}`);
  held = holdLinks(held, agency, 'sending'); assert.equal(shown('active'), '');
  held = holdLinks(held, agency, lifecycleSignal({ kind: 'committed' })); assert.equal(held, agency); // archived: reload pending
  held = releaseAfterReload(held, agency, true); assert.equal(held, null); assert.equal(shown('archived'), '');
  held = holdLinks(held, agency, 'sending'); held = holdLinks(held, agency, lifecycleSignal({ kind: 'committed' })); // restore
  // The stale in-memory token is not shown while the reload is pending, whatever status the page still holds.
  for (const status of ['active', 'archived', 'suspended']) assert.equal(shown(status), '');
  held = releaseAfterReload(held, agency, true);
  // After the reload the token comes from fresh rows, which the server has cleared.
  assert.equal(partnerLink(origin, 'active', null, held === agency), '');
  assert.equal(partnerLink(origin, 'active', undefined, false), ''); assert.equal(partnerLink(origin, 'active', '', false), '');
  // The reload is the page's full load (agency AND agents), not an agency-only patch.
  const page = read('src/components/agency/AgencyDetailView.tsx');
  assert.match(page, /if \(signal === 'reload'\) void reload\(\)\.then\(reloaded => setHeldLinks\(current => releaseAfterReload\(current, agencyId, reloaded\)\)\)/);
  assert.match(page, /const reload = \(\) => \{ invalidateReads\(\); return loadData\(\); \};/);
  assert.match(page, /fetchAgents\(agencyId\)/);
  assert.doesNotMatch(read('src/components/agency/SettingsTab.tsx'), /fetchAgencyById|hiddenLinkAgency|agency\.portal_token\}/);
});

test('a sending or unconfirmed request survives tab changes and closing the panel', () => {
  for (const signal of ['sending', 'unknown'] as const) {
    const held = holdLinks(null, agency, signal);
    assert.equal(held, agency); assert.equal(partnerLink(origin, 'active', oldToken, held === agency), '');
    // A panel mounted while the page holds the links starts latched: it offers a status refresh and nothing else.
    const html = renderToStaticMarkup(createElement(AgencyLifecycleControls, { agencyId: agency, operatorId: operator, isDemo: false, held: true, onLifecycle: () => {} }));
    assert.match(html, /An earlier request could not be confirmed/); assert.match(html, /Refresh status/);
    // Exactly one control is offered, the status refresh; no archive, restore or issue button exists until facts are re-read.
    assert.equal(html.match(/<button/g)?.length, 1); assert.doesNotMatch(html, /<button[^>]*>(?:Archive agency|Restore agency|Issue[^<]*|Replace[^<]*)</);
  }
  assert.equal(lifecycleSignal({ kind: 'unconfirmed' }), 'unknown');
  assert.doesNotMatch(renderToStaticMarkup(createElement(AgencyLifecycleControls, { agencyId: agency, operatorId: operator, isDemo: false, held: false, onLifecycle: () => {} })), /could not be confirmed/);
  // Held state is the page's, keyed by agency, and both tabs only read it.
  const page = read('src/components/agency/AgencyDetailView.tsx'), agents = read('src/components/agency/AgentsTab.tsx'), settings = read('src/components/agency/SettingsTab.tsx');
  assert.match(page, /const \[heldLinks, setHeldLinks\] = useState<string \| null>\(null\);\n  const linksHeld = heldLinks === agencyId;/);
  assert.equal(page.match(/linksHeld=\{linksHeld\}\n            onLifecycle=\{onLifecycle\}/g)?.length, 2);
  for (const tab of [agents, settings]) { assert.match(tab, /held=\{linksHeld\} onLifecycle=\{onLifecycle\}/); assert.doesNotMatch(tab, /setHeldLinks|holdLinks\(/); }
  assert.match(agents, /disabled=\{linksHeld\} onClick=\{\(\) => setLinkAgentId\(null\)\}>Close partner link settings/);
  assert.match(settings, /const portalUrl = partnerLink\(window\.location\.origin, agency\.status, agency\.portal_token, linksHeld\);/);
  // Another agency on the same page instance is unaffected, and cannot release this one.
  assert.equal(partnerLink(origin, 'active', oldToken, holdLinks(null, agency, 'unknown') === foreign), `${origin}/portal/${oldToken}`);
  assert.equal(holdLinks(agency, foreign, 'released'), agency);
});

test('a failed reload keeps the links hidden; only a successful one releases them', () => {
  const held = holdLinks(null, agency, 'reload');
  assert.equal(releaseAfterReload(held, agency, false), agency);
  assert.equal(releaseAfterReload(held, foreign, true), agency);
  assert.equal(releaseAfterReload(held, agency, true), null);
  // The page load reports failure instead of swallowing it, on both of its failure paths.
  const page = read('src/components/agency/AgencyDetailView.tsx'), load = page.slice(page.indexOf('const loadData = useCallback'), page.indexOf('const reload ='));
  assert.match(load, /setError\('Agency not found'\);\n        return false;/);
  assert.match(load, /return true;\n    \} catch \(err\) \{[\s\S]*?return false;\n    \} finally \{/);
});

test('a known refusal changed nothing and releases the links; stale facts force a fresh read instead', () => {
  for (const code of ['OBLIGATIONS_OPEN', 'CONFLICT', 'RESOURCE_UNAVAILABLE', 'INVALID_INPUT', 'NOT_READY', 'ACTION_DENIED']) {
    assert.equal(lifecycleSignal({ kind: 'refused', code }), 'released');
    const held = holdLinks(holdLinks(null, agency, 'sending'), agency, lifecycleSignal({ kind: 'refused', code }));
    assert.equal(held, null); assert.equal(partnerLink(origin, 'active', oldToken, held === agency), `${origin}/portal/${oldToken}`);
  }
  assert.equal(lifecycleSignal({ kind: 'refused', code: 'STALE_FACTS' }), 'reload');
  assert.equal(holdLinks(agency, agency, 'reload'), agency);
  // The panel reports every reply to the page, and an archived agency never shows a stored link.
  const controls = read('src/components/agency/AgencyLifecycleControls.tsx');
  assert.match(controls, /onLifecycle\('sending'\);/); assert.match(controls, /const signal = lifecycleSignal\(reply\)/); assert.match(controls, /onLifecycle\(signal\);/);
  assert.match(controls, /setPhase\('unknown'\); onLifecycle\('unknown'\);/); assert.match(controls, /if \(uncertain\) onLifecycle\('reload'\);/);
  assert.equal(partnerLink(origin, 'archived', oldToken, false), '');
});
