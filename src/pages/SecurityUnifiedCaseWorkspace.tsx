import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Archive, BookOpen, ClipboardCheck, Download, FileClock, FileSearch, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engagementMaySaveCase, CASE_MARKER } from "@/lib/securityCaseSnapshot.mjs";
import { INVESTIGATION_MARKER } from "@/lib/securityInvestigationUtils.mjs";
import {
  inspectUnifiedEvidence, validateUnifiedCaseDownload, groupValidatedCases,
  summarizeUnifiedCases, unifiedCaseReport, UNIFIED_REVIEW_BATCH, UNIFIED_MAX_REVIEWED,
} from "@/lib/securityUnifiedCases.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type AuditEvent = Database["public"]["Tables"]["pentest_audit_events"]["Row"];
type Reviewed = ReturnType<typeof validateUnifiedCaseDownload>;
const PAGE_SIZE = 30;
const selectStyle = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground";
const recognizedMarker = new Set([CASE_MARKER, INVESTIGATION_MARKER]);
const kindLabel = (record: Evidence) => record.description === CASE_MARKER ? "Assessment snapshot" : "Investigation snapshot";

function savePrivateDossier(report: string) {
  const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eternyx-private-case-dossier.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SecurityUnifiedCaseWorkspace() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [records, setRecords] = useState<Evidence[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recordErrors, setRecordErrors] = useState<Record<string,string>>({});
  const [reviewed, setReviewed] = useState<Reviewed[]>([]);
  const [kindFilter, setKindFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const loadRequestToken = useRef(0);
  const reviewRequestToken = useRef(0);
  const engagement = useMemo(() => engagements.find((item) => item.id === engagementId), [engagements, engagementId]);
  const canReview = Boolean(userId && engagement && engagement.owner_id === userId && engagementMaySaveCase(engagement));
  const candidates = records.filter((item) => recognizedMarker.has(item.description || "") && item.mime_type === "application/json");
  const validatedIds = useMemo(() => new Set(reviewed.map((item) => item.id)), [reviewed]);
  const dossiers = useMemo(() => groupValidatedCases(reviewed), [reviewed]);
  const summary = useMemo(() => summarizeUnifiedCases(dossiers, candidates.length, reviewed.length), [dossiers, candidates.length, reviewed.length]);
  const shownRecords = candidates.filter((item) =>
    (kindFilter === "all" || (kindFilter === "assessment" ? item.description === CASE_MARKER : item.description === INVESTIGATION_MARKER)) &&
    (item.file_name + " " + item.created_at).toLowerCase().includes(textFilter.trim().toLowerCase())
  );
  const shownDossiers = dossiers.filter((item) => !onlyAttention ||
    item.unresolvedFindings > 0 || item.pendingActions > 0 || item.overdueActions > 0 || item.overdueFindings > 0);

  useEffect(() => {
    let active = true;
    loadRequestToken.current++;
    reviewRequestToken.current++;
    setEngagements([]); setEngagementId(""); setReviewed([]); setRecords([]); setAudit([]);
    setLoading(true); setError(""); setNotice(""); setRecordErrors({});
    if (!userId) { setLoading(false); return () => { active = false; }; }
    void (async () => {
      const result = await supabase.from("pentest_engagements").select("*").eq("owner_id", userId)
        .order("updated_at", { ascending: false }).limit(100);
      if (!active) return;
      if (result.error) setError("Could not load owned security engagements: " + result.error.message);
      else { setEngagements(result.data || []); setError(""); }
      setLoading(false);
    })();
    return () => { active = false; loadRequestToken.current++; reviewRequestToken.current++; };
  }, [userId]);

  const loadRecords = useCallback(async (id: string, start = 0) => {
    if (!userId || !id) return;
    const token = ++loadRequestToken.current;
    setLoadingRecords(true);
    const [metadata, log] = await Promise.all([
      supabase.from("pentest_evidence").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(start, start + PAGE_SIZE - 1),
      start === 0 ? supabase.from("pentest_audit_events").select("*").eq("owner_id", userId)
        .eq("engagement_id", id).order("created_at", { ascending: false }).limit(25)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (token !== loadRequestToken.current) return;
    if (metadata.error || log.error) {
      if (start === 0) { setRecords([]); setAudit([]); }
      setError("Private evidence history is unavailable: " + (metadata.error?.message || log.error?.message));
    } else {
      const entries = metadata.data || [];
      setRecords((current) => start === 0 ? entries : [
        ...current, ...entries.filter((item) => !current.some((old) => old.id === item.id)),
      ]);
      if (start === 0) setAudit(log.data || []);
      setOffset(start + entries.length);
      setHasMore(entries.length === PAGE_SIZE);
      setError("");
    }
    setLoadingRecords(false);
  }, [userId]);

  useEffect(() => {
    loadRequestToken.current++;
    reviewRequestToken.current++;
    setRecords([]); setAudit([]); setReviewed([]); setRecordErrors({});
    setOffset(0); setHasMore(false); setLoadingRecords(false); setBusy(false);
    setNotice(""); setError(""); setOnlyAttention(false);
    if (engagementId) void loadRecords(engagementId, 0);
  }, [engagementId, loadRecords]);

  const readPrivateCase = async (record: Evidence, selected: Engagement, owner: string): Promise<Reviewed> => {
    const inspected = inspectUnifiedEvidence(record, selected, owner);
    if (!inspected) throw new Error("This metadata is not an assessment or investigation snapshot.");
    const result = await supabase.storage.from("pentest-evidence").download(inspected.path);
    if (result.error || !result.data) throw new Error("Private case object is not accessible.");
    if (result.data.size < 1 || result.data.size > record.file_size + 4096 ||
        result.data.size > inspected.maxBytes) {
      throw new Error("Downloaded object failed bounded file-size verification.");
    }
    const parsed = validateUnifiedCaseDownload(await result.data.text(), record, selected, owner);
    if (parsed.kind === "investigation" && parsed.snapshot.evidenceIds.length) {
      const verification = await supabase.from("pentest_evidence").select("id")
        .eq("owner_id", owner).eq("engagement_id", selected.id)
        .in("id", parsed.snapshot.evidenceIds).limit(20);
      if (verification.error || !verification.data ||
          new Set(verification.data.map((item) => item.id)).size !== parsed.snapshot.evidenceIds.length) {
        throw new Error("Linked investigation evidence was not verified under this account and engagement.");
      }
    }
    return parsed;
  };

  const reviewRecords = async (items: Evidence[]) => {
    if (busy || !userId || !engagement || !canReview || items.length < 1 ||
        items.length > UNIFIED_REVIEW_BATCH || reviewed.length + items.length > UNIFIED_MAX_REVIEWED) return;
    const selected = engagement;
    const owner = userId;
    const token = ++reviewRequestToken.current;
    setBusy(true); setError(""); setNotice("");
    const results = await Promise.allSettled(items.map((item) => readPrivateCase(item, selected, owner)));
    if (token !== reviewRequestToken.current) return;
    const accepted: Reviewed[] = [];
    const failures: Record<string,string> = {};
    for (let index = 0; index < results.length; index++) {
      const outcome = results[index];
      if (outcome.status === "fulfilled") accepted.push(outcome.value);
      else failures[items[index].id] = outcome.reason instanceof Error ? outcome.reason.message : "Case validation failed.";
    }
    setReviewed((current) => {
      const other = current.filter((item) => !items.some((candidate) => candidate.id === item.id));
      return [...other, ...accepted].slice(0, UNIFIED_MAX_REVIEWED);
    });
    setRecordErrors((current) => {
      const next = { ...current };
      for (const item of items) delete next[item.id];
      return { ...next, ...failures };
    });
    setNotice(accepted.length + " private version(s) validated; " + Object.keys(failures).length +
      " rejected. Only validated versions appear in the dossier.");
    setBusy(false);
  };

  const reviewNextBatch = () => {
    const next = candidates.filter((item) => !validatedIds.has(item.id) && !recordErrors[item.id])
      .slice(0, UNIFIED_REVIEW_BATCH);
    void reviewRecords(next);
  };
  const changeEngagement = (value: string) => {
    if (busy) return;
    setEngagementId(value);
  };
  const exportDossier = () => {
    if (!engagement || !canReview || !reviewed.length) return;
    savePrivateDossier(unifiedCaseReport(dossiers, summary, engagement.engagement_name));
    setNotice("Private metadata-only dossier exported. No raw finding evidence or storage paths included.");
  };

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>Cybersecurity Hub</Link>
    <header className="rounded-3xl border border-cyan-300/20 bg-card p-7">
      <div className="flex items-center gap-2 text-cyan-200"><ClipboardCheck className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 7</span></div>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Unified Private Case Dossiers</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">View real saved assessment and investigation versions together by exact declared target. Only owner-scoped, explicitly validated case contents contribute to analyst triage.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link to="/cybersecurity/cases" className="text-cyan-300 underline">Assessment editor</Link><Link to="/cybersecurity/investigations" className="text-cyan-300 underline">Investigation editor</Link><Link to="/cybersecurity/case-intelligence" className="text-cyan-300 underline">Assessment version comparisons</Link></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/35 bg-rose-950/15 p-4 text-sm text-rose-100">{error}</div>}
    {notice && <p role="status" aria-live="polite" className="rounded-xl border border-cyan-300/25 p-4 text-sm text-cyan-100">{notice}</p>}

    <Card className="border-border bg-card"><CardHeader><CardTitle>1. Select your authorized engagement</CardTitle><CardDescription>Existing Supabase owner RLS and private storage policies enforce access. An engagement attestation is not independently verified permission.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="unified-engagement">Owned engagement</Label>
      <select id="unified-engagement" className={selectStyle} value={engagementId} disabled={loading || busy} onChange={(event) => changeEngagement(event.target.value)}>
        <option value="">Choose engagement</option>{engagements.map((item) => <option key={item.id} value={item.id}>{item.engagement_name} · {item.status}</option>)}
      </select>
      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading private engagements…</p>}
      {engagement && <p className="text-xs text-muted-foreground">Declared targets: {engagement.scope_targets.length} · Excluded: {engagement.excluded_targets.length} · {canReview ? "Attested scope available for case review" : "Review disabled: engagement has no current attested scope"}</p>}
    </CardContent></Card>

    {engagement && <Card className="border-border bg-card"><CardHeader><CardTitle>2. Discover saved private versions</CardTitle><CardDescription>Metadata only until you explicitly review a file. Unknown attachments are not interpreted as case snapshots. Reviews validate the current exact target scope.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="unified-kind-filter">Record type</Label><select id="unified-kind-filter" className={selectStyle} value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">Assessments + investigations</option><option value="assessment">Assessments only</option><option value="investigation">Investigations only</option></select></div>
        <div className="space-y-2"><Label htmlFor="unified-search">Search version metadata</Label><Input id="unified-search" value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Private filename or saved date" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canReview || busy || reviewed.length >= UNIFIED_MAX_REVIEWED || !candidates.some((item) => !validatedIds.has(item.id) && !recordErrors[item.id])} onClick={reviewNextBatch}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileSearch className="mr-2 h-4 w-4"/>}Review next {UNIFIED_REVIEW_BATCH} unreviewed
        </Button>
        <Button variant="outline" disabled={busy || loadingRecords} onClick={() => void loadRecords(engagement.id, 0)}><RefreshCw className="mr-2 h-4 w-4"/>Refresh evidence</Button>
        <p className="text-xs text-muted-foreground">{candidates.length} recognized versions loaded · {reviewed.length} validated · {summary.unreviewedCandidates} not validated</p>
      </div>
      {!canReview && <p className="flex items-start gap-2 text-sm text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>Private case review requires an owned, attested active or completed scoped engagement.</p>}
      {!shownRecords.length && !loadingRecords && <p className="text-sm text-muted-foreground">No matching saved case metadata in the loaded pages.</p>}
      <div className="space-y-2">{shownRecords.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm">
        <div className="min-w-0 flex-1"><p className="font-semibold">{kindLabel(item)} · {new Date(item.created_at).toLocaleString()}</p><p className="mt-1 break-all text-xs text-muted-foreground">{item.file_name} · {item.file_size} bytes</p>
          {validatedIds.has(item.id) && <p className="mt-1 flex items-center gap-1 text-xs text-cyan-200"><ShieldCheck className="h-4 w-4"/>Current private version content validated</p>}
          {recordErrors[item.id] && <p className="mt-1 text-xs text-rose-200" role="alert">Review rejected: {recordErrors[item.id]}</p>}
        </div>
        <Button size="sm" variant="outline" disabled={!canReview || busy} onClick={() => void reviewRecords([item])}>{validatedIds.has(item.id) ? "Revalidate" : recordErrors[item.id] ? "Retry review" : "Review private file"}</Button>
      </div>)}</div>
      {hasMore && <Button variant="outline" disabled={busy || loadingRecords} onClick={() => void loadRecords(engagement.id, offset)}>{loadingRecords ? "Loading…" : "Load older private versions"}</Button>}
      {loadingRecords && <p role="status" className="text-xs text-muted-foreground">Loading private evidence history…</p>}
    </CardContent></Card>}

    {engagement && <Card className="border-border bg-card"><CardHeader><CardTitle>3. Analyst case summary</CardTitle><CardDescription>Aggregates use only the newest validated version of each record type for each exact target. An unreviewed case is not counted as healthy or complete.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        { label: "Validated targets", value: summary.reviewedTargets },
        { label: "Analyst unresolved findings", value: summary.unresolvedFindings },
        { label: "Overdue finding dates", value: summary.overdueFindings },
        { label: "Pending response actions", value: summary.pendingActions },
        { label: "Overdue response actions", value: summary.overdueActions },
        { label: "Same-target pairs", value: summary.sharedTargetPairs },
        { label: "Reviewed versions", value: summary.validatedVersions },
        { label: "Not validated yet", value: summary.unreviewedCandidates },
      ].map((metric) => <div key={metric.label} className="rounded-xl border border-border bg-background p-4"><p className="text-xs font-semibold text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-semibold">{metric.value}</p></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />Only targets with analyst attention items</label>
        <Button variant="outline" disabled={!canReview || !reviewed.length} onClick={exportDossier}><Download className="mr-2 h-4 w-4"/>Export private metadata dossier</Button>
      </div>
      {!reviewed.length && <p className="text-sm text-muted-foreground">No snapshot contents have been validated yet. Review a saved private version to see real case and investigation information.</p>}
      <div className="space-y-3">{shownDossiers.map((group) => <section key={group.key} className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{group.target}</h3><p className="mt-1 text-xs text-muted-foreground">{group.versionsReviewed} validated historical version(s) · Newest {new Date(group.latestAt).toLocaleString()}</p></div>
          <span className="text-xs text-muted-foreground">{group.sharedTargetOnly ? "Shared target: both record types" : "One record type reviewed"}</span></div>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3"><p className="font-semibold">Latest validated assessment</p>{group.assessment ? <><p className="mt-1 text-muted-foreground">{group.assessment.title}</p><p className="mt-1">{group.unresolvedFindings} unresolved · {group.overdueFindings} overdue by analyst dates</p></> : <p className="mt-1 text-muted-foreground">No assessment version reviewed for this target.</p>}</div>
          <div className="rounded-lg border border-border p-3"><p className="font-semibold">Latest validated investigation</p>{group.investigation ? <><p className="mt-1 text-muted-foreground">{group.investigation.title} · {group.investigation.analystStatus}</p><p className="mt-1">{group.pendingActions} pending actions · {group.overdueActions} overdue</p></> : <p className="mt-1 text-muted-foreground">No investigation version reviewed for this target.</p>}</div>
        </div>
        <p className="mt-3 text-xs text-amber-200">These records share an exact declared target; this is not a verified formal incident link or proof of causality.</p>
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="font-semibold">Validated version chronology</p>{group.versions.map((version) => <p key={version.id} className="flex items-center gap-2"><Archive className="h-3 w-3"/>{new Date(version.capturedAt).toLocaleString()} · {version.kind} · {version.title}</p>)}
        </div>
      </section>)}</div>
    </CardContent></Card>}

    {engagement && <Card className="border-border bg-card"><CardHeader><CardTitle>4. Existing private evidence audit</CardTitle><CardDescription>Owner- and engagement-scoped metadata from the database's existing append-only audit system. These rows prove metadata actions were recorded, not that investigator narratives are true.</CardDescription></CardHeader><CardContent className="space-y-2">
      {!audit.length && <p className="text-sm text-muted-foreground">No recent audit metadata was returned for this engagement.</p>}
      {audit.map((item) => <p key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground"><FileClock className="h-4 w-4 shrink-0"/>{new Date(item.created_at).toLocaleString()} · {item.event_type.replaceAll("_", " ")}</p>)}
      <Link to="/black-hat-pentesting" className="inline-flex items-center gap-2 text-xs text-cyan-300 underline"><BookOpen className="h-4 w-4"/>Open the full engagement evidence workspace</Link>
    </CardContent></Card>}
    <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-950/10 p-4 text-sm text-amber-100"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0"/>Boundaries: saved private evidence and existing RLS authorize access. This screen does not perform vulnerability scanning, incident detection, automatic containment, independent permission verification or verified remediation. A common target is only an analyst review grouping, not a new persistent case relationship.</p>
  </div></main>;
}
