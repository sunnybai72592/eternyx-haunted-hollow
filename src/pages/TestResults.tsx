import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import {
  readVerifiedStudentGrade, verifiedStudentResultsEnabled,
  type VerifiedEducationReceipt,
} from "@/lib/educationVerifiedResultsRpc";
import { projectVerifiedAttempt, projectVerifiedAnswers } from "@/lib/educationVerifiedPresentation.mjs";
import {
  annotateEducationTextReport, buildEducationPrivateAnswerCsv,
  educationAnswerReviewLabel, educationResultProvenance,
  filterEducationAnswerReview, summarizeEducationAnswerReview,
} from "@/lib/educationPrivateAnswerReview.mjs";
import { assessmentDuration, buildAssessmentReport, formatAssessmentDate, summarizeAttempt } from "@/lib/educationResults.mjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Attempt = {
  id: string; test_id: string; user_id: string; start_time: string;
  end_time: string | null; status: string; score: number | null;
  max_score: number | null; is_mobile_locked: boolean | null;
};
type QuestionResult = {
  id: string; question_text: string; points: number | null;
  is_correct: boolean | null; points_awarded: number | null; user_answer: string;
};
type Assessment = { id: string; title: string; description: string | null };

function downloadReport(text: string, attemptId: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const element = document.createElement("a");
  element.href = url;
  element.download = "eternyx-assessment-" + attemptId + ".txt";
  element.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAnswerCsv(csv: string, attemptId: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "eternyx-private-answers-" + attemptId + ".csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TestResults() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [answerSearch, setAnswerSearch] = useState("");
  const [answerFilter, setAnswerFilter] = useState<"all" | "pending" | "reviewed" | "correct" | "incorrect">("all");
  const [exportError, setExportError] = useState("");
  const viewerRef = useRef(user?.id);
  useLayoutEffect(() => {
    if (viewerRef.current === user?.id) return;
    viewerRef.current = user?.id;
    // Never carry a prior account's answer search or export error state over.
    setAnswerSearch("");
    setAnswerFilter("all");
    setExportError("");
  }, [user?.id]);
  const validAttemptId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId ?? "");
  const enabled = !authLoading && isAuthenticated && !!user?.id && validAttemptId;

  const attemptQuery = useQuery<Attempt>({
    queryKey: ["education-attempt", user?.id, attemptId],
    enabled,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_attempts")
        .select("id,test_id,user_id,start_time,end_time,status,score,max_score,is_mobile_locked")
        .eq("id", attemptId!).eq("user_id", user!.id).single();
      if (error) throw error;
      if (!data || data.user_id !== user!.id) throw new Error("Attempt not accessible");
      return data as Attempt;
    },
  });

  const rawSummary = useMemo(() => summarizeAttempt(attemptQuery.data), [attemptQuery.data]);
  // Hosted ledger verification is an additional authenticated, owner-scoped
  // read. Its failure never promotes the browser's legacy score columns.
  const verifiedQuery = useQuery<VerifiedEducationReceipt>({
    queryKey: ["education-verified-receipt", user?.id, attemptId],
    enabled: enabled && verifiedStudentResultsEnabled && !!attemptQuery.data &&
      attemptQuery.data.user_id === user?.id && rawSummary.completed,
    retry: 1,
    queryFn: () => readVerifiedStudentGrade(attemptId!),
  });
  const displayedAttempt = useMemo(
    () => projectVerifiedAttempt(attemptQuery.data, verifiedQuery.data, verifiedStudentResultsEnabled) as Attempt | undefined,
    [attemptQuery.data, verifiedQuery.data],
  );
  const summary = useMemo(() => summarizeAttempt(displayedAttempt), [displayedAttempt]);
  const gradeRevealed = !verifiedStudentResultsEnabled ||
    (verifiedQuery.data?.grade_status === "finalized" && summary.graded);
  const testQuery = useQuery<Assessment>({
    queryKey: ["education-result-test", user?.id, attemptQuery.data?.test_id],
    enabled: enabled && !!attemptQuery.data,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("tests")
        .select("id,title,description").eq("id", attemptQuery.data!.test_id).single();
      if (error) throw error;
      return data as Assessment;
    },
  });
  const answersQuery = useQuery<QuestionResult[]>({
    queryKey: ["education-result-answers", user?.id, attemptId, gradeRevealed],
    enabled: enabled && !!attemptQuery.data && summary.completed,
    retry: 1,
    queryFn: async () => {
      // Pending verified mode does not even REQUEST correctness or points
      // from the API. Only a matching final ledger receipt unlocks grades.
      const request = gradeRevealed
        ? supabase.from("user_answers")
          .select("question_id,is_correct,points_awarded,selected_option_id,short_answer_text,questions(id,question_text,points)")
          .eq("attempt_id", attemptId!)
        : supabase.from("user_answers")
          .select("question_id,selected_option_id,short_answer_text,questions(id,question_text,points)")
          .eq("attempt_id", attemptId!);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((answer: any) => {
        const question = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions;
        return {
          id: answer.question_id,
          question_text: question?.question_text || "Question unavailable",
          points: typeof question?.points === "number" ? question.points : null,
          is_correct: gradeRevealed && typeof answer.is_correct === "boolean" ? answer.is_correct : null,
          points_awarded: gradeRevealed && typeof answer.points_awarded === "number" ? answer.points_awarded : null,
          // Post-submission options may be RLS-hidden. Never render a raw
          // database UUID as though it were the student's choice text.
          user_answer: answer.short_answer_text ||
            (answer.selected_option_id ? "Selected option recorded" : "No answer"),
        };
      });
    },
  });

  const provenance = educationResultProvenance(
    verifiedStudentResultsEnabled, verifiedQuery.data, gradeRevealed && summary.graded);
  const reviewCounts = useMemo(
    () => summarizeEducationAnswerReview(answersQuery.data ?? [], gradeRevealed),
    [answersQuery.data, gradeRevealed]);
  const effectiveFilter = gradeRevealed ? answerFilter :
    answerFilter === "all" ? "all" : "pending";
  const visibleAnswers = useMemo(
    () => filterEducationAnswerReview(answersQuery.data ?? [], answerSearch, effectiveFilter, gradeRevealed),
    [answersQuery.data, answerSearch, effectiveFilter, gradeRevealed]);

  const refreshResults = () => {
    // Explicit user action; no background polling or extra hosted traffic.
    // Receipt refresh activates a newly graded answer query automatically.
    void attemptQuery.refetch();
    if (verifiedStudentResultsEnabled && rawSummary.completed) void verifiedQuery.refetch();
    if (summary.completed) void answersQuery.refetch();
    if (testQuery.isSuccess) void testQuery.refetch();
  };

  const download = () => {
    if (!attemptQuery.data || !displayedAttempt || !summary.completed ||
        answersQuery.isPending || answersQuery.error ||
        (verifiedStudentResultsEnabled && (verifiedQuery.isPending || !!verifiedQuery.error))) return;
    try {
      const text = buildAssessmentReport(displayedAttempt, testQuery.data,
        projectVerifiedAnswers(answersQuery.data ?? [], gradeRevealed));
      downloadReport(annotateEducationTextReport(text, provenance), attemptQuery.data.id);
      setExportError("");
    } catch {
      setExportError("Your private text report could not be prepared.");
    }
  };
  const downloadCsv = () => {
    if (!attemptQuery.data || !displayedAttempt || !summary.completed ||
        !answersQuery.isSuccess || !Array.isArray(answersQuery.data) ||
        (verifiedStudentResultsEnabled && (verifiedQuery.isPending || !!verifiedQuery.error))) return;
    try {
      const csv = buildEducationPrivateAnswerCsv({
        attempt: displayedAttempt, test: testQuery.data, answers: answersQuery.data,
        verifiedMode: verifiedStudentResultsEnabled, receipt: verifiedQuery.data,
        gradeRevealed: gradeRevealed && summary.graded,
      });
      downloadAnswerCsv(csv, displayedAttempt.id);
      setExportError("");
    } catch {
      setExportError("Your private CSV could not be prepared. Refresh your answers and retry.");
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-10">
          <div className="flex items-center gap-3 text-primary">
            <BookOpen aria-hidden="true" className="h-7 w-7" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">ETERNYX Education</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Assessment results</h1>
          <p className="mt-3 text-sm text-muted-foreground">Only server-returned attempt details are displayed. An assessment without recorded grading is not automatically a failure.</p>
        </header>

        {!authLoading && !isAuthenticated && (
          <Alert><ShieldCheck aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>Sign in to view your own results. <Link className="font-semibold text-primary underline" to="/auth">Sign in</Link></AlertDescription>
          </Alert>
        )}
        {!validAttemptId && <Alert variant="destructive"><AlertCircle aria-hidden="true" className="h-4 w-4" /><AlertDescription>The attempt ID in this link is invalid.</AlertDescription></Alert>}
        {(authLoading || (enabled && attemptQuery.isPending)) && (
          <p role="status" className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
            {authLoading ? "Checking your session…" : "Loading your attempt…"}
          </p>
        )}
        {enabled && attemptQuery.error && (
          <Alert variant="destructive"><AlertCircle aria-hidden="true" className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>The attempt could not be loaded. Check your access or retry.</span>
              <Button variant="outline" onClick={() => void attemptQuery.refetch()}><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Retry</Button>
            </AlertDescription></Alert>
        )}
        {enabled && attemptQuery.data && (
          <>
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{summary.headline}</CardTitle>
                  <Badge variant="outline" className="border-primary/30 text-primary">{summary.status.replace(/_/g, " ")}</Badge>
                </div>
                <CardDescription>{testQuery.data?.title || "Assessment"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {verifiedStudentResultsEnabled && verifiedQuery.isPending && rawSummary.completed && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Verifying the official result against the trusted final-grade ledger…
                  </p>
                )}
                {verifiedStudentResultsEnabled && verifiedQuery.error && (
                  <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                    <span>Official grade verification is unavailable. No score will be shown.</span>
                    <Button variant="outline" size="sm" onClick={() => void verifiedQuery.refetch()}>
                      <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Retry verification
                    </Button>
                  </div>
                )}
                {verifiedStudentResultsEnabled && gradeRevealed && (
                  <p className="text-xs font-medium text-primary">
                    Verified final grade · Trusted assessment ledger · Finalized {formatAssessmentDate(verifiedQuery.data?.finalized_at)}
                  </p>
                )}
                {!verifiedStudentResultsEnabled && rawSummary.graded && (
                  <p role="note" className="text-xs text-muted-foreground">
                    Legacy grading mode: this recorded score has not been independently verified against the final-grade ledger.
                  </p>
                )}
                {summary.completed && (
                  <p role="note" className="text-xs text-muted-foreground">
                    Grade provenance: {provenance}
                  </p>
                )}
                {summary.graded ? (
                  <>
                    <p className="text-center text-4xl font-bold text-primary">{summary.score} / {summary.maxScore}</p>
                    <p className="text-center text-lg">{(summary.percentage ?? 0).toFixed(1)}%</p>
                    <Progress value={summary.percentage ?? 0} aria-label="Recorded score percentage" />
                    <p className="text-sm text-muted-foreground">A pass or fail result is not shown because a verified passing threshold is not available.</p>
                  </>
                ) : (
                  <p role="status" className="rounded-lg border border-border bg-background p-4 text-muted-foreground">
                    {summary.completed ? "The attempt has been submitted, but an official score has not been recorded yet." : "The attempt is still in progress. Results are not yet available."}
                  </p>
                )}
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Started</dt><dd>{formatAssessmentDate(attemptQuery.data.start_time)}</dd></div>
                  <div><dt className="text-muted-foreground">Completed</dt><dd>{formatAssessmentDate(attemptQuery.data.end_time)}</dd></div>
                  <div><dt className="text-muted-foreground">Duration</dt><dd>{assessmentDuration(attemptQuery.data.start_time, attemptQuery.data.end_time)}</dd></div>
                  <div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{summary.status.replace(/_/g, " ")}</dd></div>
                </dl>
                {attemptQuery.data.is_mobile_locked && (
                  <Alert><AlertCircle aria-hidden="true" className="h-4 w-4" />
                    <AlertDescription>A browser-background or screen-lock flag was recorded for this attempt. This flag alone does not establish misconduct.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {summary.completed && (
              <Card className="border-border bg-card">
                <CardHeader><CardTitle>Submitted answers</CardTitle>
                  <CardDescription>Search and filter only your own server-returned answer records.
                    Availability and grading depend on the assessment service; counts here are not the total number of exam questions.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="education-answer-search" className="mb-2 block text-sm font-medium">Find a submitted answer</label>
                      <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                        <input id="education-answer-search" type="search" value={answerSearch}
                          onChange={event => setAnswerSearch(event.target.value)} maxLength={120}
                          placeholder="Search question or your answer" className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="education-answer-filter" className="mb-2 block text-sm font-medium">Review status</label>
                      <select id="education-answer-filter" value={effectiveFilter}
                        onChange={event => setAnswerFilter(event.target.value as typeof answerFilter)}
                        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">All returned answers</option>
                        <option value="pending">Grading pending</option>
                        {gradeRevealed && <option value="reviewed">Reviewed or marked</option>}
                        {gradeRevealed && <option value="correct">Marked correct</option>}
                        {gradeRevealed && <option value="incorrect">Marked incorrect</option>}
                      </select>
                    </div>
                  </div>
                  <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                    {visibleAnswers.length} of {reviewCounts.returned} returned answers displayed
                    {gradeRevealed ? " · " + reviewCounts.pending + " awaiting review · " +
                      (reviewCounts.reviewed + reviewCounts.correct + reviewCounts.incorrect) + " reviewed or marked" :
                      " · Official correctness and marks are not available"}.
                  </p>
                  {(answerSearch || effectiveFilter !== "all") && (
                    <Button variant="ghost" size="sm" onClick={() => { setAnswerSearch(""); setAnswerFilter("all"); }}>
                      Clear answer filters
                    </Button>
                  )}
                  {answersQuery.isPending && <p role="status">Loading submitted answers…</p>}
                  {answersQuery.error && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span>Answers could not be loaded.</span>
                      <Button variant="outline" onClick={() => void answersQuery.refetch()}>Retry answers</Button>
                    </div>
                  )}
                  {answersQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No submitted answers were returned.</p>}
                  {answersQuery.isSuccess && reviewCounts.returned > 0 && visibleAnswers.length === 0 &&
                    <p className="text-sm text-muted-foreground">No returned answers match these filters.</p>}
                  {visibleAnswers.map((answer, index) => (
                    <div key={answer.id} className="rounded-lg border border-border bg-background p-4 text-sm">
                      <p className="font-semibold">{index + 1}. {answer.question_text}</p>
                      <p className="mt-2 break-words text-muted-foreground">Submitted answer: {answer.user_answer}</p>
                      <p className="mt-1 text-muted-foreground">{educationAnswerReviewLabel(answer, gradeRevealed)}
                        {gradeRevealed && answer.points_awarded !== null && answer.points !== null
                          ? ` · ${answer.points_awarded} / ${answer.points} points` : ""}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={attemptQuery.isFetching || verifiedQuery.isFetching || answersQuery.isFetching}
                onClick={refreshResults}>
                <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                {attemptQuery.isFetching || verifiedQuery.isFetching ? "Checking result…" : "Check latest result"}
              </Button>
              <Button variant="outline" disabled={!summary.completed || !answersQuery.isSuccess ||
                (verifiedStudentResultsEnabled && (verifiedQuery.isPending || !!verifiedQuery.error))}
                onClick={download}><Download aria-hidden="true" className="mr-2 h-4 w-4" />Download report (.txt)</Button>
              <Button variant="outline" disabled={!summary.completed || !answersQuery.isSuccess ||
                (verifiedStudentResultsEnabled && (verifiedQuery.isPending || !!verifiedQuery.error))}
                onClick={downloadCsv}><Download aria-hidden="true" className="mr-2 h-4 w-4" />Download my answers (.csv)</Button>
              {exportError && <p role="alert" className="w-full text-sm text-destructive">{exportError}</p>}
              <Button asChild variant="outline"><Link to="/education">Back to Education</Link></Button>
              <Button asChild variant="outline"><Link to="/education/history">My assessments</Link></Button>
              <p className="w-full text-xs text-muted-foreground">
                Reports are downloaded locally and are not certificates. CSV exports can contain your private written answers;
                keep them on a trusted device. CSV marks are included only for a matching verified final-grade receipt.
                Legacy scores are explicitly labeled unverified. Retakes depend on the exam service and are not enabled here.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
