import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardEdit, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type AmendmentCategory = 'scope' | 'requirements' | 'timeframe' | 'constraints' | 'other';
type Amendment = {
  id: string;
  request_id: string;
  author_id: string;
  category: AmendmentCategory;
  summary: string;
  details: string;
  status: 'pending' | 'reviewed';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};
const CATEGORY_LABELS: Record<AmendmentCategory, string> = {
  scope: 'Scope change', requirements: 'New or revised requirements',
  timeframe: 'Preferred timeframe', constraints: 'Constraints / dependencies',
  other: 'Other clarification',
};
const PAGE_SIZE = 20;

export default function ServiceBriefAmendments({
  requestId, ownerId, isAdmin = false, onChanged,
}: {
  requestId: string; ownerId: string; isAdmin?: boolean; onChanged?: () => void;
}) {
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const viewerKey = requestId + ':' + (viewerId ?? 'signed-out') + ':' + (isAdmin ? 'admin' : 'owner');
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const generation = useRef(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [items, setItems] = useState<Amendment[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [category, setCategory] = useState<AmendmentCategory>('requirements');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visibleItems = viewerId && loadedKey === viewerKey ? items : [];
  const visibleTotal = viewerId && loadedKey === viewerKey ? total : 0;

  const load = useCallback(async () => {
    const seq = ++generation.current;
    if (!viewerId) {
      setLoadedKey(null); setItems([]); setTotal(0); setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: loadError, count } = await supabase.from('service_brief_amendments')
      .select('id,request_id,author_id,category,summary,details,status,created_at,reviewed_at,reviewed_by', { count: 'exact' })
      .eq('request_id', requestId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(limit);
    if (generation.current !== seq) return;
    if (loadError) {
      console.error('Service brief amendments query failed', loadError);
      setItems([]); setTotal(0); setLoadedKey(null);
      setError('Could not load brief changes. Verify that the Phase 13 migration is deployed and this account has access.');
    } else {
      setItems((data ?? []) as Amendment[]);
      setTotal(count ?? 0);
      setLoadedKey(viewerKey);
    }
    setLoading(false);
  }, [requestId, viewerId, viewerKey, limit]);

  useEffect(() => {
    generation.current++;
    setLoadedKey(null);
    setItems([]); setTotal(0); setLimit(PAGE_SIZE);
    setBusy(null); setCategory('requirements'); setSummary(''); setDetails('');
    setError(''); setNotice('');
  }, [viewerKey]);

  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [load]);

  const verifyActor = async (adminRequired: boolean) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== viewerId || viewerKeyRef.current !== viewerKey) {
      throw authError ?? new Error('Account changed');
    }
    if (adminRequired) {
      const { data: authorized, error: adminError } = await supabase.rpc('is_admin');
      if (adminError || authorized !== true) throw adminError ?? new Error('Administrator access required');
    } else if (user.id !== ownerId) {
      throw new Error('Only the request owner may submit a brief change');
    }
    if (viewerKeyRef.current !== viewerKey) throw new Error('Account changed');
    return user.id;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAdmin || busy || loadedKey !== viewerKey) return;
    const cleanSummary = summary.trim();
    const cleanDetails = details.trim();
    if (cleanSummary.length < 10 || cleanSummary.length > 160 ||
        cleanDetails.length < 30 || cleanDetails.length > 2500) {
      setError('Use 10–160 characters for the summary and 30–2,500 for the change details.');
      return;
    }
    setBusy('submit'); setError(''); setNotice('');
    try {
      const actor = await verifyActor(false);
      const { data, error: insertError } = await supabase.from('service_brief_amendments')
        .insert({ request_id: requestId, author_id: actor, category, summary: cleanSummary, details: cleanDetails })
        .select('id').single();
      if (insertError || !data?.id) throw insertError ?? new Error('Brief amendment not confirmed');
      if (viewerKeyRef.current !== viewerKey) return;
      setSummary(''); setDetails(''); setCategory('requirements');
      setNotice('Your brief change was saved for administrator review. The original brief remains unchanged.');
      await load();
      if (viewerKeyRef.current === viewerKey) onChanged?.();
    } catch (reason) {
      console.error('Service amendment insert failed', reason);
      if (viewerKeyRef.current === viewerKey) {
        const detail = reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : '';
        setError(/already submitted recently/i.test(detail)
          ? 'This brief change was already saved recently. Refresh before resubmitting.'
          : /Too many brief amendments/i.test(detail)
            ? 'Brief change limit reached. Try again in about ten minutes.'
            : 'Brief change not saved. Verify your account and connection, then retry.');
      }
    } finally {
      if (viewerKeyRef.current === viewerKey) setBusy(null);
    }
  };

  const acknowledge = async (amendmentId: string) => {
    if (!isAdmin || busy || loadedKey !== viewerKey) return;
    const item = visibleItems.find((v) => v.id === amendmentId);
    if (!item || item.status !== 'pending') return;
    setBusy(amendmentId); setError(''); setNotice('');
    try {
      await verifyActor(true);
      const { data, error: updateError } = await supabase.from('service_brief_amendments')
        .update({ status: 'reviewed' })
        .eq('id', amendmentId).eq('request_id', requestId).eq('status', 'pending')
        .select('id').maybeSingle();
      if (updateError || !data?.id) throw updateError ?? new Error('Amendment changed in another session');
      if (viewerKeyRef.current !== viewerKey) return;
      setNotice('Change acknowledged as reviewed. This does not approve a scope, price or delivery.');
      await load();
      if (viewerKeyRef.current === viewerKey) onChanged?.();
    } catch (reason) {
      console.error('Service amendment acknowledgement failed', reason);
      if (viewerKeyRef.current === viewerKey) {
        setError('Review not saved. Refresh and verify the record remains pending and your admin session is valid.');
      }
    } finally {
      if (viewerKeyRef.current === viewerKey) setBusy(null);
    }
  };

  return (
    <section aria-label="Request brief change history" className="mt-5 rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardEdit className="h-4 w-4 text-primary" />Brief changes
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The original request is preserved. Each change is permanent; an administrator can acknowledge review without approving delivery.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading || busy !== null} onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
      {!viewerId ? <p className="mt-4 text-sm text-muted-foreground">Sign in to access this private request.</p>
        : loading || loadedKey !== viewerKey ? <p className="mt-4 text-sm text-muted-foreground">Loading saved brief changes…</p>
          : <div className="mt-4 space-y-3">
            {visibleItems.length === 0 ? <p className="text-sm text-muted-foreground">No changes have been submitted for this request.</p>
              : visibleItems.map((item) => (
                <article key={item.id} className="rounded-xl border border-border/80 bg-background/50 p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-xs font-semibold text-primary">{CATEGORY_LABELS[item.category]} · {item.status === 'reviewed' ? 'Reviewed' : 'Awaiting review'}</p>
                    <time dateTime={item.created_at} className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time>
                  </div>
                  <h4 className="mt-2 break-words text-sm font-semibold">{item.summary}</h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.details}</p>
                  {item.status === 'reviewed' && item.reviewed_at && <p className="mt-2 text-xs text-muted-foreground">
                    Administrator review recorded {new Date(item.reviewed_at).toLocaleString()} · Not scope acceptance
                  </p>}
                  {isAdmin && item.status === 'pending' && (
                    <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy !== null} onClick={() => void acknowledge(item.id)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />{busy === item.id ? 'Recording…' : 'Mark reviewed'}
                    </Button>
                  )}
                </article>
              ))}
            {visibleItems.length < visibleTotal && <Button type="button" variant="outline" size="sm" disabled={loading || busy !== null}
              onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Load older brief changes ({visibleTotal - visibleItems.length} remaining)
            </Button>}
            <p className="text-xs text-muted-foreground">{visibleItems.length} of {visibleTotal} saved changes. Original request text remains unchanged.</p>
          </div>}
      {!isAdmin && viewerId && loadedKey === viewerKey && (
        <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={(event) => void submit(event)}>
          <h4 className="text-sm font-semibold">Submit a change to your original brief</h4>
          <div>
            <label htmlFor={'amendment-category-' + requestId} className="mb-1 block text-sm font-medium">Change category</label>
            <select id={'amendment-category-' + requestId} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={category} disabled={busy !== null} onChange={(event) => setCategory(event.target.value as AmendmentCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={'amendment-summary-' + requestId} className="mb-1 block text-sm font-medium">Summary (10–160 characters)</label>
            <Input id={'amendment-summary-' + requestId} maxLength={160} minLength={10} required value={summary}
              disabled={busy !== null} onChange={(event) => setSummary(event.target.value)} />
          </div>
          <div>
            <label htmlFor={'amendment-details-' + requestId} className="mb-1 block text-sm font-medium">What changed? (30–2,500 characters)</label>
            <Textarea id={'amendment-details-' + requestId} rows={4} maxLength={2500} minLength={30} required
              value={details} disabled={busy !== null} onChange={(event) => setDetails(event.target.value)}
              placeholder="Explain the change and how it affects your requirements. Do not paste passwords, access tokens or confidential third-party data." />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Saved changes cannot be edited. A new change can clarify an earlier one.</p>
            <Button type="submit" disabled={busy !== null || summary.trim().length < 10 || details.trim().length < 30}>
              <Send className="mr-2 h-4 w-4" />{busy === 'submit' ? 'Saving…' : 'Submit brief change'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
