import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Download, FileClock, FileSearch, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CASE_MARKER, MAX_CASE_BYTES, engagementMaySaveCase, parseCaseSnapshot } from "@/lib/securityCaseSnapshot.mjs";
import { compareCaseSnapshots, exportCaseComparison, exportCaseTriage, summarizeCaseTriage } from "@/lib/securityCaseIntelligence.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type Snapshot = ReturnType<typeof parseCaseSnapshot>;
type CaseDelta = ReturnType<typeof compareCaseSnapshots>;
const PAGE_SIZE = 30;
const control = "h-10 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300";

function downloadMarkdown(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export default function SecurityCaseIntelligence() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [records, setRecords] = useState<Evidence[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [versionId, setVersionId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [delta, setDelta] = useState<CaseDelta | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const requestToken = useRef(0);

  const selected = useMemo(() => engagements.find((item) => item.id === engagementId), [engagements, engagementId]);
  const versions = records.filter((item) => item.description === CASE_MARKER && item.mime_type === "application/json");
  const otherEvidenceCount = records.length - versions.length;
  const metrics = useMemo(() => snapshot ? summarizeCaseTriage(snapshot.findings) : null, [snapshot]);
  const visibleFindings = useMemo(() => (snapshot?.findings ?? []).filter((item) =>
    (statusFilter === "all" || statusFilter === item.status) &&
    (severityFilter === "all" || severityFilter === item.severity) &&
    [item.title, item.owner, item.evidence, item.recommendation].join(" ").toLowerCase().includes(query.trim().toLowerCase())
  ), [snapshot, statusFilter, severityFilter, query]);

  useEffect(() => {
    let valid = true;
    requestToken.current += 1;
    setEngagementId(""); setEngagements([]); setRecords([]); setSnapshot(null);
    setVersionId(""); setCompareId(""); setDelta(null);
    if (!userId) { setLoading(false); return () => { valid = false; }; }
    setLoading(true);
    void (async () => {
      const { data, error: requestError } = await supabase.from("pentest_engagements")
        .select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(100);
      if (!valid) return;
      if (requestError) setError("Private engagements unavailable: " + requestError.message);
      else { setEngagements(data || []); setError(""); }
      setLoading(false);
    })();
    return () => { valid = false; requestToken.current += 1; };
  }, [userId]);

  const loadRecords = useCallback(async (id: string, offset = 0) => {
    if (!userId || !id) return;
    const token = ++requestToken.current;
    setLoadingRecords(true);
    const { data, error: requestError } = await supabase.from("pentest_evidence")
      .select("*").eq("owner_id", userId).eq("engagement_id", id)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (token !== requestToken.current) return;
    if (requestError) {
      if (offset === 0) setRecords([]);
      setError("Unable to list private evidence: " + requestError.message);
    } else {
      const page = data || [];
      setRecords((previous) => offset === 0 ? page : [
        ...previous, ...page.filter((item) => !previous.some((prior) => prior.id === item.id)),
      ]);
      setNextOffset(offset + page.length);
      setHasMore(page.length === PAGE_SIZE);
      setError("");
    }
    setLoadingRecords(false);
  }, [userId]);

  useEffect(() => {
    requestToken.current += 1; setRecords([]); setNextOffset(0); setHasMore(false);
    setLoadingRecords(false); setVersionId(""); setCompareId(""); setDelta(null);
    setSnapshot(null); setNotice("");
    if (engagementId) void loadRecords(engagementId);
  }, [engagementId, loadRecords]);

  const readVersion = async (item: Evidence): Promise<Snapshot> => {
    if (!selected || !userId || !engagementMaySaveCase(selected)) {
      throw new Error("The current engagement must have an attested scoped lifecycle state.");
    }
    if (item.owner_id !== userId || item.engagement_id !== selected.id ||
        item.description !== CASE_MARKER || item.mime_type !== "application/json" ||
        item.file_size < 1 || item.file_size > MAX_CASE_BYTES ||
        !item.storage_path.startsWith(userId + "/" + selected.id + "/")) {
      throw new Error("Evidence metadata does not match this private engagement.");
    }
    const { data, error: downloadError } = await supabase.storage.from("pentest-evidence").download(item.storage_path);
    if (downloadError || !data) throw new Error("Private snapshot download failed.");
    if (data.size < 1 || data.size > MAX_CASE_BYTES) throw new Error("Snapshot is outside the supported size range.");
    return parseCaseSnapshot(await data.text(), selected, userId);
  };

  const reviewVersion = async () => {
    if (busy) return;
    const item = versions.find((record) => record.id === versionId);
    if (!item) { setError("Select an owned case version first."); return; }
    setBusy(true); setError(""); setNotice(""); setDelta(null); setSnapshot(null);
    try {
      const record = await readVersion(item);
      setSnapshot(record);
      setNotice("Validated snapshot ownership, engagement, current scope and content format. Triage is analyst-supplied.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to review version."); }
    finally { setBusy(false); }
  };

  const compareVersions = async () => {
    if (busy) return;
    const from = versions.find((item) => item.id === versionId);
    const to = versions.find((item) => item.id === compareId);
    if (!from || !to || from.id === to.id) { setError("Choose two different saved case versions."); return; }
    setBusy(true); setError(""); setNotice(""); setDelta(null);
    try {
      const [previous, current] = await Promise.all([readVersion(from), readVersion(to)]);
      const comparison = compareCaseSnapshots(previous, current);
      setSnapshot(previous); setDelta(comparison);
      setNotice("Compared two private, scope-validated snapshots. No automated security test was performed.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not compare case versions."); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4" /> Cybersecurity Hub</Link>
      <section className="rounded-3xl border border-cyan-300/20 bg-card p-7">
        <div className="flex items-center gap-2 text-cyan-200"><Activity className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 3</span></div>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Security Case Intelligence</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Review saved, account-owned security assessments, identify analyst-reported overdue work and compare remediation versions without inventing live scans or verified outcomes.</p>
        <Link to="/cybersecurity/cases" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 underline">Open private case editor <ArrowRight className="h-4 w-4" /></Link>
      </section>
      {error && <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/20 bg-cyan-950/20 p-4 text-sm text-cyan-100">{notice}</div>}

      <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>1. Choose a private engagement</CardTitle><CardDescription>Only account-owned engagements are returned by the existing database RLS policies. Attestation is not independently verified authorization.</CardDescription></CardHeader><CardContent className="space-y-3">
        <div className="space-y-2"><Label htmlFor="intelligence-engagement">Owned engagement</Label><select id="intelligence-engagement" className={control} disabled={busy || loading} value={engagementId} onChange={(event) => setEngagementId(event.target.value)}><option value="">Choose engagement</option>{engagements.map((item) => <option key={item.id} value={item.id}>{item.engagement_name} — {item.status}</option>)}</select></div>
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading private engagement records…</p>}
        {!loading && !engagements.length && <p className="text-sm text-muted-foreground">No saved engagements found. <Link to="/black-hat-pentesting" className="text-cyan-300 underline">Create a scoped engagement</Link> first.</p>}
        {selected && <div className="rounded-lg border border-border bg-background p-4 text-sm"><p className="font-semibold">{selected.engagement_name}</p><p className="mt-1 text-muted-foreground">Status: {selected.status} · Declared targets: {selected.scope_targets.length} · Exclusions: {selected.excluded_targets.length}</p>{!engagementMaySaveCase(selected) && <p className="mt-2 flex items-start gap-2 text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4" />Snapshot review requires an attested, scoped authorized engagement.</p>}</div>}
      </CardContent></Card>

      {selected && <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>2. Browse private version history</CardTitle><CardDescription>Owner-scoped evidence metadata is paginated. Cases are versioned JSON snapshots in private storage, not queryable relational findings.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="case-review-source">Review source version</Label><select id="case-review-source" className={control} disabled={busy} value={versionId} onChange={(event) => { setVersionId(event.target.value); setSnapshot(null); setDelta(null); }}><option value="">Select a saved snapshot</option>{versions.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.file_name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="case-review-compare">Compare against version</Label><select id="case-review-compare" className={control} disabled={busy} value={compareId} onChange={(event) => { setCompareId(event.target.value); setDelta(null); }}><option value="">Select comparison snapshot</option>{versions.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.file_name}</option>)}</select></div></div>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !versionId} onClick={() => void reviewVersion()}><FileSearch className="mr-2 h-4 w-4" />Review version</Button><Button variant="outline" disabled={busy || !versionId || !compareId || versionId === compareId} onClick={() => void compareVersions()}><FileClock className="mr-2 h-4 w-4" />Compare versions</Button><Button variant="outline" disabled={busy || loadingRecords} onClick={() => void loadRecords(selected.id, 0)}><RefreshCw className="mr-2 h-4 w-4" />Refresh list</Button></div>
        <p className="text-xs text-muted-foreground">{versions.length} saved case versions loaded · {otherEvidenceCount} other evidence records loaded</p>
        {hasMore && <Button variant="outline" disabled={busy || loadingRecords} onClick={() => void loadRecords(selected.id, nextOffset)}>{loadingRecords ? "Loading evidence..." : "Load older evidence"}</Button>}
        {loadingRecords && <p role="status" className="text-xs text-muted-foreground">Loading private evidence page…</p>}
        {!versions.length && !loadingRecords && <p className="text-sm text-muted-foreground">No case snapshots in the loaded pages. <Link className="text-cyan-300 underline" to="/cybersecurity/cases">Create and save a private case</Link>.</p>}
      </CardContent></Card>}

      {snapshot && metrics && <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>3. Analyst remediation triage</CardTitle><CardDescription>{snapshot.assessmentName} · {snapshot.asset.target} · Captured {new Date(snapshot.capturedAt).toLocaleString()}. The weights are internal queue priorities, not CVSS or verified risk.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Unresolved findings", value: metrics.active, note: "Critical: " + metrics.criticalActive + " · High: " + metrics.highActive },
            { label: "Overdue deadlines", value: metrics.overdue, note: "Based on entered dates (UTC)" },
            { label: "Blocked / unassigned", value: metrics.blocked + " / " + metrics.unassigned, note: "Analyst-entered status and owners" },
            { label: "Priority points (not CVSS)", value: metrics.priorityPoints, note: "Open critical 8, high 5, medium 3, low 1" },
          ].map((metric) => <div key={metric.label} className="rounded-xl border border-border bg-background p-4"><p className="text-xs font-semibold text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-semibold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.note}</p></div>)}
        </div>
        <p className="text-xs text-muted-foreground">Verified: {metrics.verified} · Accepted: {metrics.accepted} · Invalid due dates: {metrics.invalidDueDate}. All outcomes are supplied by the analyst, not independently checked.</p>
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={() => downloadMarkdown(exportCaseTriage(snapshot, metrics, new Date().toISOString()), "eternyx-remediation-triage.md")}><Download className="mr-2 h-4 w-4" />Export analyst triage report</Button></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="case-review-search">Search findings</Label><Input id="case-review-search" className="border-border bg-background text-foreground" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Finding, owner or observation"/></div><div className="space-y-2"><Label htmlFor="case-review-status">Status</Label><select id="case-review-status" aria-label="Filter findings by status" className={control} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{["open","in-progress","blocked","verified","accepted"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="space-y-2"><Label htmlFor="case-review-severity">Severity</Label><select id="case-review-severity" aria-label="Filter findings by severity" className={control} value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="all">All severities</option>{["critical","high","medium","low"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>
        <p className="text-xs text-muted-foreground">{visibleFindings.length} of {snapshot.findings.length} saved findings match filters.</p>
        <div className="space-y-3">{visibleFindings.map((item) => <div key={item.id} className="rounded-xl border border-border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{item.title}</h3><span className="text-xs text-muted-foreground">{item.severity.toUpperCase()} · {item.status}</span></div><p className="mt-2 text-xs text-muted-foreground">Owner: {item.owner || "Unassigned"} · Due: {item.dueDate || "Not set"}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.evidence || "No observation text"}</p><p className="mt-2 text-xs text-muted-foreground">Retest note: {item.retestNote || "Not recorded"} · Acceptance reference: {item.riskAcceptanceNote || "Not recorded"}</p></div>)}</div>
      </CardContent></Card>}

      {delta && <Card className="border-cyan-300/20 bg-card text-foreground"><CardHeader><CardTitle>4. Evidence-backed version difference</CardTitle><CardDescription>Differences are between two explicitly selected saved case files for the same account, engagement and asset. Changes are not verified fixes.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">{[
          { label: "Added findings", value: delta.added }, { label: "Removed findings", value: delta.removed }, { label: "Modified findings", value: delta.updated },
        ].map((item) => <div key={item.label} className="rounded-xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></div>)}</div>
        <p className="text-xs text-muted-foreground">Asset metadata fields changed: {delta.assetFields.join(", ") || "None"} · Assessment name changed: {delta.titleChanged ? "Yes" : "No"}</p>
        <div className="space-y-2">{delta.changes.map((item) => <div key={item.id} className="rounded-lg border border-border p-3 text-sm"><p className="font-semibold">{item.kind.toUpperCase()} · {item.title}</p><p className="mt-1 text-xs text-muted-foreground">Fields: {item.fields.join(", ")} · Status: {item.previousStatus ?? "not recorded"} → {item.nextStatus ?? "not recorded"}</p></div>)}</div>
        {delta.changes.length === 0 && <p className="text-sm text-muted-foreground">No recorded finding changes between these two versions.</p>}
        <Button variant="outline" onClick={() => downloadMarkdown(exportCaseComparison(delta), "eternyx-security-case-version-change-log.md")}><Download className="mr-2 h-4 w-4" />Export version change log</Button>
      </CardContent></Card>}

      <p className="flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-950/10 p-4 text-sm text-amber-100"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />Security boundary: existing owner RLS and the private evidence bucket enforce access. No live target scan, SOC integration, automated remediation, independent findings verification or new production schema is provided by this page.</p>
    </div>
  </main>;
}
