import { useCallback, useEffect, useRef, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { serviceNextActionLabels, type ServiceNextAction } from '@/lib/serviceReviewPlanner';
import { Button } from '@/components/ui/button';

type HistoryRow = {
  id: string;
  request_id: string;
  actor_id: string | null;
  operation: 'created' | 'updated';
  old_priority: string | null;
  new_priority: string;
  old_assigned_admin_id: string | null;
  new_assigned_admin_id: string | null;
  old_next_action_kind: string | null;
  new_next_action_kind: string;
  old_next_review_on: string | null;
  new_next_review_on: string | null;
  internal_note_changed: boolean;
  created_at: string;
};

const PAGE_SIZE = 20;
const actionLabel = (value: string | null) =>
  value ? serviceNextActionLabels[value as ServiceNextAction] ?? value.replace(/_/g, ' ') : 'Not set';
const assigneeLabel = (value: string | null, viewerId: string) =>
  value === null ? 'Unassigned' : value === viewerId ? 'You' : 'Another admin';

export default function ServiceTriageHistory({ requestId, refreshToken = 0 }: { requestId: string; refreshToken?: number }) {
  const user = useAuthStore((s) => s.user);
  const viewerId = user?.id ?? null;
  const viewerKey = requestId + ':' + (viewerId ?? 'signed-out');
  const generation = useRef(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState('');
  const visibleRows = viewerId && loadedKey === viewerKey ? rows : [];
  const visibleTotal = viewerId && loadedKey === viewerKey ? total : 0;

  const load = useCallback(async () => {
    const seq = ++generation.current;
    setLoading(true);
    setOlderLoading(false);
    setError('');
    if (!viewerId) {
      setLoadedKey(null);
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const { data: permitted, error: permissionError } = await supabase.rpc('is_admin');
    if (seq !== generation.current) return;
    if (permissionError || permitted !== true) {
      setLoadedKey(null);
      setRows([]);
      setTotal(0);
      setError('Administrator access to this history could not be verified.');
      setLoading(false);
      return;
    }
    const { data, error: queryError, count } = await supabase.from('service_triage_history')
      .select('id,request_id,actor_id,operation,old_priority,new_priority,old_assigned_admin_id,new_assigned_admin_id,old_next_action_kind,new_next_action_kind,old_next_review_on,new_next_review_on,internal_note_changed,created_at', { count: 'exact' })
      .eq('request_id', requestId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (seq !== generation.current) return;
    if (queryError) {
      setLoadedKey(null);
      setRows([]);
      setTotal(0);
      setError('Could not load administrator history. Verify the Phase 9 database migration.');
    } else {
      setRows((data ?? []) as HistoryRow[]);
      setTotal(count ?? 0);
      setLoadedKey(viewerKey);
    }
    setLoading(false);
  }, [requestId, viewerId, viewerKey]);

  useEffect(() => {
    setLoadedKey(null);
    setRows([]);
    setTotal(0);
    setError('');
  }, [viewerKey]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load, refreshToken]);

  const loadOlder = async () => {
    const oldest = visibleRows[visibleRows.length - 1];
    if (!oldest || olderLoading || loading || visibleRows.length >= visibleTotal) return;
    const seq = generation.current;
    setOlderLoading(true);
    setError('');
    const { data, error: pageError } = await supabase.from('service_triage_history')
      .select('id,request_id,actor_id,operation,old_priority,new_priority,old_assigned_admin_id,new_assigned_admin_id,old_next_action_kind,new_next_action_kind,old_next_review_on,new_next_review_on,internal_note_changed,created_at')
      .eq('request_id', requestId)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (seq !== generation.current) return;
    if (pageError) {
      setError('Older triage changes are unavailable. Retry to check the history.');
    } else {
      const older = (data ?? []) as HistoryRow[];
      setRows((existing) => {
        const byId = new Map([...existing, ...older].map((row) => [row.id, row]));
        return [...byId.values()].sort((a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      });
      if (older.length === 0) setTotal(visibleRows.length);
    }
    setOlderLoading(false);
  };

  return (
    <section aria-label="Private triage change history" className="mt-5 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />Administrator decision history</h4>
          <p className="mt-1 text-xs text-muted-foreground">Saved changes only. This history records note changes, never the private note text itself.</p>
        </div>
        <Button size="sm" variant="outline" type="button" onClick={() => void load()} disabled={loading || olderLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh history
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {loading || loadedKey !== viewerKey ? <p className="mt-4 text-sm text-muted-foreground">Verifying history access…</p> :
        visibleRows.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No recorded triage decisions yet. History begins after Phase 9 is activated.</p> :
          <ol className="mt-4 space-y-3">
            {visibleRows.map((row) => {
              const changes: string[] = [];
              if (row.operation === 'created') {
                changes.push('Initial priority: ' + row.new_priority);
                changes.push('Initial assignment: ' + assigneeLabel(row.new_assigned_admin_id, viewerId!));
                if (row.new_next_action_kind !== 'not_set') changes.push('Initial action: ' + actionLabel(row.new_next_action_kind));
                if (row.new_next_review_on) changes.push('Initial review date: ' + row.new_next_review_on + ' UTC');
              } else {
                if (row.old_priority !== row.new_priority) changes.push('Priority: ' + row.old_priority + ' → ' + row.new_priority);
                if (row.old_assigned_admin_id !== row.new_assigned_admin_id) changes.push('Assignment: ' + assigneeLabel(row.old_assigned_admin_id, viewerId!) + ' → ' + assigneeLabel(row.new_assigned_admin_id, viewerId!));
                if (row.old_next_action_kind !== row.new_next_action_kind) changes.push('Action: ' + actionLabel(row.old_next_action_kind) + ' → ' + actionLabel(row.new_next_action_kind));
                if (row.old_next_review_on !== row.new_next_review_on) changes.push('Review date: ' + (row.old_next_review_on ?? 'Not scheduled') + ' → ' + (row.new_next_review_on ?? 'Not scheduled'));
              }
              if (row.internal_note_changed) changes.push('Private note updated (text not copied)');
              return (
                <li key={row.id} className="rounded-lg border border-border/70 bg-background/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{row.operation === 'created' ? 'Triage initialized' : 'Triage updated'} · {row.actor_id === viewerId ? 'You' : row.actor_id ? 'Another administrator' : 'System / unknown actor'}</strong>
                    <time dateTime={row.created_at} className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</time>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {changes.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                </li>
              );
            })}
          </ol>}
      {visibleRows.length < visibleTotal && (
        <Button type="button" variant="outline" size="sm" className="mt-4" disabled={olderLoading || loading} onClick={() => void loadOlder()}>
          {olderLoading ? 'Loading older decisions…' : 'Load older decisions (' + (visibleTotal - visibleRows.length) + ' remaining)'}
        </Button>
      )}
      {loadedKey === viewerKey && <p className="mt-3 text-xs text-muted-foreground">{visibleRows.length} of {visibleTotal} saved decisions loaded. Internal use only; no response-time commitment.</p>}
    </section>
  );
}
