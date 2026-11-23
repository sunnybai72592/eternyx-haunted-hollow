import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Download, History, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type ActivityStream = 'conversation' | 'scope' | 'clarifications' | 'brief_changes';
type StreamFilter = ActivityStream | 'all';
type JournalItem = {
  request_id: string;
  event_key: string;
  actor_id: string | null;
  occurred_at: string;
  stream: ActivityStream;
  event_kind: string;
  title: string;
  detail: string | null;
};
const PAGE_SIZE = 30;
const STREAM_LABELS: Record<ActivityStream, string> = {
  conversation: 'Conversation and status',
  scope: 'Scope and feedback',
  clarifications: 'Clarifications',
  brief_changes: 'Brief changes',
};
const buttonLabel = (filter: StreamFilter) => filter === 'all' ? 'All activity' : STREAM_LABELS[filter];

export default function ServiceRequestJournal({
  requestId, ownerId,
}: { requestId: string; ownerId: string }) {
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const viewerKey = requestId + ':' + (viewerId ?? 'signed-out');
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const seqRef = useRef(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamFilter>('all');
  const [items, setItems] = useState<JournalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const activeKey = viewerKey + ':' + stream;
  const visibleItems = viewerId && loadedKey === activeKey ? items : [];
  const visibleTotal = viewerId && loadedKey === activeKey ? total : 0;

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    if (!viewerId) {
      setLoadedKey(null); setItems([]); setTotal(0);
      setLoading(false); return;
    }
    setLoading(true);
    setLoadingOlder(false);
    setError('');
    let query = supabase.from('service_request_journal')
      .select('request_id,event_key,actor_id,occurred_at,stream,event_kind,title,detail', { count: 'exact' })
      .eq('request_id', requestId);
    if (stream !== 'all') query = query.eq('stream', stream);
    const { data, error: queryError, count } = await query
      .order('occurred_at', { ascending: false })
      .order('event_key', { ascending: false })
      .limit(PAGE_SIZE);
    if (seq !== seqRef.current || viewerKeyRef.current !== viewerKey) return;
    if (queryError) {
      console.error('Request journal load failed', queryError);
      setItems([]); setTotal(0); setLoadedKey(null);
      setError('Could not load the private journal. Check account permissions and the Services migration.');
    } else {
      setItems((data ?? []) as JournalItem[]);
      setTotal(count ?? 0);
      setLoadedKey(viewerKey + ':' + stream);
    }
    setLoading(false);
  }, [viewerId, requestId, viewerKey, stream]);

  useEffect(() => {
    seqRef.current++;
    setItems([]); setTotal(0); setLoadedKey(null);
    setStream('all'); setError(''); setNotice('');
    setLoadingOlder(false);
  }, [viewerKey]);

  useEffect(() => {
    void load();
    return () => { seqRef.current++; };
  }, [load]);

  const loadOlder = async () => {
    const oldest = visibleItems[visibleItems.length - 1];
    if (!viewerId || !oldest || loading || loadingOlder || visibleItems.length >= visibleTotal) return;
    const seq = seqRef.current;
    setLoadingOlder(true);
    setError('');
    let query = supabase.from('service_request_journal')
      .select('request_id,event_key,actor_id,occurred_at,stream,event_kind,title,detail')
      .eq('request_id', requestId)
      .or(`occurred_at.lt.${oldest.occurred_at},and(occurred_at.eq.${oldest.occurred_at},event_key.lt.${oldest.event_key})`);
    if (stream !== 'all') query = query.eq('stream', stream);
    const { data, error: queryError } = await query
      .order('occurred_at', { ascending: false })
      .order('event_key', { ascending: false })
      .limit(PAGE_SIZE);
    if (seq !== seqRef.current || viewerKeyRef.current !== viewerKey) return;
    if (queryError) {
      console.error('Request journal older page failed', queryError);
      setError('Older journal items could not be loaded. Try again.');
    } else {
      const older = (data ?? []) as JournalItem[];
      setItems((before) => {
        const seen = new Set(before.map((item) => item.event_key));
        return [...before, ...older.filter((item) => !seen.has(item.event_key))];
      });
      if (older.length === 0) setTotal(visibleItems.length);
    }
    setLoadingOlder(false);
  };

  const exportLoaded = () => {
    if (loadedKey !== activeKey || visibleItems.length === 0 || !viewerId) return;
    const lines = [
      'ETERNYX SERVICES — PRIVATE REQUEST ACTIVITY JOURNAL',
      'Request: ' + requestId,
      'View: ' + buttonLabel(stream),
      'Included: ' + visibleItems.length + ' loaded events (out of ' + visibleTotal + ')',
      'This file contains customer-visible activity only, not internal admin notes.',
      'Not proof of contract, payment, delivery or message reading.',
      '',
      ...visibleItems.flatMap((item) => [
        new Date(item.occurred_at).toISOString() + ' | ' + item.title,
        'Actor: ' + (item.actor_id === ownerId ? 'Customer' : item.actor_id ? 'ETERNYX administrator' : 'System'),
        item.detail ?? '',
        '',
      ]),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'eternyx-service-journal-' + requestId + '.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Private journal export prepared for the loaded events only. Keep this copy secure.');
  };

  return (
    <section aria-label="Unified request activity journal" className="mt-5 rounded-2xl border border-border bg-background/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4 text-primary" />Request activity journal</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A chronological view of real conversations, scope feedback, clarifications and brief changes. Internal administrator notes stay private.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || loadingOlder || !viewerId} onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!viewerId || loading || loadedKey !== activeKey || visibleItems.length === 0} onClick={exportLoaded}>
            <Download className="mr-2 h-4 w-4" />Export loaded
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Journal activity filters">
        {(['all', 'conversation', 'scope', 'clarifications', 'brief_changes'] as StreamFilter[]).map((value) => (
          <Button key={value} type="button" size="sm" variant={stream === value ? 'default' : 'outline'}
            aria-pressed={stream === value}
            onClick={() => { if (value !== stream) { setStream(value); setNotice(''); } }}>
            {buttonLabel(value)}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
      {!viewerId ? <p className="mt-5 text-sm text-muted-foreground">Sign in to inspect your private request journal.</p>
        : loading || loadedKey !== activeKey ? <p className="mt-5 text-sm text-muted-foreground">Loading recorded activity…</p>
          : <div className="mt-5">
            {visibleItems.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded for this category.</p>
              : <ol className="space-y-3">
                {visibleItems.map((item) => (
                  <li key={item.event_key} className="rounded-xl border border-border/80 bg-card/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">{STREAM_LABELS[item.stream] ?? item.stream}</span>
                      <time dateTime={item.occurred_at} className="text-xs text-muted-foreground">{new Date(item.occurred_at).toLocaleString()}</time>
                    </div>
                    <h4 className="mt-2 break-words text-sm font-semibold">{item.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.actor_id === ownerId ? 'Customer' : item.actor_id ? 'ETERNYX administrator' : 'System'}
                    </p>
                    {item.detail && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.detail}</p>}
                  </li>
                ))}
              </ol>}
            {visibleItems.length < visibleTotal && <Button type="button" variant="outline" size="sm" className="mt-4" disabled={loadingOlder}
              onClick={() => void loadOlder()}>
              <ClipboardList className="mr-2 h-4 w-4" />{loadingOlder ? 'Loading…' : 'Load older (' + (visibleTotal - visibleItems.length) + ' remaining)'}
            </Button>}
            <p className="mt-4 text-xs text-muted-foreground">
              {visibleItems.length} of {visibleTotal} recorded events loaded. No internal triage notes, billing records or read receipts are included.
            </p>
          </div>}
    </section>
  );
}
