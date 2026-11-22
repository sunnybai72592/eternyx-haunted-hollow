import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import {
  publicationRpcEnabled, listEducationPublicationQueue, reviewEducationPublication,
  enrollEducationStudent, revokeEducationEnrollment,
} from "@/lib/educationPublicationRpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * This UI isn't the authority: each privileged RPC checks the trusted
 * admin assignment on the database. Staging-only flags default to OFF.
 */
export default function EducationPublicationAdmin() {
  const { user, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const [testId, setTestId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);

  const authQuery = useQuery({
    queryKey: ["education-publication-admin-access", user?.id],
    enabled: publicationRpcEnabled && !authLoading && !!user?.id,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      if (error) throw error;
      return data === true;
    },
  });
  const isAdmin = authQuery.data === true;
  const queueQuery = useQuery({
    queryKey: ["education-publication-admin-queue", user?.id],
    enabled: publicationRpcEnabled && isAdmin && !!user?.id,
    queryFn: listEducationPublicationQueue,
    retry: 1,
  });

  const review = async (id: string, approve: boolean) => {
    if (!isAdmin || reviewId || busy) return;
    if (!window.confirm(approve
      ? "Approve and publish this exam? It will become active, but only enrolled students may start it."
      : "Reject this publication request? The exam will stay private.")) return;
    setReviewId(id);
    setFeedback("");
    try {
      await reviewEducationPublication(id, approve);
      setFeedback(approve ? "Publication approved. Student enrollment is still required." : "Publication rejected; draft remains private.");
      await queryClient.invalidateQueries({ queryKey: ["education-publication-admin-queue", user?.id] });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Publication review failed.");
    } finally {
      setReviewId(null);
    }
  };

  const enrollmentAction = async (revoke: boolean) => {
    if (!isAdmin || busy || reviewId) return;
    if (!window.confirm(revoke
      ? "Revoke this student's enrollment? The server will refuse if an attempt exists."
      : "Enroll this student into the approved published exam?")) return;
    setBusy(true);
    setFeedback("");
    try {
      if (revoke) {
        const changed = await revokeEducationEnrollment(testId.trim(), studentId.trim());
        setFeedback(changed ? "Enrollment revoked." : "No enrollment record was found.");
      } else {
        await enrollEducationStudent(testId.trim(), studentId.trim());
        setFeedback("Enrollment confirmed by server.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Enrollment action failed.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-background px-4 py-9 text-foreground sm:px-6">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/admin" className="text-sm text-primary underline">Back to administration</Link>
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-9">
        <BookOpenCheck aria-hidden="true" className="h-8 w-8 text-primary" />
        <h1 className="mt-3 text-3xl font-bold">Education publication review</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Staging-only workflow for independently reviewing educator drafts and enrolling students.
          Instructor approval alone never publishes an assessment.
        </p>
      </header>

      {!publicationRpcEnabled && <div role="status" className="rounded-xl border border-border bg-card p-5 text-sm">
        This workspace is disabled until the coordinated Education security rollout has passed staging review.
      </div>}
      {publicationRpcEnabled && (authLoading || authQuery.isPending) &&
        <p role="status">Verifying administrator access…</p>}
      {publicationRpcEnabled && authQuery.error &&
        <p role="alert">Admin verification failed. No review or enrollment operations are available.</p>}
      {publicationRpcEnabled && !authLoading && authQuery.data === false &&
        <div role="alert" className="rounded-xl border border-border bg-card p-6">
          <ShieldCheck aria-hidden="true" className="mb-3 h-7 w-7 text-primary" />
          Administrator access is required.
        </div>}

      {feedback && <p role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-4 text-sm">{feedback}</p>}
      {publicationRpcEnabled && isAdmin && <>
        <Card>
          <CardHeader>
            <CardTitle>Pending publication requests</CardTitle>
            <CardDescription>Server-returned metadata only; correct answers are not included.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" disabled={queueQuery.isFetching} onClick={() => void queueQuery.refetch()}>
              <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Refresh queue
            </Button>
            {queueQuery.isPending && <p role="status">Loading pending reviews…</p>}
            {queueQuery.error && <p role="alert">Review queue unavailable. Retry after checking the backend.</p>}
            {queueQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No pending publication requests.</p>}
            {queueQuery.data?.map(item => <div key={item.test_id} className="rounded-xl border border-border bg-background p-4">
              <h2 className="break-words font-semibold">{item.title}</h2>
              <p className="mt-1 break-all text-xs text-muted-foreground">Test ID: {item.test_id}</p>
              <p className="mt-1 text-xs text-muted-foreground">Requested: {new Date(item.requested_at).toLocaleString()}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={!!reviewId || busy} onClick={() => void review(item.test_id, true)}>Approve & publish</Button>
                <Button disabled={!!reviewId || busy} variant="outline" onClick={() => void review(item.test_id, false)}>Reject request</Button>
              </div>
            </div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controlled student enrollment</CardTitle>
            <CardDescription>Use the approved test UUID and an existing Auth user UUID. All decisions are checked by the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="education-admin-test-id" className="mb-1 block text-sm font-medium">Published test ID</label>
              <input id="education-admin-test-id" value={testId} onChange={event => setTestId(event.target.value)}
                maxLength={36} placeholder="Test UUID" className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="education-admin-student-id" className="mb-1 block text-sm font-medium">Student Auth user ID</label>
              <input id="education-admin-student-id" value={studentId} onChange={event => setStudentId(event.target.value)}
                maxLength={36} placeholder="Student UUID" className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || !!reviewId} onClick={() => void enrollmentAction(false)}>
                {busy ? "Working…" : "Enroll student"}
              </Button>
              <Button variant="outline" disabled={busy || !!reviewId} onClick={() => void enrollmentAction(true)}>
                Revoke enrollment
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Revocation is blocked after the student has an attempt. This page does not disclose student details or answer keys.
            </p>
          </CardContent>
        </Card>
      </>}
    </div>
  </main>;
}
