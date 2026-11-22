import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
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

export default function TestResults() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
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

  const summary = useMemo(() => summarizeAttempt(attemptQuery.data), [attemptQuery.data]);
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
    queryKey: ["education-result-answers", user?.id, attemptId],
    enabled: enabled && !!attemptQuery.data && summary.completed,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_answers")
        .select("question_id,is_correct,points_awarded,selected_option_id,short_answer_text,questions(id,question_text,points)")
        .eq("attempt_id", attemptId!);
      if (error) throw error;
      return (data ?? []).map((answer: any) => {
        const question = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions;
        return {
          id: answer.question_id,
          question_text: question?.question_text || "Question unavailable",
          points: typeof question?.points === "number" ? question.points : null,
          is_correct: typeof answer.is_correct === "boolean" ? answer.is_correct : null,
          points_awarded: typeof answer.points_awarded === "number" ? answer.points_awarded : null,
          user_answer: answer.short_answer_text || answer.selected_option_id || "No answer",
        };
      });
    },
  });

  const download = () => {
    if (!attemptQuery.data || !summary.completed || answersQuery.isPending || answersQuery.error) return;
    const text = buildAssessmentReport(attemptQuery.data, testQuery.data, answersQuery.data ?? []);
    downloadReport(text, attemptQuery.data.id);
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
                  <CardDescription>Availability and grading details depend on the assessment service.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {answersQuery.isPending && <p role="status">Loading submitted answers…</p>}
                  {answersQuery.error && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span>Answers could not be loaded.</span>
                      <Button variant="outline" onClick={() => void answersQuery.refetch()}>Retry answers</Button>
                    </div>
                  )}
                  {answersQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No submitted answers were returned.</p>}
                  {answersQuery.data?.map((answer, index) => (
                    <div key={answer.id} className="rounded-lg border border-border bg-background p-4 text-sm">
                      <p className="font-semibold">{index + 1}. {answer.question_text}</p>
                      <p className="mt-2 break-words text-muted-foreground">Submitted answer: {answer.user_answer}</p>
                      <p className="mt-1 text-muted-foreground">{answer.is_correct === null ? "Grading pending" :
                        answer.is_correct ? "Marked correct" : "Marked incorrect"}
                        {answer.points_awarded !== null && answer.points !== null ? ` · ${answer.points_awarded} / ${answer.points} points` : ""}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={!summary.completed || answersQuery.isPending || !!answersQuery.error}
                onClick={download}><Download aria-hidden="true" className="mr-2 h-4 w-4" />Download report (.txt)</Button>
              <Button asChild variant="outline"><Link to="/education">Back to Education</Link></Button>
              <p className="w-full text-xs text-muted-foreground">Reports are downloaded locally and are not certificates. Retakes depend on the exam service and are not enabled here.</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
