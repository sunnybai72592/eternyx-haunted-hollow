import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ClipboardCheck, FileText, MessageSquareText, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ScopeReview = {
  id: string; author_id: string; scope_summary: string; deliverables: string;
  exclusions: string; assumptions: string; next_steps: string; created_at: string;
};
type ScopeResponse = {
  id: string; review_id: string; user_id: string;
  kind: 'ready_to_discuss' | 'request_changes' | 'not_proceeding';
  note: string; created_at: string;
};
type ScopeDraft = {
  scope_summary: string; deliverables: string; exclusions: string;
  assumptions: string; next_steps: string;
};
const emptyDraft: ScopeDraft = {
  scope_summary: '', deliverables: '', exclusions: '', assumptions: '', next_steps: '',
};
const fields: readonly { name: keyof ScopeDraft; label: string; min: number; max: number; hint: string }[] = [
  { name: 'scope_summary', label: 'Proposed scope', min: 40, max: 2500, hint: 'What is being considered?' },
  { name: 'deliverables', label: 'Potential deliverables', min: 20, max: 2500, hint: 'Describe specific reviewable outputs' },
  { name: 'exclusions', label: 'Out of scope', min: 10, max: 1500, hint: 'Explicit exclusions, unapproved integrations and access' },
  { name: 'assumptions', label: 'Assumptions and dependencies', min: 10, max: 1500, hint: 'Conditions that must be verified before any agreement' },
  { name: 'next_steps', label: 'Next steps', min: 10, max: 1200, hint: 'What information or approval is required next?' },
];
const responseLabels: Record<ScopeResponse['kind'], string> = {
  ready_to_discuss: 'Interested in discussing',
  request_changes: 'Changes requested',
  not_proceeding: 'Not proceeding',
};

export default function ServiceScopeReview({
  requestId, ownerId, isAdmin = false,
}: { requestId: string; ownerId: string; isAdmin?: boolean }) {
  const currentUser = useAuthStore((state) => state.user);
  const [reviews, setReviews] = useState<ScopeReview[]>([]);
  const [responses, setResponses] = useState<ScopeResponse[]>([]);
  const [draft, setDraft] = useState<ScopeDraft>(emptyDraft);
  const [responseKind, setResponseKind] = useState<ScopeResponse['kind']>('request_changes');
  const [responseNote, setResponseNote] = useState('');
  const [activeReview, setActiveReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: reviewsError } = await supabase.from('service_scope_reviews')
      .select('id,author_id,scope_summary,deliverables,exclusions,assumptions,next_steps,created_at')
      .eq('request_id', requestId).order('created_at', { ascending: false }).limit(100);
    if (reviewsError) {
      console.error('Scope reviews query failed', reviewsError);
      setError('Scope review records are unavailable. Verify the database migration and try again.');
      setReviews([]);
      setResponses([]);
      setLoading(false);
      return;
    }
    const next = (data ?? []) as ScopeReview[];
    setReviews(next);
    if (next.length === 0) {
      setResponses([]);
    } else {
      const { data: notes, error: notesError } = await supabase.from('service_scope_responses')
        .select('id,review_id,user_id,kind,note,created_at')
        .in('review_id', next.map((item) => item.id))
        .order('created_at', { ascending: false }).limit(200);
      if (notesError) {
        setError('Scope reviews loaded, but customer feedback could not be retrieved.');
        setResponses([]);
      } else {
        setResponses((notes ?? []) as ScopeResponse[]);
      }
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (publishing || !isAdmin) return;
    for (const field of fields) {
      const length = draft[field.name].trim().length;
      if (length < field.min || length > field.max) {
        setError(field.label + ' must be ' + field.min + '–' + field.max + ' characters.');
        return;
      }
    }
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError ?? new Error('Not authenticated');
      const { data, error: publishError } = await supabase.from('service_scope_reviews').insert({
        request_id: requestId,
        author_id: user.id,
        ...Object.fromEntries(fields.map((field) => [field.name, draft[field.name].trim()])) as ScopeDraft,
      }).select('id').single();
      if (publishError || !data?.id) throw publishError ?? new Error('Scope review not persisted');
      setDraft(emptyDraft);
      setNotice('Scope review published and visible to the request owner. No contract or price has been issued.');
      await load();
    } catch (reason) {
      console.error('Scope review publication failed', reason);
      setError('Could not publish the review. No changes were confirmed.');
    } finally {
      setPublishing(false);
    }
  };

  const sendResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (replying || isAdmin || !activeReview) return;
    const text = responseNote.trim();
    if (text.length < 10 || text.length > 1200) { setError('Feedback must be between 10 and 1,200 characters.'); return; }
    setReplying(true);
    setError('');
    setNotice('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || user.id !== ownerId) throw authError ?? new Error('Owner authorization required');
      const { data, error: submitError } = await supabase.from('service_scope_responses').insert({
        review_id: activeReview, user_id: user.id, kind: responseKind, note: text,
      }).select('id').single();
      if (submitError || !data?.id) throw submitError ?? new Error('Feedback not confirmed');
      setResponseNote('');
      setActiveReview(null);
      setNotice('Your non-binding feedback is saved. It does not accept a contract or create a payment.');
      await load();
    } catch (reason) {
      console.error('Scope feedback insert failed', reason);
      setError('Could not save feedback. Verify your account and retry.');
    } finally {
      setReplying(false);
    }
  };

  return (
    <section aria-label="Project scope reviews" className="mt-5 rounded-2xl border border-border bg-card/40 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-lg font-semibold"><FileText className="h-5 w-5 text-primary" />Scope review memos</h3><p className="mt-1 text-sm text-muted-foreground">Published feasibility notes — never quotes, contracts, payment requests or authorization for testing.</p></div>
        <Button type="button" variant="outline" size="sm" disabled={loading || publishing || replying} onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </header>
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-primary/20 p-3 text-sm text-primary">{notice}</p>}
      {loading && reviews.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Loading scope reviews…</p>
        : reviews.length === 0 && !error ? <p className="mt-5 text-sm text-muted-foreground">No scope review has been published yet.</p>
        : <div className="mt-6 space-y-5">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-border bg-background/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-primary" />Published scope review</span>
                <time dateTime={review.created_at} className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleString()}</time>
              </div>
              {([
                ['Proposed scope', review.scope_summary],
                ['Potential deliverables', review.deliverables],
                ['Out of scope', review.exclusions],
                ['Assumptions', review.assumptions],
                ['Next steps', review.next_steps],
              ] as const).map(([label, value]) => (
                <div key={label} className="mt-4"><h4 className="text-sm font-semibold">{label}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{value}</p></div>
              ))}
              <p className="mt-4 rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">This review is informational. Expressing interest is not acceptance of a binding offer, and no work or billing begins here.</p>
              <div className="mt-5 space-y-3">
                {responses.filter((r) => r.review_id === review.id).map((r) => (
                  <div key={r.id} className="rounded-lg border border-primary/10 bg-primary/[0.03] p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold">{responseLabels[r.kind]}</span><time dateTime={r.created_at} className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</time></div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{r.note}</p>
                  </div>
                ))}
              </div>
              {!isAdmin && currentUser?.id === ownerId && (
                <div className="mt-4">
                  <Button variant="outline" type="button" aria-expanded={activeReview === review.id} onClick={() => setActiveReview((id) => id === review.id ? null : review.id)}>
                    <MessageSquareText className="mr-2 h-4 w-4" />{activeReview === review.id ? 'Close feedback' : 'Give feedback'}
                  </Button>
                  {activeReview === review.id && (
                    <form onSubmit={(e) => void sendResponse(e)} className="mt-4 space-y-3">
                      <label htmlFor={'scope-response-kind-' + review.id} className="block text-sm font-semibold">Non-binding response</label>
                      <select id={'scope-response-kind-' + review.id} value={responseKind} onChange={(e) => setResponseKind(e.target.value as ScopeResponse['kind'])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        {Object.entries(responseLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
                      </select>
                      <label htmlFor={'scope-response-note-' + review.id} className="block text-sm font-semibold">Your feedback</label>
                      <Textarea id={'scope-response-note-' + review.id} rows={4} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} minLength={10} maxLength={1200} required placeholder="Explain changes needed, questions, or interest in discussing next steps." />
                      <Button type="submit" disabled={replying || responseNote.trim().length < 10}><Send className="mr-2 h-4 w-4" />{replying ? 'Saving…' : 'Save feedback'}</Button>
                    </form>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>}
      {isAdmin && (
        <form onSubmit={(e) => void publish(e)} className="mt-6 space-y-4 border-t border-border pt-5">
          <h4 className="text-base font-semibold">Publish a new immutable scope review</h4>
          <p className="text-sm text-muted-foreground">Publishing makes the complete memo immediately visible to the customer. Corrections require a new review; no draft overwrites history.</p>
          {fields.map((field) => (
            <div key={field.name}>
              <label className="mb-2 block text-sm font-semibold" htmlFor={'scope-field-' + field.name + '-' + requestId}>{field.label} *</label>
              <Textarea id={'scope-field-' + field.name + '-' + requestId} rows={3} required minLength={field.min} maxLength={field.max} value={draft[field.name]} disabled={publishing} onChange={(e) => setDraft((curr) => ({ ...curr, [field.name]: e.target.value }))} placeholder={field.hint} />
              <p className="mt-1 text-right text-xs text-muted-foreground">{draft[field.name].length}/{field.max}</p>
            </div>
          ))}
          <Button type="submit" disabled={publishing}><Send className="mr-2 h-4 w-4" />{publishing ? 'Publishing…' : 'Publish scope review'}</Button>
        </form>
      )}
    </section>
  );
}
