import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSPACE_NAVIGATION, workspaceSection } from '../src/lib/workspace-navigation.ts';

for (const item of WORKSPACE_NAVIGATION) {
  assert.equal(workspaceSection(item.href), item.section);
}
assert.equal(workspaceSection('#/agency/demo-agency-1'), 'agencies');
assert.equal(workspaceSection(''), 'overview');
assert.equal(workspaceSection('#/unknown'), 'overview');
assert.equal(new Set(WORKSPACE_NAVIGATION.map((item) => item.href)).size, 6);

// Theme never goes on the root layout/body unconditionally: public portals stay separate.
const provider = readFileSync(new URL('../src/contexts/OperatorContext.tsx', import.meta.url), 'utf8');
const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
assert.ok(provider.includes("body.classList.remove('moovs-operator-workspace')"));
assert.ok(!provider.includes("setProperty('--primary', operator.primaryColor)"));
assert.ok(!layout.includes('className="moovs-operator-workspace"'));
assert.ok(root.indexOf("if (slug === 'portal')") < root.indexOf('<OperatorProvider'));
console.log('Workspace navigation and theme boundary verification passed (14 assertions).');
