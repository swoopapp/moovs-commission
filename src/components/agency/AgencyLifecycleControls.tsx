'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { mutateAgencyLifecycle, readAgencyLifecycle, type LifecycleAction, type LifecycleState } from '../../services/agencyLifecycleService';

const REFUSALS: Record<string, string> = {
  OBLIGATIONS_OPEN: 'Resolve unpaid commissions, pending adjustments and Held reviews before archiving.',
  STALE_FACTS: 'Agency settings changed. Refresh status before trying again.',
  CONFLICT: 'The agency or its client relationships do not allow this change. Refresh and review them.',
  RESOURCE_UNAVAILABLE: 'Agency status is unavailable. Refresh before trying again.',
  INVALID_INPUT: 'Check the reason and refresh agency status before trying again.',
  NOT_READY: 'This change is not available right now. Nothing was saved.',
  ACTION_DENIED: 'Your session or permissions do not allow this action. Sign in again or refresh your access.',
};
/** What the agency page is told. It, not this panel, keeps partner links hidden across tab changes and unmounts. */
export type LifecycleSignal = 'sending' | 'unknown' | 'released' | 'reload';
/** A known refusal changed nothing, so links are safe again; stale facts or a saved change need a full fresh read first. */
export function lifecycleSignal(reply: { kind: 'committed' } | { kind: 'unconfirmed' } | { kind: 'refused'; code: string }): LifecycleSignal {
  return reply.kind === 'unconfirmed' ? 'unknown' : reply.kind === 'refused' && reply.code !== 'STALE_FACTS' ? 'released' : 'reload';
}
/** The agency whose links are hidden. Only an explicit release, or a reload that succeeded, shows them again. */
export const holdLinks = (held: string | null, agencyId: string, signal: LifecycleSignal) => signal === 'released' ? (held === agencyId ? null : held) : agencyId;
export const releaseAfterReload = (held: string | null, agencyId: string, reloaded: boolean) => reloaded && held === agencyId ? null : held;
/** A stored link is shown only when nothing may have replaced or revoked it. */
export const partnerLink = (origin: string, status: string, token: string | null | undefined, held: boolean) => !held && status !== 'archived' && token ? `${origin}/portal/${token}` : '';
const UNCONFIRMED = 'An earlier request could not be confirmed. Refresh status before another action; do not repeat it.';
export function AgencyLifecycleControls({ agencyId, operatorId, isDemo, held, onLifecycle, agent }: {
  agencyId: string; operatorId: string; isDemo: boolean; held: boolean; onLifecycle: (signal: LifecycleSignal) => void;
  agent?: { id: string; name: string };
}) {
  const [facts, setFacts] = useState<LifecycleState | null>(null), [reason, setReason] = useState('');
  // Mounted while the page still holds the links: an earlier request was sending or unconfirmed when this panel went away.
  const [phase, setPhase] = useState<'idle' | 'reading' | 'sending' | 'unknown'>(held && !isDemo ? 'unknown' : 'idle'), [message, setMessage] = useState(held && !isDemo ? UNCONFIRMED : '');
  const mounted = useRef(false), flight = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; flight.current?.abort(); flight.current = null; };
  }, []);
  const busy = phase === 'reading' || phase === 'sending';
  async function refresh() {
    if (isDemo || flight.current) return;
    const uncertain = phase === 'unknown', controller = new AbortController(); flight.current = controller;
    const live = () => mounted.current && flight.current === controller && !controller.signal.aborted;
    setPhase('reading'); setFacts(null);
    try {
      const value = await readAgencyLifecycle(agencyId, operatorId, controller.signal);
      if (!live()) return;
      setFacts(value); setPhase('idle'); setReason('');
      setMessage(uncertain ? 'Current status loaded. The previous request itself could not be confirmed.' : '');
      // The server answered with current facts, so the page may now reload agency and agents and show links again.
      if (uncertain) onLifecycle('reload');
    } catch {
      if (live()) { setPhase(uncertain ? 'unknown' : 'idle'); setMessage('Status could not be refreshed. Do not repeat an unconfirmed request.'); }
    } finally { if (flight.current === controller) flight.current = null; }
  }
  async function change(action: LifecycleAction) {
    if (!facts || isDemo || flight.current || phase === 'unknown') return;
    const warning = action === 'archive'
      ? 'Archive this agency? All agency and agent partner links will stop working. Financial history is kept.'
      : action === 'restore' ? 'Restore this agency? Old partner links will stay revoked.'
        : `Issue a new ${agent ? 'agent' : 'agency'} partner link? Any earlier ${agent ? 'agent' : 'agency'} link will stop working.`;
    if (!window.confirm(warning)) return;
    onLifecycle('sending');
    const controller = new AbortController(); flight.current = controller;
    const live = () => mounted.current && flight.current === controller && !controller.signal.aborted;
    setPhase('sending'); setMessage('');
    try {
      const input = { expected_revision: facts.revision, ...(action === 'issue-agent-link' && agent ? { agent_id: agent.id } : {}), ...(action === 'archive' ? { expected_status: facts.status, reason: reason.trim() } : action === 'restore' ? { reason: reason.trim() } : {}) };
      const reply = await mutateAgencyLifecycle(agencyId, operatorId, action, input, controller.signal);
      if (!live()) return;
      setFacts(null);
      const signal = lifecycleSignal(reply), outcome = reply.kind === 'refused' ? REFUSALS[reply.code] || 'The change was refused. Refresh status before trying again.'
        : action === 'archive' ? 'Agency archived. All partner links have been revoked.'
          : action === 'restore' ? 'Agency restored. Old partner links remain revoked.' : agent ? 'New agent link issued. Copy it once the agent list has reloaded.' : 'New agency link issued. Copy it once the agency has reloaded.';
      // A reload replaces this panel, so the outcome is also shown where it survives.
      if (signal === 'reload') (reply.kind === 'committed' ? toast.success : toast.info)(outcome);
      onLifecycle(signal);
      if (reply.kind === 'unconfirmed') { setPhase('unknown'); setMessage('The change may have been saved. Refresh status before another action; do not repeat this request.'); return; }
      if (reply.kind === 'committed') setReason('');
      setPhase('idle'); setMessage(outcome);
    } catch {
      // Not live means this panel is gone: the page still holds 'sending', which the next mount treats as unconfirmed.
      if (live()) { setFacts(null); setPhase('unknown'); onLifecycle('unknown'); setMessage('The result could not be confirmed. Refresh status before another action; do not repeat this request.'); }
    } finally { if (flight.current === controller) flight.current = null; }
  }
  const open = facts ? Object.values(facts.obligations).some(count => count > 0) : true;
  return <Card>
    <CardHeader><CardTitle className="text-base">{agent ? `Partner link for ${agent.name}` : 'Agency status and access'}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-gray-600">{agent ? 'Issuing a new link revokes any previous link for this agent.' : 'Archiving keeps financial history and revokes all partner links. Restoring does not reactivate old links.'}</p>
      {isDemo ? <p className="text-sm text-gray-600">Sample view only. No agency status or partner links are changed.</p>
        : <Button variant="outline" disabled={busy} onClick={refresh}>{phase === 'reading' ? 'Refreshing…' : 'Refresh status'}</Button>}
      {facts && <>
        <p className="text-sm">Status: <strong>{facts.status}</strong></p>
        {!agent && open && <p className="text-sm text-amber-800">Resolve unpaid commissions, pending adjustments and Held reviews before archiving.</p>}
        {!agent && <>
          <Label htmlFor={`archive-reason-${agencyId}`}>Reason for {facts.status === 'archived' ? 'restoring' : 'archiving'}</Label>
          <Textarea id={`archive-reason-${agencyId}`} value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} />
          <Button variant={facts.status === 'archived' ? 'outline' : 'destructive'} disabled={busy || reason.trim().length < 3 || (facts.status !== 'archived' && open)}
            onClick={() => change(facts.status === 'archived' ? 'restore' : 'archive')}>{facts.status === 'archived' ? 'Restore agency' : 'Archive agency'}</Button>
        </>}
        {facts.status !== 'archived' && (agent ? facts.agents.some(row => row.agent_id === agent.id && row.status === 'active') : true) && <Button variant="outline" disabled={busy} onClick={() => change(agent ? 'issue-agent-link' : 'issue-link')}>{agent ? 'Issue new agent link' : facts.agency_link ? 'Replace agency link' : 'Issue agency link'}</Button>}
      </>}
      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    </CardContent>
  </Card>;
}
