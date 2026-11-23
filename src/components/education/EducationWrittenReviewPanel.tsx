import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  checkWrittenReviewDraft, filterWrittenReviewQueue, isWrittenReviewDraftChanged,
  pendingWrittenReviewChanges, sanitizeWrittenReviewDrafts,
  summarizeWrittenReviewQueue, writtenReviewAssessments, writtenReviewDate,
} from "@/lib/educationWrittenReviewWorkbench.mjs";
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
  const [search, setSearch] = useState("");
  const [assessment, setAssessment] = useState("all");
  const [sort, setSort] = useState<"returned" | "assessment" | "reviewed_recent">("returned");
  const currentUserRef = useRef(userId);
  const requestScopeRef = useRef(0);
  const savingRef = useRef(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["education-written-review-queue", userId],
    enabled: writtenReviewEnabled && !!userId,
    queryFn: getWrittenReviewQueue,
    retry: 1,
  });
  // Changing teachers must erase draft marks and review-search text before paint.
  useLayoutEffect(() => {
    if (currentUserRef.current === userId) return;
    currentUserRef.current = userId;
    requestScopeRef.current += 1;
    setDrafts({});
    setSaving(null);
    savingRef.current = false;
    setErrorMessage("");
    setSearch("");
    setAssessment("all");
    setReviewFilter("pending");
    setSort("returned");
  }, [userId]);
  // A fresh authorized queue may change max marks or remove rows. Keep only
  // unsaved draft inputs that still refer to returned answer IDs.
  useEffect(() => {
    if (!query.data) return;
    setDrafts(previous => {
      const sanitized = sanitizeWrittenReviewDrafts(query.data, previous);
      const keys = Object.keys(sanitized);
      if (keys.length === Object.keys(previous).length &&
          keys.every(key => sanitized[key] === previous[key])) return previous;
      return sanitized;
    });
  }, [query.data]);

  const totals = useMemo(() => summarizeWrittenReviewQueue(query.data ?? []), [query.data]);
  const pendingCount = totals.pending;
  const reviewedCount = totals.reviewed;
  const assessments = useMemo(() => writtenReviewAssessments(query.data ?? []), [query.data]);
  const visibleReviews = useMemo(() => filterWrittenReviewQueue(query.data ?? [], {
    filter: reviewFilter, search, assessment, sort,
  }), [query.data, reviewFilter, search, assessment, sort]);
  const changedCount = pendingWrittenReviewChanges(query.data ?? [], drafts);
  const visiblePending = visibleReviews.filter(item => item.reviewed_points === null).length;

  const save = async (answerId: string, max: number, previous: number | null) => {
    if (savingRef.current || !query.data?.some(item => item.answer_id === answerId &&
      item.points_possible === max && item.reviewed_points === previous)) {
      setErrorMessage("The review row changed. Refresh the authorized queue before saving.");
      return;
    }
    const raw = drafts[answerId] ?? (previous === null ? "" : String(previous));
    const checked = checkWrittenReviewDraft(raw, max, previous);
    if (!checked.valid) {
      setErrorMessage(checked.error || "Check the provisional mark.");
      return;
    }
    if (!checked.changed) {
      setErrorMessage("This provisional mark is unchanged.");
      return;
    }
    if (previous !== null && previous !== checked.points &&
        !window.confirm("Replace this provisional written-review mark? A finalized assessment cannot be regraded here.")) {
      return;
    }
    const requestScope = requestScopeRef.current;
    savingRef.current = true;
    setSaving(answerId);
    setErrorMessage("");
    try {
      await saveWrittenReview(answerId, checked.points!);
      if (requestScope !== requestScopeRef.current) return;
      setDrafts(previousDrafts => {
        // Preserve any edits typed while the server was processing.
        if (previousDrafts[answerId] !== raw) return previousDrafts;
        const next = { ...previousDrafts };
        delete next[answerId];
        return next;
      });
      toast.success("Written response review recorded. Official grade remains pending.");
      // Do not describe a confirmed server save as failed just because the
      // separate queue refresh is unavailable.
      void queryClient.invalidateQueries({ queryKey: ["education-written-review-queue", userId] })
        .catch(() => setErrorMessage("Review recorded, but refreshing the queue failed. Use Refresh reviews."));
    } catch {
      if (requestScope === requestScopeRef.current)
        setErrorMessage("The review was not confirmed. No official score has been changed.");
    } finally {
      if (requestScope === requestScopeRef.current) {
        savingRef.current = false;
        setSaving(null);
      }
    }
  };

  const refresh = () => {
    setErrorMessage("");
    void query.refetch();
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
            Review up to 100 server-authorized submitted written responses from your published assessments.
            Saved marks are provisional evidence—not official results, certificates, or a request to finalize grades.
            This is the returned review queue, not a total across every historical submission.
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
              <div>
                <p role="status" className="text-sm text-muted-foreground">
                  {pendingCount} pending · {reviewedCount} reviewed in this queue
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {changedCount} unsaved local mark {changedCount === 1 ? "draft" : "drafts"} ·
                  {visibleReviews.length} matching returned responses · {visiblePending} matching pending
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={query.isFetching || !!saving}
                onClick={refresh}>
                <RefreshCw aria-hidden="true" className="mr-1 h-4 w-4"/>
                {query.isFetching ? "Refreshing…" : "Refresh reviews"}
              </Button>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter written reviews">
                {(["pending", "reviewed", "all"] as const).map(filter => (
                  <Button key={filter} size="sm" variant={reviewFilter === filter ? "default" : "outline"}
                    aria-pressed={reviewFilter === filter} onClick={() => setReviewFilter(filter)}>
                    {filter === "all" ? "All" : filter === "pending" ? "Pending" : "Reviewed"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-3">
              <div>
                <label htmlFor="written-review-search" className="mb-2 block text-sm font-medium">Search returned responses</label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/>
                  <input id="written-review-search" type="search" maxLength={120}
                    value={search} onChange={event => setSearch(event.target.value)}
                    placeholder="Assessment, question or answer"
                    className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"/>
                </div>
              </div>
              <div>
                <label htmlFor="written-review-assessment" className="mb-2 block text-sm font-medium">Assessment</label>
                <select id="written-review-assessment" value={assessment}
                  onChange={event => setAssessment(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="all">All returned assessments</option>
                  {assessments.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="written-review-sort" className="mb-2 block text-sm font-medium">Order responses</label>
                <select id="written-review-sort" value={sort}
                  onChange={event => setSort(event.target.value as typeof sort)}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="returned">Server-returned order</option>
                  <option value="assessment">Assessment and question</option>
                  <option value="reviewed_recent">Recently reviewed first</option>
                </select>
              </div>
            </div>
            {(search || assessment !== "all" || sort !== "returned") &&
              <Button size="sm" variant="ghost" onClick={() => {setSearch("");setAssessment("all");setSort("returned");}}>
                Clear review search and sorting
              </Button>}
            {query.data.length === 100 && <p role="note" className="text-xs text-muted-foreground">
              The authorized review service returned its 100-response limit. This is not the full historical backlog.
            </p>}
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
                {entry.reviewed_points === null ? "Not yet reviewed" :
                  `Saved provisional review: ${entry.reviewed_points} / ${entry.points_possible} · ${writtenReviewDate(entry.reviewed_at)}`}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm">
                  <span className="block">Points (0–{entry.points_possible})</span>
                  <input
                    type="number" min={0} max={entry.points_possible} step={1}
                    value={drafts[entry.answer_id] ?? (entry.reviewed_points === null ? "" : String(entry.reviewed_points))}
                    onChange={event => setDrafts(prev => ({ ...prev, [entry.answer_id]: event.target.value.slice(0, 5) }))}
                    className="min-h-11 w-28 rounded-lg border border-input bg-background px-3"
                    aria-label={`Points for written response ${entry.answer_id}`}
                  />
                </label>
                {(() => {
                  const raw = drafts[entry.answer_id] ?? (entry.reviewed_points === null ? "" : String(entry.reviewed_points));
                  const validation = checkWrittenReviewDraft(raw, entry.points_possible, entry.reviewed_points);
                  const changed = isWrittenReviewDraftChanged(drafts[entry.answer_id], entry.reviewed_points);
                  return <>
                    <Button disabled={!!saving || query.isFetching || !validation.valid || !validation.changed || !changed}
                      onClick={() => void save(entry.answer_id, entry.points_possible, entry.reviewed_points)}>
                      {saving === entry.answer_id ? "Recording…" : "Record review"}
                    </Button>
                    {changed && <Button type="button" variant="ghost" size="sm" disabled={!!saving}
                      onClick={() => setDrafts(prev => {
                        const next={...prev};delete next[entry.answer_id];return next;
                      })}>Discard local mark</Button>}
                    {changed && !validation.valid && <p role="alert" className="w-full text-xs text-destructive">
                      {validation.error}
                    </p>}
                  </>;
                })()}
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
