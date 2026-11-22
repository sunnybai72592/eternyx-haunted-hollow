import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { answeredExamCount, examClock, examDeadline, examSecondsRemaining, validExamId } from "@/lib/educationExam.mjs";
import { createEducationAnswerSaveQueue } from "@/lib/educationAnswerSaveQueue.mjs";
import { atomicCbtEnabled, startCbtAttempt, saveCbtAnswer, submitCbtAttempt } from "@/lib/educationCbtRpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ExamQuestion = { id: string; question_text: string; question_type: string; points: number; order_index: number };
type ExamOption = { id: string; option_text: string };
type Exam = { id: string; title: string; duration_minutes: number; is_active: boolean; questions: ExamQuestion[] };
type Attempt = { id: string; start_time: string; status: string };
type Answer = { questionId: string; selectedOptionId?: string; shortAnswer?: string };

export default function TestInterface() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const validTestId = validExamId(testId);
  const enabled = !authLoading && isAuthenticated && !!user?.id && validTestId;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, Answer>>(() => new Map());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const submittingRef = useRef(false);
  const expirySubmitRequested = useRef(false);
  const submitRef = useRef<(expired: boolean) => Promise<void>>(async () => {});
  const [visibilityNotice, setVisibilityNotice] = useState(false);
  const answerSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<ReturnType<typeof createEducationAnswerSaveQueue> | null>(null);
  const saveQueueScopeRef = useRef<string | null>(null);
  const restoredAttemptRef = useRef<string | null>(null);
  const [answerSaveStatus, setAnswerSaveStatus] = useState<"idle" | "saving" | "saved" | "unsaved">("idle");
  const [answerSaveFailed, setAnswerSaveFailed] = useState(false);

  const testQuery = useQuery<Exam>({
    queryKey: ["education-exam", user?.id, testId],
    enabled,
    retry: 1,
    queryFn: async () => {
      const { data: test, error } = await supabase.from("tests")
        .select("id,title,duration_minutes,is_active").eq("id", testId!).eq("is_active", true).single();
      if (error) throw error;
      const { data: questions, error: questionError } = await supabase.from("questions")
        .select("id,question_text,question_type,points,order_index")
        .eq("test_id", testId!).order("order_index", { ascending: true });
      if (questionError) throw questionError;
      return { ...test, questions: questions ?? [] } as Exam;
    },
  });

  // Attempt start_time comes from the database; refreshing does not restart the clock.
  const attemptQuery = useQuery<Attempt>({
    queryKey: ["education-active-exam-attempt", user?.id, testId],
    enabled: enabled && !!testQuery.data && testQuery.data.questions.length > 0,
    retry: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (atomicCbtEnabled) {
        return await startCbtAttempt(testId!);
      }
      const { data: previous, error: findError } = await supabase.from("user_attempts")
        .select("id,start_time,status").eq("user_id", user!.id).eq("test_id", testId!)
        .eq("status", "in_progress").maybeSingle();
      if (findError) throw findError;
      if (previous) return previous as Attempt;
      const { data: created, error: createError } = await supabase.from("user_attempts")
        .insert({ user_id: user!.id, test_id: testId!, status: "in_progress" })
        .select("id,start_time,status").single();
      if (createError) throw createError;
      return created as Attempt;
    },
  });

  const restoredAnswersQuery = useQuery<Answer[]>({
    queryKey: ["education-saved-answers", user?.id, attemptQuery.data?.id],
    enabled: atomicCbtEnabled && enabled && !!attemptQuery.data?.id,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_answers")
        .select("question_id,selected_option_id,short_answer_text")
        .eq("attempt_id", attemptQuery.data!.id);
      if (error) throw error;
      return (data ?? []).flatMap(row => row.question_id ? [{
        questionId: row.question_id,
        selectedOptionId: row.selected_option_id || undefined,
        shortAnswer: row.short_answer_text || undefined,
      }] : []);
    },
  });

  // A save queue belongs to exactly ONE account and ONE exam attempt.
  // Never carry unsaved response text into another account or attempt.
  useEffect(() => {
    const scope = atomicCbtEnabled && enabled && attemptQuery.data?.id
      ? user?.id + ":" + attemptQuery.data.id : null;
    if (saveQueueScopeRef.current === scope) return;
    if (answerSaveTimerRef.current) clearTimeout(answerSaveTimerRef.current);
    answerSaveTimerRef.current = null;
    saveQueueRef.current?.dispose();
    saveQueueScopeRef.current = scope;
    saveQueueRef.current = scope && attemptQuery.data?.id
      ? createEducationAnswerSaveQueue((answer: Answer) => saveCbtAnswer(attemptQuery.data!.id, answer))
      : null;
    restoredAttemptRef.current = null;
    setAnswers(new Map());
    setAnswerSaveStatus("idle");
    setAnswerSaveFailed(false);
  }, [enabled, user?.id, attemptQuery.data?.id]);

  useEffect(() => {
    const scope = user?.id + ":" + attemptQuery.data?.id;
    if (!atomicCbtEnabled || !attemptQuery.data?.id || !restoredAnswersQuery.data ||
        restoredAttemptRef.current === scope || saveQueueScopeRef.current !== scope) return;
    restoredAttemptRef.current = scope;
    setAnswers(new Map(restoredAnswersQuery.data.map(answer => [answer.questionId, answer])));
  }, [user?.id, attemptQuery.data?.id, restoredAnswersQuery.data]);

  const question = testQuery.data?.questions[questionIndex];
  const optionsQuery = useQuery<ExamOption[]>({
    queryKey: ["education-question-options", user?.id, question?.id],
    enabled: enabled && !!attemptQuery.data && !!question &&
      ["multiple_choice", "true_false"].includes(question.question_type),
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("options").select("id,option_text")
        .eq("question_id", question!.id).order("id", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // All browser writes are serialized; a newer in-flight edit is always
  // persisted after an older request. Failed latest text remains retryable.
  const flushPendingAnswers = useCallback(async () => {
    if (!atomicCbtEnabled || !attemptQuery.data?.id) return;
    if (answerSaveTimerRef.current) clearTimeout(answerSaveTimerRef.current);
    answerSaveTimerRef.current = null;
    const queue = saveQueueRef.current;
    const scope = user?.id + ":" + attemptQuery.data.id;
    if (!queue || saveQueueScopeRef.current !== scope || !queue.hasUnsaved()) return;
    setAnswerSaveStatus("saving");
    try {
      await queue.flush();
      if (saveQueueScopeRef.current === scope && saveQueueRef.current === queue) {
        setAnswerSaveStatus("saved");
        setAnswerSaveFailed(false);
      }
    } catch (error) {
      if (saveQueueScopeRef.current === scope && saveQueueRef.current === queue) {
        setAnswerSaveStatus("unsaved");
        setAnswerSaveFailed(true);
      }
      throw error;
    }
  }, [attemptQuery.data?.id, user?.id]);

  useEffect(() => () => {
    if (answerSaveTimerRef.current) clearTimeout(answerSaveTimerRef.current);
    saveQueueRef.current?.dispose();
  }, []);

  const deadline = examDeadline(attemptQuery.data?.start_time, testQuery.data?.duration_minutes);
  const expired = remaining === 0;
  const canEdit = !!attemptQuery.data && !submitting && !expired &&
    (!atomicCbtEnabled || (restoredAnswersQuery.isSuccess &&
      !!saveQueueRef.current && saveQueueScopeRef.current === user?.id + ":" + attemptQuery.data.id));
  const submitExam = useCallback(async (dueToExpiry: boolean) => {
    if (submittingRef.current || !attemptQuery.data || !testQuery.data || !user) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmSubmit(false);
    setNotice("");
    try {
      const attemptId = attemptQuery.data.id;
      if (atomicCbtEnabled) {
        try {
          await flushPendingAnswers();
        } catch (error) {
          // Past-deadline writes are denied by the server. Finalize the attempt
          // regardless; stale local text must never bypass the deadline.
          if (!dueToExpiry) throw error;
        }
        const result = await submitCbtAttempt(attemptId);
        if (!["submitted", "auto_submitted"].includes(result.status)) {
          throw new Error("The server did not confirm assessment submission.");
        }
        await queryClient.invalidateQueries({ queryKey: ["education-owned-attempt-list", user.id] });
        toast.success("Assessment submission recorded.");
        navigate("/test-results/" + attemptId, { replace: true });
        return;
      }

      // Legacy path is retained only while the coordinated server rollout is
      // disabled; it is not an atomic or production-secure submission workflow.
      // This path must be enforced by an atomic server-side submission service
      // before any high-stakes deployment.
      for (const answer of answers.values()) {
        const { error } = await supabase.from("user_answers").upsert({
          attempt_id: attemptId,
          question_id: answer.questionId,
          selected_option_id: answer.selectedOptionId || null,
          short_answer_text: answer.shortAnswer || null,
        }, { onConflict: "attempt_id,question_id" });
        if (error) throw error;
      }
      const { data, error } = await supabase.from("user_attempts").update({
        status: dueToExpiry ? "auto_submitted" : "submitted",
        end_time: new Date().toISOString(),
      }).eq("id", attemptId).eq("user_id", user.id).eq("status", "in_progress")
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The attempt was not updated. Please check its server status.");
      await queryClient.invalidateQueries({ queryKey: ["education-owned-attempt-list", user.id] });
      toast.success("Assessment submission recorded.");
      navigate("/test-results/" + attemptId, { replace: true });
    } catch {
      setNotice("The assessment could not be submitted. Your answers are still in this tab. Check your connection and retry; server deadline enforcement must be verified.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [attemptQuery.data, testQuery.data, user, answers, navigate, flushPendingAnswers, queryClient]);
  submitRef.current = submitExam;

  useEffect(() => {
    if (deadline === null || !attemptQuery.data) return;
    expirySubmitRequested.current = false;
    const tick = () => {
      const left = examSecondsRemaining(deadline);
      setRemaining(left);
      if (left === 0 && !expirySubmitRequested.current && !submittingRef.current) {
        expirySubmitRequested.current = true;
        void submitRef.current(true);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, attemptQuery.data?.id]);

  useEffect(() => {
    const change = () => {
      if (document.hidden) setVisibilityNotice(true);
      // Recalculate from the fixed deadline when the tab becomes visible.
      if (!document.hidden && deadline !== null) setRemaining(examSecondsRemaining(deadline));
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [deadline]);

  // Regain connectivity: retry only while the server-side deadline is open.
  // Never use an online event to extend an expired exam.
  useEffect(() => {
    const reconnect = () => {
      if (!atomicCbtEnabled || !attemptQuery.data?.id ||
          !saveQueueRef.current?.hasUnsaved() ||
          (deadline !== null && Date.now() >= deadline)) return;
      void flushPendingAnswers().catch(() => {});
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [attemptQuery.data?.id, deadline, flushPendingAnswers]);

  const updateAnswer = (value: string) => {
    if (!question || !canEdit) return;
    const nextAnswer: Answer = question.question_type === "short_answer"
      ? { questionId: question.id, shortAnswer: value }
      : { questionId: question.id, selectedOptionId: value };
    setAnswers(previous => new Map(previous).set(question.id, nextAnswer));
    if (atomicCbtEnabled) {
      if (!saveQueueRef.current) return;
      saveQueueRef.current.enqueue(nextAnswer);
      setAnswerSaveStatus("unsaved");
      setAnswerSaveFailed(false);
      if (answerSaveTimerRef.current) clearTimeout(answerSaveTimerRef.current);
      answerSaveTimerRef.current = setTimeout(() => {
        void flushPendingAnswers().catch(() => {
          // The queue retains the latest answer; retry and status stay visible.
        });
      }, question.question_type === "short_answer" ? 700 : 150);
    }
  };

  if (authLoading || (enabled && (testQuery.isPending ||
      (!!testQuery.data?.questions.length && attemptQuery.isPending) ||
      (atomicCbtEnabled && !!attemptQuery.data && restoredAnswersQuery.isPending)))) {
    return <p role="status" className="mx-auto max-w-2xl p-8">Preparing your assessment…</p>;
  }
  if (!isAuthenticated) {
    return <div className="mx-auto max-w-xl p-8">Sign in to take an assessment. <Link className="text-primary underline" to="/auth?redirect=%2Feducation">Sign in</Link></div>;
  }
  if (!validTestId) return <p role="alert" className="p-8">Invalid assessment ID.</p>;
  if (testQuery.error || attemptQuery.error || (atomicCbtEnabled && restoredAnswersQuery.error)) {
    return <div role="alert" className="mx-auto max-w-xl space-y-4 p-8">
      <p>Assessment or attempt could not be loaded. It may be unavailable or your account may lack access.</p>
      <Button variant="outline" asChild><Link to="/education">Back to Education</Link></Button>
    </div>;
  }
  const exam = testQuery.data;
  if (!exam || !exam.questions.length || !question || !attemptQuery.data) {
    return <div className="mx-auto max-w-xl space-y-4 p-8">
      <p role="status">This assessment has no available questions or attempt. It cannot be started yet.</p>
      <Button variant="outline" asChild><Link to="/education">Back to Education</Link></Button>
    </div>;
  }
  const count = exam.questions.length;
  const answered = answeredExamCount(answers);
  const progress = answered / count * 100;
  const selected = answers.get(question.id);

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground">
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{exam.title}</h1>
        <div role="timer" aria-label="Time remaining" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 font-mono">
          <Clock3 aria-hidden="true" className="h-4 w-4" />{remaining === null ? "Loading…" : examClock(remaining)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The clock follows the stored attempt start time. Final deadlines and grading require server-side enforcement.</p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm"><span>Question {questionIndex + 1} of {count}</span><span>{answered} answered</span></div>
        <Progress value={progress} aria-label="Questions answered" />
      </div>
      {visibilityNotice && <Alert><AlertTriangle aria-hidden="true" className="h-4 w-4" />
        <AlertDescription>Tab visibility changed during this attempt. This alone is not proof of a screen lock or misconduct.</AlertDescription></Alert>}
      {notice && <Alert variant="destructive"><AlertTriangle aria-hidden="true" className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
      {atomicCbtEnabled && restoredAnswersQuery.isSuccess && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className={answerSaveFailed ? "text-destructive" : "text-muted-foreground"}>
            {answerSaveStatus === "saving" ? "Saving answers to your exam…" :
              answerSaveFailed ? "Unsaved answers: the server did not confirm your latest changes." :
              answerSaveStatus === "unsaved" ? "Changes waiting to be saved…" :
              answerSaveStatus === "saved" ? "All latest answers saved to the server." :
              "Answers are saved automatically as you work."}
          </span>
          {answerSaveFailed && (
            <Button size="sm" variant="outline" disabled={submitting || expired}
              onClick={() => void flushPendingAnswers().catch(() => {})}>
              Retry saving
            </Button>
          )}
        </div>
      )}
      {expired && <Alert><AlertTriangle aria-hidden="true" className="h-4 w-4" /><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Time has elapsed. Submit to confirm the server recorded your attempt; late answer edits cannot be accepted.</span>
        <Button size="sm" variant="outline" disabled={submitting}
          onClick={() => void submitExam(true)}>Retry submission</Button>
      </AlertDescription></Alert>}
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-xl">{question.question_text}</CardTitle>
          <CardDescription>{question.points} points · {question.question_type.replace(/_/g, " ")}</CardDescription></CardHeader>
        <CardContent>
          {["multiple_choice", "true_false"].includes(question.question_type) ? (
            optionsQuery.isPending ? <p role="status">Loading choices…</p> :
            optionsQuery.error ? <p role="alert">Choices could not be loaded.</p> :
            !optionsQuery.data?.length ? <p role="alert">No options are configured for this question.</p> :
            <RadioGroup disabled={!canEdit} value={selected?.selectedOptionId || ""} onValueChange={updateAnswer}>
              {optionsQuery.data.map(option => <div key={option.id} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem id={"exam-option-" + option.id} value={option.id} />
                <Label htmlFor={"exam-option-" + option.id} className="cursor-pointer break-words">{option.option_text}</Label>
              </div>)}
            </RadioGroup>
          ) : question.question_type === "short_answer" ? (
            <Textarea aria-label="Your short answer" disabled={!canEdit} maxLength={5000}
              value={selected?.shortAnswer || ""} onChange={event => updateAnswer(event.target.value)} className="min-h-32" />
          ) : <p role="alert">This question type is not supported in the assessment interface.</p>}
        </CardContent>
      </Card>
      <nav aria-label="Exam question navigation" className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled={questionIndex === 0 || submitting} onClick={() => setQuestionIndex(i => Math.max(0, i - 1))}>Previous</Button>
        <Button variant="destructive" disabled={submitting} onClick={() => setConfirmSubmit(true)}><LogOut aria-hidden="true" className="mr-2 h-4 w-4" />Submit assessment</Button>
        <Button disabled={questionIndex === count - 1 || submitting} onClick={() => setQuestionIndex(i => Math.min(count - 1, i + 1))}>Next</Button>
      </nav>
      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Submit this assessment?</AlertDialogTitle>
            <AlertDialogDescription>{answered} of {count} questions answered. Your answers cannot be changed after a confirmed submission.</AlertDialogDescription></AlertDialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel disabled={submitting}>Continue assessment</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={() => void submitExam(expired)}>Confirm submission</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </main>;
}
