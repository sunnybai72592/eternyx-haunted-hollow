import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWrittenReviewQueue, saveWrittenReview, writtenReviewEnabled,
} from "@/lib/educationWrittenReviewRpc";

/**
 * Staging-only reviewer UI. Server-side verified teacher ownership is checked
 * on every RPC. Marks are saved as review evidence, NEVER as final learner
 * grades until the trusted grading worker is integrated and approved.
 */
export default function EducationWrittenReviewPanel({ userId }: { userId: string }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"pending" | "reviewed" | "all">("pending");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["education-written-review-queue", userId],
    enabled: writtenReviewEnabled && !!userId,
    queryFn: getWrittenReviewQueue,
    retry: 1,
  });
  useEffect(() => {
    setDrafts({});
    setErrorMessage("");
  }, [userId]);
  const pendingCount = query.data?.filter(item => item.reviewed_points === null).length ?? 0;
  const reviewedCount = query.data?.filter(item => item.reviewed_points !== null).length ?? 0;
  const visibleReviews = (query.data ?? []).filter(item =>
    reviewFilter === "all" || (reviewFilter === "pending"
      ? item.reviewed_points === null : item.reviewed_points !== null));

  const save = async (answerId: string, max: number, previous: number | null) => {
    if (saving) return;
    const raw = drafts[answerId] ?? (previous === null ? "" : String(previous));
    if (!/^(0|[1-9][0-9]{0,3})$/.test(raw)) {
      setErrorMessage("Enter whole-number points, including 0 if appropriate.");
      return;
    }
    const points = Number(raw);
    if (!Number.isInteger(points) || points > max) {
      setErrorMessage("Marks must be between 0 and the question's maximum.");
      return;
    }
    if (previous !== null && previous !== points &&
        !window.confirm("Replace this provisional written-review mark? A finalized assessment cannot be regraded here.")) {
      return;
    }
    setSaving(answerId);
    setErrorMessage("");
    try {
      await saveWrittenReview(answerId, points);
      setDrafts(previousDrafts => {
        const next = { ...previousDrafts };
        delete next[answerId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["education-written-review-queue", userId] });
      toast.success("Written response review recorded. Official grade remains pending.");
    } catch {
      setErrorMessage("The review was not confirmed. No official score has been changed.");
    } finally {
      setSaving(null);
    }
  };

  if (!writtenReviewEnabled) return null;
  return (
    <section aria-label="Verified instructor written response review" className="space-y-3">
      <Card className="border-primary/25">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary"><ClipboardCheck aria-hidden="true" className="h-5 w-5" />
            <CardTitle>Written response reviews</CardTitle>
          </div>
          <CardDescription>
            Review up to 100 submitted responses belonging to your published assessments.
            Saved marks are provisional review records, not official results or certificates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your completed written responses…</p>}
          {query.error && <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm">Reviews could not be loaded or instructor access was revoked.</p>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Retry
            </Button>
          </div>}
          {errorMessage && <p role="alert" className="flex gap-2 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{errorMessage}
          </p>}
          {query.data && <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                {pendingCount} pending · {reviewedCount} reviewed in this queue
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter written reviews">
                {(["pending", "reviewed", "all"] as const).map(filter => (
                  <Button key={filter} size="sm" variant={reviewFilter === filter ? "default" : "outline"}
                    aria-pressed={reviewFilter === filter} onClick={() => setReviewFilter(filter)}>
                    {filter === "all" ? "All" : filter === "pending" ? "Pending" : "Reviewed"}
                  </Button>
                ))}
              </div>
            </div>
            {query.data.length === 0 && <p className="text-sm text-muted-foreground">No submitted written responses are available for review.</p>}
            {query.data.length > 0 && visibleReviews.length === 0 &&
              <p className="text-sm text-muted-foreground">No responses match this filter.</p>}
          </>}
          {visibleReviews.map((entry) => (
            <article key={entry.answer_id} className="space-y-3 rounded-xl border border-border bg-background p-4">
              <div>
                <p className="text-xs text-muted-foreground">{entry.test_title}</p>
                <h3 className="mt-1 text-sm font-semibold">{entry.question_text}</h3>
              </div>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm">{entry.response_text}</p>
              <p className="text-xs text-muted-foreground">
                {entry.reviewed_points === null ? "Not yet reviewed" : `Saved review: ${entry.reviewed_points} / ${entry.points_possible}`}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm">
                  <span className="block">Points (0–{entry.points_possible})</span>
                  <input
                    type="number" min={0} max={entry.points_possible} step={1}
                    value={drafts[entry.answer_id] ?? (entry.reviewed_points === null ? "" : String(entry.reviewed_points))}
                    onChange={event => setDrafts(prev => ({ ...prev, [entry.answer_id]: event.target.value }))}
                    className="min-h-11 w-28 rounded-lg border border-input bg-background px-3"
                    aria-label={`Points for written response ${entry.answer_id}`}
                  />
                </label>
                <Button disabled={!!saving || query.isFetching ||
                    (drafts[entry.answer_id] === undefined && entry.reviewed_points !== null)}
                  onClick={() => void save(entry.answer_id, entry.points_possible, entry.reviewed_points)}>
                  {saving === entry.answer_id ? "Recording…" : "Record review"}
                </Button>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
