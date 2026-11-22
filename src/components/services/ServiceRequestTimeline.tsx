import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Clock3, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { serviceRequestStatuses, type ServiceRequestStatus } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ActivityRow = {
  id: string;
  actor_id: string | null;
  event_type: 'message' | 'request_created' | 'status_changed';
  body: string | null;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
};

type Props = {
  requestId: string;
  ownerId: string;
  refreshToken?: number;
};

const statusName = (status: string | null) =>
  status && status in serviceRequestStatuses
    ? serviceRequestStatuses[status as ServiceRequestStatus].label
    : status?.replace(/_/g, ' ') ?? 'Unknown';

export default function ServiceRequestTimeline({ requestId, ownerId, refreshToken = 0 }: Props) {
  const user = useAuthStore((state) => state.user);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const queryGeneration = useRef(0);
  const [olderLoading, setOlderLoading] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    const generation = ++queryGeneration.current;
    setOlderLoading(false);
    setLoading(true);
    setError('');
    const { data, error: queryError, count } = await supabase
      .from('service_request_activity')
      .select('id,actor_id,event_type,body,from_status,to_status,created_at', { count: 'exact' })
      .eq('request_id', requestId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (generation !== queryGeneration.current) return;
    if (queryError) {
      console.error('Service request activity query failed:', queryError);
      setActivity([]);
      setTotalCount(0);
      setError('Could not load the conversation. Verify that the service desk migration is active.');
    } else {
      setActivity(((data ?? []) as ActivityRow[]).reverse());
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    void load();
    return () => { queryGeneration.current += 1; };
  }, [load, refreshToken]);

  const loadOlder = async () => {
    const oldest = activity[0];
    if (!oldest || olderLoading || loading || activity.length >= totalCount) return;
    const generation = queryGeneration.current;
    setOlderLoading(true);
    setError('');
    // An append-only activity stream can gain new events while this page is
    // open. Cursor pagination does not skip older events after those inserts.
    const { data, error: fetchError } = await supabase.from('service_request_activity')
      .select('id,actor_id,event_type,body,from_status,to_status,created_at')
      .eq('request_id', requestId)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (generation !== queryGeneration.current) return;
    if (fetchError) {
      setError('Older request activity could not be retrieved. Please retry.');
    } else {
      const older = ((data ?? []) as ActivityRow[]).reverse();
      setActivity((existing) => {
        const unique = new Map([...older, ...existing].map((event) => [event.id, event]));
        return [...unique.values()].sort((a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
        );
      });
      if (older.length === 0) setTotalCount(activity.length);
    }
    setOlderLoading(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const content = message.trim();
    if (content.length < 10 || content.length > 1500) {
      setError('Please write between 10 and 1,500 characters.');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !verifiedUser) throw new Error('Session expired. Sign in again.');
      const { data, error: insertError } = await supabase
        .from('service_request_activity')
        .insert({
          request_id: requestId,
          actor_id: verifiedUser.id,
          event_type: 'message',
          body: content,
        })
        .select('id')
        .single();
      if (insertError || !data?.id) throw insertError ?? new Error('Message not confirmed.');
      setMessage('');
      setNotice('Message saved to this request.');
      await load();
    } catch (insertError) {
      console.error('Service request message insert failed:', insertError);
      setError('Message not saved. Please retry after verifying your connection.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Request conversation" className="mt-5 rounded-2xl border border-border bg-background/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-base font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Request conversation</h3><p className="mt-1 text-xs text-muted-foreground">Only this customer and verified ETERNYX administrators can read these updates.</p></div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading || sending}>
          <RefreshCw className={"mr-2 h-4 w-4 " + (loading ? 'animate-spin' : '')} />Refresh
        </Button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-primary/20 p-3 text-sm text-primary">{notice}</p>}
      <div aria-live="polite" className="mt-5 max-h-96 space-y-3 overflow-y-auto">
        {loading ? <p className="text-sm text-muted-foreground">Loading activity…</p>
          : activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet. Your original project brief is recorded above.</p>
          : activity.map((item) => {
            const isEvent = item.event_type !== 'message';
            const actor = item.actor_id === ownerId ? 'Customer' : item.actor_id ? 'ETERNYX administrator' : 'System';
            const heading = item.event_type === 'request_created'
              ? 'Project brief received'
              : item.event_type === 'status_changed'
                ? 'Status recorded: ' + statusName(item.from_status) + ' → ' + statusName(item.to_status)
                : actor + ' message';
            return (
              <article key={item.id} className={"rounded-xl border p-3 sm:p-4 " + (isEvent ? 'border-primary/20 bg-primary/[0.035]' : 'border-border/75 bg-card/60')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">{isEvent ? <Clock3 className="h-4 w-4 text-primary" /> : <ShieldCheck className="h-4 w-4 text-primary" />}{heading}</span>
                  <time dateTime={item.created_at} className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time>
                </div>
                {item.body && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.body}</p>}
              </article>
            );
          })}
        {activity.length < totalCount && (
          <div className="py-3 text-center">
            <Button type="button" variant="outline" size="sm" disabled={olderLoading} onClick={() => void loadOlder()}>
              {olderLoading ? 'Loading older activity…' : 'Load older events (' + (totalCount - activity.length) + ' remaining)'}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{activity.length} of {totalCount} saved events loaded. Earlier pages use stable event cursors, not shifting offsets.</p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3 border-t border-border pt-4">
        <label htmlFor={'service-request-message-' + requestId} className="block text-sm font-semibold">Send a follow-up</label>
        <Textarea
          id={'service-request-message-' + requestId}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          minLength={10}
          maxLength={1500}
          required
          disabled={sending || !user}
          placeholder="Ask a question or clarify project scope. Do not include passwords, private keys or confidential client records."
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{message.length}/1,500 · No attachments or payment requests here.</p>
          <Button type="submit" disabled={sending || !user || message.trim().length < 10}>
            <Send className="mr-2 h-4 w-4" />{sending ? 'Sending…' : 'Send message'}
          </Button>
        </div>
      </form>
    </section>
  );
}