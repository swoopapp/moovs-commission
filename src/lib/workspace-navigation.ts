export type WorkspaceSection = 'overview' | 'agencies' | 'matching' | 'route-rates' | 'review' | 'settlement';

export const WORKSPACE_NAVIGATION = [
  { section: 'overview', label: 'Overview', href: '#/' },
  { section: 'agencies', label: 'Agencies', href: '#/agencies' },
  { section: 'matching', label: 'Agency matching', href: '#/matching' },
  { section: 'review', label: 'Commission review', href: '#/review' },
  { section: 'settlement', label: 'Month-end settlement', href: '#/settlement' },
  { section: 'route-rates', label: 'Route rates', href: '#/route-rates' },
] as const;

// Preserve existing shared hash links; agency details belong to Agencies.
export function workspaceSection(hash: string): WorkspaceSection {
  if (hash === '#/review') return 'review';
  if (hash === '#/settlement') return 'settlement';
  if (hash === '#/matching') return 'matching';
  if (hash === '#/route-rates') return 'route-rates';
  if (hash === '#/agencies' || /^#\/agency\/.+$/.test(hash)) return 'agencies';
  return 'overview';
}
