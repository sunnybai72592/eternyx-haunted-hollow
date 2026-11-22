import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardList, MessageSquareText, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ClarificationQuestion = {
  id: string; request_id: string; author_id: string; prompt: string;
  state: 'open' | 'closed'; created_at: string;
  closed_at: string | null; closed_by: string | null;
};
type ClarificationAnswer = {
  id: string; question_id: string; author_id: string; answer: string; created_at: string;
};
type Props = {
  requestId: string; ownerId: string; isAdmin?: boolean; onChanged?: () => void;
};
const PAGE_SIZE = 20;

export default function ServiceClarifications({ requestId, ownerId, isAdmin = false, onChanged }: Props) {
  const user = useAuthStore((state) => state.user);
  const viewerId = user?.id ?? null;
  const viewerKey = requestId + ':' + (viewerId ?? 'signed-out') + ':' + (isAdmin ? 'admin' : 'owner');
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const generation = useRef(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visibleQuestions = loadedKey === viewerKey && viewerId ? questions : [];
  const visibleAnswers = loadedKey === viewerKey && viewerId ? answers : [];
  const visibleTotal = loadedKey === viewerKey && viewerId ? total : 0;

  const load = useCallback(async () => {
    const seq = ++generation.current;
    if (!viewerId) {
      setLoadedKey(null);
      setQuestions([]);
      setAnswers([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: questionError, count } = await supabase
      .from('service_clarification_questions')
      .select('id,request_id,author_id,prompt,state,created_at,closed_at,closed_by', { count: 'exact' })
      .eq('request_id', requestId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(limit);
    if (seq !== generation.current) return;
    if (questionError) {
      console.error('Service clarification question query failed', questionError);
      setQuestions([]);
      setAnswers([]);
      setTotal(0);
      setLoadedKey(null);
      setError('Could not load clarification questions. Verify account access and that the database migration is active.');
      setLoading(false);
      return;
    }
    const nextQuestions = (data ?? []) as ClarificationQuestion[];
    let nextAnswers: ClarificationAnswer[] = [];
    if (nextQuestions.length) {
      const { data: answerData, error: answerError } = await supabase
        .from('service_clarification_answers')
        .select('id,question_id,author_id,answer,created_at')
        .in('question_id', nextQuestions.map((q) => q.id));
      if (seq !== generation.current) return;
      if (answerError) {
        console.error('Service clarification answer query failed', answerError);
        setQuestions([]);
        setAnswers([]);
        setTotal(0);
        setLoadedKey(null);
        setError('Questions are available, but answers could not be loaded. Refresh before responding.');
        setLoading(false);
        return;
      }
      nextAnswers = (answerData ?? []) as ClarificationAnswer[];
    }
    setQuestions(nextQuestions);
    setAnswers(nextAnswers);
    setTotal(count ?? 0);
    setLoadedKey(viewerKey);
    setLoading(false);
  }, [requestId, viewerId, viewerKey, limit]);

  useEffect(() => {
    generation.current += 1;
    setLoadedKey(null);
    setQuestions([]);
    setAnswers([]);
    setTotal(0);
    setLimit(PAGE_SIZE);
    setQuestionDraft('');
    setAnswerDrafts({});
    setError('');
    setNotice('');
  }, [viewerKey]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const verifyActor = async (requiredAdmin: boolean): Promise<string> => {
    const { data: { user: verified }, error: authError } = await supabase.auth.getUser();
    if (authError || !verified || verified.id !== viewerId || viewerKeyRef.current !== viewerKey) {
      throw authError ?? new Error('Session changed. Sign in again.');
    }
    if (requiredAdmin) {
      const { data: allowed, error: adminError } = await supabase.rpc('is_admin');
      if (adminError || allowed !== true) throw adminError ?? new Error('Administrator permission required');
    } else if (verified.id !== ownerId) {
      throw new Error('Only the request owner may answer.');
    }
    if (viewerKeyRef.current !== viewerKey) throw new Error('Session changed.');
    return verified.id;
  };

  const createQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || busy || loadedKey !== viewerKey) return;
    const prompt = questionDraft.trim();
    if (prompt.length < 15 || prompt.length > 1500) {
      setError('A question must contain 15–1,500 characters.');
      return;
    }
    setBusy('create');
    setError('');
    setNotice('');
    try {
      const actorId = await verifyActor(true);
      const { data, error: insertError } = await supabase.from('service_clarification_questions')
        .insert({ request_id: requestId, author_id: actorId, prompt })
        .select('id').single();
      if (insertError || !data?.id) throw insertError ?? new Error('Question not confirmed.');
      if (viewerKeyRef.current !== viewerKey) return;
      setQuestionDraft('');
      setNotice('Clarification question saved and visible to this request owner. No deadline or contract was created.');
      await load();
      onChanged?.();
    } catch (reason) {
      console.error('Service clarification question insert failed', reason);
      if (viewerKeyRef.current === viewerKey) setError('Question not saved. Verify your administrator session and retry.');
    } finally {
      setBusy(null);
    }
  };

  const sendAnswer = async (questionId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAdmin || busy || loadedKey !== viewerKey) return;
    const answer = (answerDrafts[questionId] ?? '').trim();
    if (answer.length < 10 || answer.length > 2500) {
      setError('An answer must contain 10–2,500 characters.');
      return;
    }
    const question = visibleQuestions.find((item) => item.id === questionId);
    if (!question || question.state !== 'open' || visibleAnswers.some((item) => item.question_id === questionId)) return;
    setBusy(questionId);
    setError('');
    setNotice('');
    try {
      const actorId = await verifyActor(false);
      const { data, error: insertError } = await supabase.from('service_clarification_answers')
        .insert({ question_id: questionId, author_id: actorId, answer })
        .select('id').single();
      if (insertError || !data?.id) throw insertError ?? new Error('Answer not confirmed.');
      if (viewerKeyRef.current !== viewerKey) return;
      setAnswerDrafts((drafts) => ({ ...drafts, [questionId]: '' }));
      setNotice('Your clarification answer was saved. The administrator can now review it.');
      await load();
      onChanged?.();
    } catch (reason) {
      console.error('Service clarification answer insert failed', reason);
      if (viewerKeyRef.current === viewerKey) setError('Answer not saved. Only one answer is allowed per question; refresh to check if it was already recorded.');
    } finally {
      setBusy(null);
    }
  };

  const closeQuestion = async (questionId: string) => {
    if (!isAdmin || busy || loadedKey !== viewerKey) return;
    const question = visibleQuestions.find((item) => item.id === questionId);
    if (!question || question.state !== 'open') return;
    setBusy(questionId);
    setError('');
    setNotice('');
    try {
      await verifyActor(true);
      const { data, error: updateError } = await supabase.from('service_clarification_questions')
        .update({ state: 'closed' })
        .eq('id', questionId).eq('request_id', requestId).eq('state', 'open')
        .select('id').maybeSingle();
      if (updateError || !data?.id) throw updateError ?? new Error('Question changed in another session.');
      if (viewerKeyRef.current !== viewerKey) return;
      setNotice('Question closed. This is an internal clarification state, not a contractual approval.');
      await load();
      onChanged?.();
    } catch (reason) {
      console.error('Service clarification closure failed', reason);
      if (viewerKeyRef.current === viewerKey) setError('Question not closed. Refresh to confirm it is still open and that administrator access is valid.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Service clarification workspace" className="mt-5 rounded-2xl border border-border bg-background/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />Clarification questions
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? 'Ask what is missing, review a customer reply, and close each item explicitly.' : 'Answer questions about your request. One saved answer per question; later clarification can use a new question or the conversation.'}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading || busy !== null} onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
      {!viewerId ? <p className="mt-4 text-sm text-muted-foreground">Sign in to view your request clarifications.</p>
        : loading || loadedKey !== viewerKey ? <p className="mt-4 text-sm text-muted-foreground">Loading private clarifications…</p>
          : <div className="mt-4 space-y-4">
            {visibleQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No clarification questions have been recorded for this request.</p>
              : visibleQuestions.map((question) => {
                const reply = visibleAnswers.find((answer) => answer.question_id === question.id);
                return (
                  <article key={question.id} className="rounded-xl border border-border/80 bg-card/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">
                        {question.state === 'closed' ? 'Closed' : reply ? 'Answer submitted · awaiting administrator review' : 'Awaiting customer answer'}
                      </span>
                      <time className="text-xs text-muted-foreground" dateTime={question.created_at}>{new Date(question.created_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium">{question.prompt}</p>
                    {reply && <div className="mt-3 rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
                      <p className="text-xs font-semibold text-primary">Customer answer · {new Date(reply.created_at).toLocaleString()}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{reply.answer}</p>
                    </div>}
                    {!isAdmin && question.state === 'open' && !reply && (
                      <form className="mt-3 space-y-2" onSubmit={(event) => void sendAnswer(question.id, event)}>
                        <label htmlFor={'clarification-answer-' + question.id} className="block text-xs font-semibold">Your answer (saved once)</label>
                        <Textarea
                          id={'clarification-answer-' + question.id} rows={3} maxLength={2500} minLength={10} required
                          value={answerDrafts[question.id] ?? ''}
                          onChange={(event) => setAnswerDrafts((drafts) => ({ ...drafts, [question.id]: event.target.value }))}
                          disabled={busy !== null}
                          placeholder="Provide the requested details. Avoid passwords, tokens or highly sensitive records."
                        />
                        <Button size="sm" type="submit" disabled={busy !== null || (answerDrafts[question.id] ?? '').trim().length < 10}>
                          <Send className="mr-2 h-4 w-4" />{busy === question.id ? 'Saving…' : 'Submit answer'}
                        </Button>
                      </form>
                    )}
                    {isAdmin && question.state === 'open' && <Button className="mt-3" type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void closeQuestion(question.id)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />{busy === question.id ? 'Saving…' : 'Close clarification'}
                    </Button>}
                    {question.state === 'closed' && question.closed_at && <p className="mt-2 text-xs text-muted-foreground">Closed {new Date(question.closed_at).toLocaleString()} · No contractual acceptance implied.</p>}
                  </article>
                );
              })}
            {visibleQuestions.length < visibleTotal && <Button type="button" variant="outline" size="sm" disabled={loading || busy !== null} onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Load older questions ({visibleTotal - visibleQuestions.length} remaining)
            </Button>}
            <p className="text-xs text-muted-foreground">{visibleQuestions.length} of {visibleTotal} saved questions loaded. This workspace does not issue prices, SLAs or binding approvals.</p>
          </div>}
      {isAdmin && viewerId && loadedKey === viewerKey && <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={(event) => void createQuestion(event)}>
        <label htmlFor={'clarification-question-' + requestId} className="block text-sm font-semibold">Ask for missing information</label>
        <Textarea
          id={'clarification-question-' + requestId} rows={3} maxLength={1500} minLength={15} required
          value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)}
          disabled={busy !== null} placeholder="Which specific requirement needs clarification? No delivery promises or access requests."
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{questionDraft.length}/1,500 · Visible only to this request's customer and administrators</p>
          <Button type="submit" disabled={busy !== null || questionDraft.trim().length < 15}>
            <MessageSquareText className="mr-2 h-4 w-4" />{busy === 'create' ? 'Saving…' : 'Publish question'}
          </Button>
        </div>
      </form>}
    </section>
  );
}
