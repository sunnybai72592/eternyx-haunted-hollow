import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, History, LockKeyhole, RefreshCw, Save, UserRoundCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { serviceNextActionLabels, validInternalReviewDate, type ServiceNextAction } from '@/lib/serviceReviewPlanner';
import ServiceTriageHistory from './ServiceTriageHistory';

type Triage = {
  request_id: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_admin_id: string | null;
  internal_note: string;
  next_action_kind: ServiceNextAction;
  next_review_on: string | null;
  updated_at: string;
};
const priorities: readonly Triage['priority'][] = ['low', 'normal', 'high', 'urgent'];

export default function ServiceTriagePanel({ requestId, onSaved }: { requestId: string; onSaved?: () => void }) {
  const currentUser = useAuthStore((s) => s.user);
  const viewerId = currentUser?.id ?? null;
  const viewerKey = requestId + ':' + (viewerId ?? 'signed-out');
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const [showHistory, setShowHistory] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const loadGeneration = useRef(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<Triage | null>(null);
  const [priority, setPriority] = useState<Triage['priority']>('normal');
  const [assignedId, setAssignedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [nextActionKind, setNextActionKind] = useState<ServiceNextAction>('not_set');
  const [nextReviewOn, setNextReviewOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!viewerId) {
      setLoadedKey(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data: allowed, error: permissionError } = await supabase.rpc('is_admin');
    if (generation !== loadGeneration.current) return;
    if (permissionError || allowed !== true) {
      setError('Administrator access could not be verified.');
      setLoadedKey(null);
      setSaved(null);
      setLoading(false);
      return;
    }
    const { data, error: loadError } = await supabase.from('service_request_triage')
      .select('request_id,priority,assigned_admin_id,internal_note,next_action_kind,next_review_on,updated_at')
      .eq('request_id', requestId).maybeSingle();
    if (generation !== loadGeneration.current) return;
    if (loadError) {
      console.error('Private triage load failed', loadError);
      setError('Could not load internal triage. Check database access and migration.');
      setLoadedKey(null);
      setSaved(null);
    } else {
      const record = data as Triage | null;
      setSaved(record);
      setPriority(record?.priority ?? 'normal');
      setAssignedId(record?.assigned_admin_id ?? null);
      setNote(record?.internal_note ?? '');
      setNextActionKind(record?.next_action_kind ?? 'not_set');
      setNextReviewOn(record?.next_review_on ?? '');
      setLoadedKey(viewerKey);
    }
    setLoading(false);
  }, [requestId, viewerId, viewerKey]);

  useEffect(() => {
    loadGeneration.current += 1;
    setSaved(null);
    setLoadedKey(null);
    setPriority('normal');
    setAssignedId(null);
    setNote('');
    setNextActionKind('not_set');
    setNextReviewOn('');
    setShowHistory(false);
    setHistoryRevision(0);
    setNotice('');
    setError('');
  }, [viewerKey]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const save = async () => {
    if (saving || !currentUser || loading || loadedKey !== viewerKey) return;
    if (note.length > 2000) { setError('Internal note must be 2,000 characters or fewer.'); return; }
    if (!validInternalReviewDate(nextReviewOn)) {
      setError('Choose a valid UTC date between 2020 and 2100.'); return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || user.id !== currentUser.id) throw authError ?? new Error('Session expired');
      const { data: permitted, error: verifyError } = await supabase.rpc('is_admin');
      if (verifyError || permitted !== true) throw verifyError ?? new Error('Administrator permission required');
      if (viewerKeyRef.current !== viewerKey) throw new Error('Account changed while verifying');
      const values = {
        priority, assigned_admin_id: assignedId, internal_note: note.trim(),
        next_action_kind: nextActionKind, next_review_on: nextReviewOn || null,
      };
      // No upsert: it can attempt to update the immutable request_id column.
      const write = saved
        ? supabase.from('service_request_triage').update(values)
          .eq('request_id', requestId).eq('updated_at', saved.updated_at)
          .select('request_id,priority,assigned_admin_id,internal_note,next_action_kind,next_review_on,updated_at').maybeSingle()
        : supabase.from('service_request_triage').insert({ request_id: requestId, ...values })
          .select('request_id,priority,assigned_admin_id,internal_note,next_action_kind,next_review_on,updated_at').maybeSingle();
      const { data, error: writeError } = await write;
      if (writeError || !data) throw writeError ?? new Error('Triage changed in another session');
      if (viewerKeyRef.current !== viewerKey) return;
      setSaved(data as Triage);
      setLoadedKey(viewerKey);
      setNotice('Private triage saved for administrators only.');
      setHistoryRevision((n) => n + 1);
      onSaved?.();
    } catch (reason) {
      console.error('Private triage update failed', reason);
      setError('Review plan not saved. Refresh to resolve another admin’s changes, missing migrations or permission errors.');
    } finally {
      setSaving(false);
    }
  };
  const changed = !saved
    ? priority !== 'normal' || assignedId !== null || note.trim().length > 0 || nextActionKind !== 'not_set' || nextReviewOn !== ''
    : priority !== saved.priority || assignedId !== saved.assigned_admin_id || note.trim() !== saved.internal_note || nextActionKind !== saved.next_action_kind || (nextReviewOn || null) !== saved.next_review_on;

  return (
    <section aria-label="Private administrator triage" className="mt-5 rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole className="h-4 w-4 text-primary" />Private triage</h3><p className="mt-1 text-xs text-muted-foreground">Visible only to verified administrators — not customers.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={saving || loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
      {loading || loadedKey !== viewerKey ? <p className="mt-4 text-sm text-muted-foreground">Verifying private triage…</p> : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor={'triage-priority-' + requestId} className="mb-2 block text-sm font-semibold">Operator priority</label>
              <select id={'triage-priority-' + requestId} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as Triage['priority'])}>
                {priorities.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select></div>
            <div><span className="mb-2 block text-sm font-semibold">Admin assignment</span>
              <p className="break-all text-xs text-muted-foreground">{assignedId ? assignedId === currentUser?.id ? 'Assigned to you' : 'Assigned admin: ' + assignedId : 'Unassigned'}</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" disabled={!currentUser} onClick={() => setAssignedId((id) => id === currentUser?.id ? null : currentUser?.id ?? null)}>
                <UserRoundCheck className="mr-2 h-4 w-4" />{assignedId === currentUser?.id ? 'Release assignment' : 'Assign to myself'}
              </Button>
            </div>
          </div>
          <div><label htmlFor={'triage-note-' + requestId} className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" />Internal review notes</label>
            <Textarea id={'triage-note-' + requestId} rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal only: feasibility blockers, next review action, dependencies. Never paste credentials or sensitive customer datasets." />
            <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/2,000</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={'triage-next-action-' + requestId} className="mb-2 block text-sm font-semibold">Next internal action</label>
              <select id={'triage-next-action-' + requestId} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={nextActionKind} onChange={(event) => setNextActionKind(event.target.value as ServiceNextAction)}>
                {Object.entries(serviceNextActionLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={'triage-next-review-' + requestId} className="mb-2 block text-sm font-semibold">Internal review date (UTC)</label>
              <Input id={'triage-next-review-' + requestId} type="date" min="2020-01-01" max="2100-12-31" value={nextReviewOn} onChange={(event) => setNextReviewOn(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Optional. Leave empty if no internal review is planned.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Internal planning only. Dates are not customer deadlines, delivery promises or service-level agreements.</p>
            {(nextActionKind !== 'not_set' || nextReviewOn) && (
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { setNextActionKind('not_set'); setNextReviewOn(''); }}>
                Clear planned follow-up (save to confirm)
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={!changed || saving || !currentUser}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save private triage'}</Button>
            <Button type="button" variant="outline" aria-expanded={showHistory} disabled={saving} onClick={() => setShowHistory((current) => !current)}>
              <History className="mr-2 h-4 w-4" />{showHistory ? 'Close decision history' : 'View decision history'}
            </Button>
          </div>
          {showHistory && <ServiceTriageHistory requestId={requestId} refreshToken={historyRevision} />}
        </div>
      )}
    </section>
  );
}