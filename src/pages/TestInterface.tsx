import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bookmark, Clock3, ListChecks, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { examClock, examDeadline, examSecondsRemaining, validExamId } from "@/lib/educationExam.mjs";
import { createEducationAnswerSaveQueue } from "@/lib/educationAnswerSaveQueue.mjs";
import {
 educationDeadlineSafety, educationSubmissionReadScope,
 educationSubmissionRecoveryMessage, verifyEducationOwnedSubmission,
} from "@/lib/educationSubmissionRecovery.mjs";
import {
  createEducationExamAnswer, educationChoiceSelectionStatus,
  projectEducationExamReviewAnswers, restoreEducationExamAnswers,
  validateEducationExamDetails, validateEducationExamOptions,
} from "@/lib/educationExamResponseIntegrity.mjs";
import {
  createEducationExamReview, educationReviewSummaryMessage,
  nextEducationReviewIndex, toggleEducationReviewFlag,
} from "@/lib/educationExamReview.mjs";
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
  const [reviewPanelOpen, setReviewPanelOpen] = useState(true);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(() => new Set());
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
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [statusCheckBusy, setStatusCheckBusy] = useState(false);
  const statusCheckRef = useRef(false);
  const submissionGenerationRef = useRef(0);

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
      // Validate server-returned exam metadata BEFORE startCbtAttempt runs:
      // malformed/duplicated questions must never open an attempt timer.
      return validateEducationExamDetails(test, questions ?? [], testId!) as Exam;
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
      return restoreEducationExamAnswers(data ?? [], testQuery.data?.questions ?? []) as Answer[];
    },
  });

  // A save queue belongs to exactly ONE account and ONE exam attempt.
  // Clear private answer text and review flags before a new user paints.
  useLayoutEffect(() => {
    const scope = enabled && attemptQuery.data?.id
      ? user?.id + ":" + attemptQuery.data.id : null;
    if (saveQueueScopeRef.current === scope) return;
    if (answerSaveTimerRef.current) clearTimeout(answerSaveTimerRef.current);
    answerSaveTimerRef.current = null;
    saveQueueRef.current?.dispose();
    submissionGenerationRef.current += 1;
    statusCheckRef.current = false;
    submittingRef.current = false;
    saveQueueScopeRef.current = scope;
    saveQueueRef.current = atomicCbtEnabled && scope && attemptQuery.data?.id
      ? createEducationAnswerSaveQueue((answer: Answer) => saveCbtAnswer(attemptQuery.data!.id, answer))
      : null;
    restoredAttemptRef.current = null;
    setAnswers(new Map());
    setFlaggedQuestions(new Set());
    setQuestionIndex(0);
    setConfirmSubmit(false);
    setAnswerSaveStatus("idle");
    setAnswerSaveFailed(false);
    setSubmissionUncertain(false);
    setStatusCheckBusy(false);
    setNotice("");
    setRemaining(null);
    expirySubmitRequested.current = false;
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
    queryKey: ["education-question-options", user?.id, attemptQuery.data?.id, question?.id],
    enabled: enabled && attemptQuery.data?.status === "in_progress" && !!question &&
      ["multiple_choice", "true_false"].includes(question.question_type),
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("options").select("id,option_text")
        .eq("question_id", question!.id).order("id", { ascending: true });
      if (error) throw error;
      return validateEducationExamOptions(data ?? [], question!) as ExamOption[];
    },
  });

  const choiceStatus = educationChoiceSelectionStatus(
    question ? answers.get(question.id) : null,
    optionsQuery.isSuccess ? optionsQuery.data : null,
  );
  // This is only a UI projection. Do NOT mutate, clear or overwrite the
  // raw saved response merely because a question's old choice disappeared.
  const reviewedAnswers = useMemo(() =>
    projectEducationExamReviewAnswers(
      answers, question, optionsQuery.isSuccess ? optionsQuery.data : null,
    ), [answers, question, optionsQuery.isSuccess, optionsQuery.data]);
  const review = useMemo(() => createEducationExamReview(
    testQuery.data?.questions ?? [], reviewedAnswers, flaggedQuestions,
  ), [testQuery.data?.questions, reviewedAnswers, flaggedQuestions]);
  const jumpToReviewQuestion = (index: number) => {
    if (submitting || !testQuery.data?.questions[index]) return;
    setQuestionIndex(index);
    setConfirmSubmit(false);
  };
  const jumpToNextReview = (mode: "unanswered" | "flagged") => {
    const target = nextEducationReviewIndex(review.entries, questionIndex, mode);
    if (target !== -1) jumpToReviewQuestion(target);
  };
  const toggleCurrentFlag = () => {
    if (!question || submitting || attemptQuery.data?.status !== "in_progress") return;
    setFlaggedQuestions(previous => toggleEducationReviewFlag(
      previous, question.id, testQuery.data?.questions ?? []));
  };

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
  // Fail closed on a missing/invalid start time; never grant extra exam time.
  const deadlineSafety = educationDeadlineSafety(attemptQuery.data?.status, deadline);
  const expired = deadlineSafety.expired;
  const canEdit = attemptQuery.data?.status === "in_progress" && !submitting &&
    !statusCheckBusy && deadlineSafety.editAllowed &&
    (!atomicCbtEnabled || (restoredAnswersQuery.isSuccess &&
      !!saveQueueRef.current && saveQueueScopeRef.current === user?.id + ":" + attemptQuery.data.id));

  const readOwnedSubmissionStatus = useCallback(async (
    attemptId: string, ownerId: string, expectedTestId: string,
  ) => {
    const scope = educationSubmissionReadScope(attemptId, ownerId, expectedTestId);
    // READ the existing attempt: never invoke start_cbt_attempt to verify.
    const {data, error} = await supabase.from("user_attempts")
      .select("id,user_id,test_id,status,start_time,end_time")
      .eq("id",scope.attemptId).eq("user_id",scope.ownerId)
      .eq("test_id",scope.testId).maybeSingle();
    if(error || !data)throw new Error("The attempt could not be verified.");
    return verifyEducationOwnedSubmission(data,attemptId,ownerId,expectedTestId);
  }, []);

  const checkSubmissionStatus = useCallback(async () => {
    if(statusCheckRef.current || submittingRef.current || !user?.id ||
       !attemptQuery.data?.id || !validExamId(testId))return;
    const generation=submissionGenerationRef.current;
    statusCheckRef.current=true;
    setStatusCheckBusy(true);
    setNotice("");
    try{
      const receipt=await readOwnedSubmissionStatus(attemptQuery.data.id,user.id,testId!);
      if(generation!==submissionGenerationRef.current)return;
      if(receipt.confirmed){
        setSubmissionUncertain(false);
        void queryClient.invalidateQueries({queryKey:["education-owned-attempt-list",user.id]});
        toast.success(receipt.flagged
          ?"Server confirms a flagged, submitted attempt."
          :"Server confirms your assessment was submitted.");
        navigate("/test-results/"+receipt.id,{replace:true});
      }else{
        setSubmissionUncertain(true);
        setNotice(educationSubmissionRecoveryMessage(receipt,deadline));
      }
    }catch{
      if(generation===submissionGenerationRef.current){
        setSubmissionUncertain(true);
        setNotice("The server could not verify submission status. Nothing has been confirmed. Check your connection and retry this status check; do not start another assessment.");
      }
    }finally{
      if(generation===submissionGenerationRef.current){
        statusCheckRef.current=false;
        setStatusCheckBusy(false);
      }
    }
  },[attemptQuery.data?.id,user?.id,testId,deadline,readOwnedSubmissionStatus,queryClient,navigate]);
  const submitExam = useCallback(async (dueToExpiry: boolean) => {
    if (submittingRef.current || statusCheckRef.current || !attemptQuery.data ||
        !testQuery.data || !user || !validExamId(testId)) return;
    const generation=submissionGenerationRef.current;
    if (attemptQuery.data.status !== "in_progress") {
      if (["submitted", "auto_submitted"].includes(attemptQuery.data.status))
        navigate("/test-results/" + attemptQuery.data.id, { replace: true });
      else setNotice("This attempt cannot be submitted from the exam editor. Check its server status.");
      return;
    }
    if (!educationDeadlineSafety("in_progress",deadline).deadlineKnown) {
      setSubmissionUncertain(true);
      setNotice("This attempt's original deadline cannot be verified. No submission was sent. Check the server status before proceeding.");
      return;
    }
    if (atomicCbtEnabled && (!restoredAnswersQuery.isSuccess || !saveQueueRef.current)) {
      setNotice("Your existing saved answers are not ready. Do not submit until the server has restored the attempt.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmSubmit(false);
    setNotice("");
    setSubmissionUncertain(false);
    try {
      const attemptId = attemptQuery.data.id;
      if (atomicCbtEnabled) {
        try {
          await flushPendingAnswers();
        } catch (error) {
          // Past-deadline writes are denied by the server. Finalize the attempt
          // regardless; stale local text must never bypass the deadline.
          if (!dueToExpiry && Date.now() < deadline!) throw error;
        }
        const result = await submitCbtAttempt(attemptId);
        if (result.id !== attemptId || !["submitted", "auto_submitted"].includes(result.status)) {
          throw new Error("The server did not confirm this exact assessment submission.");
        }
        if(generation!==submissionGenerationRef.current)return;
        void queryClient.invalidateQueries({ queryKey: ["education-owned-attempt-list", user.id] });
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
      if (!data || data.id!==attemptId)
        throw new Error("The attempt was not confirmed. Please check its server status.");
      if(generation!==submissionGenerationRef.current)return;
      void queryClient.invalidateQueries({ queryKey: ["education-owned-attempt-list", user.id] });
      toast.success("Assessment submission recorded.");
      navigate("/test-results/" + attemptId, { replace: true });
    } catch {
      // A lost HTTP response does NOT establish that submission failed.
      // Verify the exact owner + test + attempt before offering a retry.
      if(generation!==submissionGenerationRef.current)return;
      setSubmissionUncertain(true);
      try{
        const receipt=await readOwnedSubmissionStatus(attemptQuery.data.id,user.id,testId!);
        if(generation!==submissionGenerationRef.current)return;
        if(receipt.confirmed){
          setSubmissionUncertain(false);
          void queryClient.invalidateQueries({queryKey:["education-owned-attempt-list",user.id]});
          toast.success("Server confirms your assessment submission.");
          navigate("/test-results/"+receipt.id,{replace:true});
        }else{
          setNotice(educationSubmissionRecoveryMessage(receipt,deadline));
        }
      }catch{
        if(generation===submissionGenerationRef.current)
          setNotice("Submission could not be confirmed. The server status check is unavailable; do not assume the attempt failed or start another exam. Retry the status check.");
      }
    } finally {
      if(generation===submissionGenerationRef.current){
        submittingRef.current=false;
        setSubmitting(false);
      }
    }
  }, [attemptQuery.data, testQuery.data, user, testId, deadline, answers, navigate,
    flushPendingAnswers, readOwnedSubmissionStatus, queryClient, restoredAnswersQuery.isSuccess]);
  submitRef.current = submitExam;

  // A resumed attempt may already be submitted. Do not show editable
  // responses or initiate duplicate submissions for completed attempts.
  useEffect(() => {
    if (!enabled || !attemptQuery.data || !user?.id) return;
    if (["submitted", "auto_submitted"].includes(attemptQuery.data.status)) {
      navigate("/test-results/" + attemptQuery.data.id, { replace: true });
    }
  }, [enabled, attemptQuery.data?.id, attemptQuery.data?.status, user?.id, navigate]);

  useEffect(() => {
    if (deadline === null || !attemptQuery.data ||
        attemptQuery.data.status !== "in_progress") return;
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
  }, [deadline, attemptQuery.data?.id, attemptQuery.data?.status]);

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

  // Only native page reload/close can use beforeunload; route navigation
  // remains a separate concern. No answer data is stored on device.
  useEffect(() => {
    if (!atomicCbtEnabled || !enabled || attemptQuery.data?.status !== "in_progress")
      return;
    const warnUnconfirmedSave = (event: BeforeUnloadEvent) => {
      if (!saveQueueRef.current?.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnconfirmedSave);
    return () => window.removeEventListener("beforeunload", warnUnconfirmedSave);
  }, [enabled, attemptQuery.data?.id, attemptQuery.data?.status]);

  const updateAnswer = (value: string) => {
    if (!question || !canEdit) return;
    let nextAnswer: Answer;
    try {
      nextAnswer = createEducationExamAnswer(
        question, value, optionsQuery.isSuccess ? optionsQuery.data : null,
      ) as Answer;
    } catch {
      setNotice("The response does not match this question's current choices or length limit. Reload choices or retry.");
      return;
    }
    setNotice("");
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
      <p>Assessment or attempt could not be loaded or safely verified. It may be unavailable,
        your answer records may need server review, or your account may lack access.
        No new exam will be started when question metadata is invalid.</p>
      <Button variant="outline" onClick={() => {
        if (testQuery.error) void testQuery.refetch();
        else if (attemptQuery.error) void attemptQuery.refetch();
        else if (restoredAnswersQuery.error) void restoredAnswersQuery.refetch();
      }}>Retry assessment loading</Button>
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
  if (attemptQuery.data.status !== "in_progress") {
    const complete = ["submitted", "auto_submitted"].includes(attemptQuery.data.status);
    return <main className="mx-auto max-w-xl space-y-4 p-8" role="status">
      <h1 className="text-xl font-semibold">This attempt is no longer editable</h1>
      <p>Its status is confirmed by the assessment service. Do not submit it again from this screen.</p>
      {complete && <Button asChild><Link to={"/test-results/" + attemptQuery.data.id}>View your results</Link></Button>}
      <Button asChild variant="outline"><Link to="/education/history">My assessments</Link></Button>
    </main>;
  }
  const count = review.total;
  const answered = review.answered;
  const progress = count > 0 ? answered / count * 100 : 0;
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
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>Question {questionIndex + 1} of {count}</span>
          <span>{answered} answered · {review.unanswered} unanswered · {review.flagged} flagged</span>
        </div>
        <Progress value={progress} aria-label="Questions answered" />
        <p className="text-xs text-muted-foreground">
          Review flags stay in this tab only; they are not saved with your exam answers.
        </p>
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
          {!answerSaveFailed && !expired && saveQueueRef.current?.hasUnsaved() && (
            <Button size="sm" variant="outline" disabled={submitting}
              onClick={() => void flushPendingAnswers().catch(() => {})}>
              <Save aria-hidden="true" className="mr-1 h-4 w-4" />Save answers now
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
        <CardHeader>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Question {questionIndex + 1}</p>
            <Button size="sm" variant="outline" disabled={submitting || attemptQuery.data.status !== "in_progress"}
              aria-pressed={flaggedQuestions.has(question.id)} onClick={toggleCurrentFlag}>
              <Bookmark aria-hidden="true" className="mr-1 h-4 w-4" />
              {flaggedQuestions.has(question.id) ? "Remove review flag" : "Flag for review"}
            </Button>
          </div>
          <CardTitle className="text-xl">{question.question_text}</CardTitle>
          <CardDescription>{question.points} points · {question.question_type.replace(/_/g, " ")}</CardDescription></CardHeader>
        <CardContent>
          {["multiple_choice", "true_false"].includes(question.question_type) ? (
            optionsQuery.isPending ? <p role="status">Loading choices…</p> :
            optionsQuery.error ? <div role="alert" className="flex flex-wrap items-center gap-3">
              <p>Choices could not be loaded or safely verified. No response can be selected yet.</p>
              <Button variant="outline" size="sm" onClick={() => void optionsQuery.refetch()}>
                Retry loading choices
              </Button>
            </div> :
            !optionsQuery.data?.length ? <p role="alert">No options are configured for this question.</p> :
            <>
            {choiceStatus === "unavailable" && <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" className="h-4 w-4"/>
              <AlertDescription>
                Your previously saved choice is no longer among this question's available options.
                It is not counted as a valid current answer. Select one of the displayed choices to correct it.
                We will not silently overwrite your saved response.
              </AlertDescription>
            </Alert>}
            <RadioGroup disabled={!canEdit}
              value={choiceStatus === "valid" ? selected?.selectedOptionId || "" : ""}
              onValueChange={updateAnswer}>
              {optionsQuery.data.map(option => <div key={option.id} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem id={"exam-option-" + option.id} value={option.id} />
                <Label htmlFor={"exam-option-" + option.id} className="cursor-pointer break-words">{option.option_text}</Label>
              </div>)}
            </RadioGroup>
            </>
          ) : question.question_type === "short_answer" ? (
            <div className="space-y-2">
              <Textarea aria-label="Your short answer" disabled={!canEdit} maxLength={5000}
                value={selected?.shortAnswer || ""} onChange={event => updateAnswer(event.target.value)} className="min-h-32" />
              <p role="status" className="text-xs text-muted-foreground">
                {(selected?.shortAnswer || "").length} of 5,000 characters used.
                Only non-whitespace text counts as an answered written question.
              </p>
            </div>
          ) : <p role="alert">This question type is not supported in the assessment interface.</p>}
        </CardContent>
      </Card>
      <section aria-label="Exam question overview" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <ListChecks aria-hidden="true" className="h-4 w-4 text-primary" />Review questions
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Jump to any question without submitting your exam.
            </p>
          </div>
          <Button size="sm" variant="outline" aria-expanded={reviewPanelOpen}
            onClick={() => setReviewPanelOpen(previous => !previous)}>
            {reviewPanelOpen ? "Hide overview" : "Show overview"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={submitting || review.unanswered === 0}
            onClick={() => jumpToNextReview("unanswered")}>
            Next unanswered ({review.unanswered})
          </Button>
          <Button size="sm" variant="outline" disabled={submitting || review.flagged === 0}
            onClick={() => jumpToNextReview("flagged")}>
            Next flagged ({review.flagged})
          </Button>
        </div>
        {reviewPanelOpen && (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {review.entries.map(item => (
              <Button key={item.id} type="button" size="sm"
                variant={item.index === questionIndex ? "default" : "outline"}
                className={"min-h-11 min-w-0 " + (item.flagged && item.index !== questionIndex
                  ? "border-amber-500/60" : "")}
                disabled={submitting}
                aria-current={item.index === questionIndex ? "step" : undefined}
                aria-label={"Question " + item.number + ": " +
                  (item.answered ? "answered" : "unanswered") +
                  (item.flagged ? ", flagged for review" : "")}
                onClick={() => jumpToReviewQuestion(item.index)}>
                {item.number}{item.flagged ? " •" : item.answered ? " ✓" : ""}
              </Button>
            ))}
          </div>
        )}
      </section>
      <nav aria-label="Exam question navigation" className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled={questionIndex === 0 || submitting} onClick={() => setQuestionIndex(i => Math.max(0, i - 1))}>Previous</Button>
        <Button variant="destructive" disabled={submitting} onClick={() => setConfirmSubmit(true)}><LogOut aria-hidden="true" className="mr-2 h-4 w-4" />Submit assessment</Button>
        <Button disabled={questionIndex === count - 1 || submitting} onClick={() => setQuestionIndex(i => Math.min(count - 1, i + 1))}>Next</Button>
      </nav>
      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Submit this assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              {answered} of {count} questions answered. {educationReviewSummaryMessage(review)}
              Your answers cannot be changed after a confirmed submission.
              Review flags do not change your grade or block submission.
            </AlertDialogDescription></AlertDialogHeader>
          {(review.unanswered > 0 || review.flagged > 0) && (
            <div role="group" aria-label="Questions to revisit" className="max-h-44 overflow-y-auto rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-semibold">Revisit before submitting</p>
              <div className="flex flex-wrap gap-2">
                {review.entries.filter(item => !item.answered || item.flagged).map(item => (
                  <Button key={item.id} type="button" size="sm" variant="outline"
                    onClick={() => jumpToReviewQuestion(item.index)}>
                    Question {item.number}{item.flagged ? " · Flagged" : " · Unanswered"}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel disabled={submitting}>Continue assessment</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={() => void submitExam(expired)}>Confirm submission</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </main>;
}
