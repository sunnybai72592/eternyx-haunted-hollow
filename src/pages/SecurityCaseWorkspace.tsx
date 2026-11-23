import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Archive, ClipboardCheck, Download, FileText, Loader2, Plus, RefreshCw, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { validateAssessmentFinding, summarizeAssessment } from "@/lib/securityAssessmentUtils.mjs";
import {
  CASE_MARKER, MAX_CASE_BYTES, caseReport, createCaseSnapshot,
  engagementMaySaveCase, parseCaseSnapshot, validateCaseSnapshot,
} from "@/lib/securityCaseSnapshot.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type Finding = ReturnType<typeof validateAssessmentFinding> & {
  id: string;
  retestNote: string;
  riskAcceptanceNote: string;
};
type FindingDraft = Omit<Finding, "id">;
type Criticality = "low" | "medium" | "high" | "critical";
const emptyDraft: FindingDraft = {
  title: "", severity: "medium", evidence: "", recommendation: "", owner: "",
  status: "open", dueDate: "", retestNote: "", riskAcceptanceNote: "",
};
const severityStyle: Record<string, string> = {
  critical: "border-rose-400/40 text-rose-200",
  high: "border-orange-400/40 text-orange-200",
  medium: "border-amber-400/40 text-amber-200",
  low: "border-slate-700 text-slate-300",
};
const inputStyle = "border-slate-700 bg-slate-950 text-white";
const selectStyle = "h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white";

function downloadText(content: string, filename: string, mime = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SecurityCaseWorkspace() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [target, setTarget] = useState("");
  const [assessmentName, setAssessmentName] = useState("Security review");
  const [steward, setSteward] = useState("");
  const [criticality, setCriticality] = useState<Criticality>("medium");
  const [assetNotes, setAssetNotes] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [draft, setDraft] = useState<FindingDraft>(emptyDraft);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useMemo(() => engagements.find((item) => item.id === engagementId), [engagements, engagementId]);
  const targets = useMemo(() => selected?.scope_targets.filter((item) => !selected.excluded_targets.includes(item)) ?? [], [selected]);
  const canSave = Boolean(selected && userId && engagementMaySaveCase(selected) && targets.includes(target));
  const snapshots = evidence.filter((item) => item.description === CASE_MARKER && item.mime_type === "application/json");
  const otherEvidence = evidence.filter((item) => item.description !== CASE_MARKER);
  const summary = useMemo(() => summarizeAssessment(findings), [findings]);

  const resetCase = () => {
    setTarget(""); setAssessmentName("Security review"); setSteward(""); setCriticality("medium");
    setAssetNotes(""); setFindings([]); setDraft(emptyDraft); setDirty(false); setError(""); setNotice("");
  };

  const loadEngagements = useCallback(async () => {
    if (!userId) { setEngagements([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: fetchError } = await supabase.from("pentest_engagements")
      .select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(50);
    if (fetchError) { setError("Could not load private engagements: " + fetchError.message); setEngagements([]); }
    else { setEngagements(data || []); setError(""); }
    setLoading(false);
  }, [userId]);

  const loadEvidence = useCallback(async (id: string) => {
    if (!userId || !id) { setEvidence([]); return; }
    const { data, error: fetchError } = await supabase.from("pentest_evidence")
      .select("*").eq("owner_id", userId).eq("engagement_id", id)
      .order("created_at", { ascending: false }).limit(100);
    if (fetchError) { setEvidence([]); setError("Could not read private evidence metadata: " + fetchError.message); }
    else setEvidence(data || []);
  }, [userId]);

  useEffect(() => { setEngagementId(""); setEvidence([]); resetCase(); void loadEngagements(); }, [loadEngagements]);
  useEffect(() => { setEvidence([]); if (engagementId) void loadEvidence(engagementId); }, [engagementId, loadEvidence]);

  const chooseEngagement = (next: string) => {
    if (working) return;
    if (dirty && !window.confirm("Discard unsaved changes? Save a case snapshot before switching engagements.")) return;
    resetCase(); setEngagementId(next);
  };

  const markDirty = () => { setDirty(true); setNotice(""); };
  const addFinding = () => {
    try {
      if (!target) throw new Error("Select a scoped asset before adding findings.");
      if (findings.length >= 100) throw new Error("Cases support up to 100 findings.");
      const item = validateAssessmentFinding(draft);
      const next: Finding = {
        ...item, id: crypto.randomUUID(), retestNote: draft.retestNote.trim(),
        riskAcceptanceNote: draft.riskAcceptanceNote.trim(),
      };
      setFindings((current) => [...current, next]);
      setDraft(emptyDraft); markDirty(); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to add finding."); }
  };

  const updateFinding = (id: string, patch: Partial<Finding>) => {
    setFindings((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    markDirty();
  };

  const assemble = () => {
    if (!selected || !userId) throw new Error("Choose an authenticated engagement first.");
    return createCaseSnapshot({
      engagement: selected, ownerId: userId, assessmentName,
      asset: { target, steward, criticality, notes: assetNotes }, findings,
    });
  };

  const exportReport = () => {
    try { const validated = assemble(); downloadText(caseReport(validated), "eternyx-security-case-report.md"); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Report validation failed."); }
  };

  const saveCase = async () => {
    if (working || !selected || !userId) return;
    let snapshot: ReturnType<typeof createCaseSnapshot>;
    try { snapshot = assemble(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Case validation failed."); return;
    }
    const raw = JSON.stringify(snapshot);
    const file = new File([raw], "security-case-" + crypto.randomUUID() + ".json", { type: "application/json" });
    if (file.size > MAX_CASE_BYTES) { setError("Case exceeds the snapshot size limit."); return; }
    const objectPath = userId + "/" + selected.id + "/" + crypto.randomUUID() + "-" + file.name;
    setWorking(true); setError(""); setNotice("");
    try {
      const upload = await supabase.storage.from("pentest-evidence").upload(objectPath, file, {
        contentType: "application/json", upsert: false,
      });
      if (upload.error) throw new Error("Private upload failed: " + upload.error.message);
      const registered = await supabase.from("pentest_evidence").insert({
        owner_id: userId, engagement_id: selected.id, storage_path: objectPath,
        file_name: file.name, mime_type: file.type, file_size: file.size,
        description: CASE_MARKER,
      });
      if (registered.error) {
        const cleanup = await supabase.storage.from("pentest-evidence").remove([objectPath]);
        throw new Error("Case metadata was not registered. " + (cleanup.error
          ? "Orphan cleanup also failed; contact support. "
          : "The unregistered file was cleaned up. ") + registered.error.message);
      }
      setDirty(false);
      setNotice("Private case snapshot saved and audit metadata registered. New changes require a new snapshot.");
      await loadEvidence(selected.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save the case.");
    } finally { setWorking(false); }
  };

  const restoreCase = async (record: Evidence) => {
    if (working || !selected || !userId) return;
    if (dirty && !window.confirm("Discard current unsaved edits and restore the selected case snapshot?")) return;
    if (record.engagement_id !== selected.id || record.owner_id !== userId ||
      record.description !== CASE_MARKER || record.file_size > MAX_CASE_BYTES) {
      setError("Snapshot metadata does not match this authorized case."); return;
    }
    setWorking(true); setError(""); setNotice("");
    try {
      const { data, error: downloadError } = await supabase.storage.from("pentest-evidence").download(record.storage_path);
      if (downloadError || !data) throw new Error("Private case could not be downloaded.");
      if (data.size > MAX_CASE_BYTES) throw new Error("Case file exceeds the allowed size.");
      const parsed = parseCaseSnapshot(await data.text(), selected, userId);
      setTarget(parsed.asset.target); setAssessmentName(parsed.assessmentName);
      setSteward(parsed.asset.steward); setCriticality(parsed.asset.criticality as Criticality);
      setAssetNotes(parsed.asset.notes); setFindings(parsed.findings); setDraft(emptyDraft);
      setDirty(false); setNotice("Verified owner-bound snapshot format and restored local case draft.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to restore case."); }
    finally { setWorking(false); }
  };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4" /> Cybersecurity Hub</Link>
      <header className="rounded-3xl border border-cyan-300/20 bg-card p-7">
        <div className="flex items-center gap-3 text-cyan-300"><ClipboardCheck className="h-6 w-6" /><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 2</span></div>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Private Security Assessment Cases</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Link an attested engagement to scoped assets, record analyst findings, document remediation and retests, and save immutable versions to owner-protected evidence storage. This workspace does not scan targets or independently verify authorization.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-lg border border-border px-3 py-1">Owner-protected engagement</span><span className="rounded-lg border border-border px-3 py-1">Private JSON snapshots</span><span className="rounded-lg border border-border px-3 py-1">Audit-recorded evidence</span><span className="rounded-lg border border-border px-3 py-1">Markdown report</span></div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-4 text-sm text-emerald-200">{notice}</p>}
      <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>1. Select a private engagement</CardTitle><CardDescription>Only your own engagement rows can be read. Create and attest written scope in the pentesting workspace.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3"><div className="min-w-60 flex-1 space-y-2"><Label htmlFor="case-engagement">Saved engagement</Label><select id="case-engagement" className={selectStyle} disabled={working || loading} value={engagementId} onChange={(event) => chooseEngagement(event.target.value)}><option value="">Choose an engagement</option>{engagements.map((item) => <option key={item.id} value={item.id}>{item.engagement_name} — {item.status}</option>)}</select></div><Button variant="outline" disabled={working || loading} onClick={() => void loadEngagements()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your own engagements…</p>}
          {!loading && !engagements.length && <p className="text-sm text-muted-foreground">No private engagements found. <Link to="/black-hat-pentesting" className="text-cyan-300 underline">Create a scoped engagement</Link> first.</p>}
          {selected && <div className="rounded-xl border border-border bg-background p-4 text-sm">
            <p className="font-semibold">{selected.engagement_name}</p><p className="mt-2 text-muted-foreground">Status: {selected.status} · Authorization reference: {selected.authorization_reference || "Not entered"} · Allowed methods: {selected.permitted_methods.join(", ") || "Not specified"}</p>
            <p className="mt-2 text-xs text-muted-foreground">Written authorization is an owner attestation, not independently verified permission. Excluded targets are never selectable.</p>
            {!engagementMaySaveCase(selected) && <p className="mt-3 flex items-start gap-2 text-amber-200"><ShieldAlert className="h-4 w-4 shrink-0" />Saving is disabled until this engagement is attested and moved to a scoped authorized lifecycle state.</p>}
          </div>}
        </CardContent>
      </Card>

      {selected && <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>2. Choose an in-scope asset</CardTitle><CardDescription>Targets come strictly from this engagement's saved scope; no discovery or scan is performed.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label htmlFor="case-target">Declared target</Label><select id="case-target" className={selectStyle} disabled={working} value={target} onChange={(event) => { if (dirty && !window.confirm("Clear unsaved findings before switching targets?")) return; setTarget(event.target.value); setFindings([]); markDirty(); }}><option value="">Select scoped target</option>{targets.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="case-name">Assessment name</Label><Input id="case-name" maxLength={160} value={assessmentName} className={inputStyle} onChange={(event) => { setAssessmentName(event.target.value); markDirty(); }} /></div>
          <div className="space-y-2"><Label htmlFor="case-steward">Asset owner / team</Label><Input id="case-steward" maxLength={120} value={steward} className={inputStyle} onChange={(event) => { setSteward(event.target.value); markDirty(); }} /></div>
          <div className="space-y-2"><Label htmlFor="case-criticality">Asset criticality (analyst assigned)</Label><select id="case-criticality" value={criticality} className={selectStyle} onChange={(event) => { setCriticality(event.target.value as Criticality); markDirty(); }}>{["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="case-asset-notes">Asset notes</Label><Textarea id="case-asset-notes" maxLength={2000} className={inputStyle} value={assetNotes} onChange={(event) => { setAssetNotes(event.target.value); markDirty(); }} placeholder="Record context only; do not put secrets or personal information in evidence." /></div>
        </CardContent>
      </Card>}

      {selected && <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>3. Record findings and remediation</CardTitle><CardDescription>Analyst-entered observations only. Verified and accepted statuses require a written retest or approval record before a snapshot can be saved.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label htmlFor="case-finding-title">Finding title</Label><Input id="case-finding-title" maxLength={180} value={draft.title} className={inputStyle} onChange={(event) => setDraft((v) => ({ ...v, title: event.target.value }))}/></div>
            <div className="space-y-2"><Label htmlFor="case-severity">Severity</Label><select id="case-severity" value={draft.severity} className={selectStyle} onChange={(event) => setDraft((v) => ({ ...v, severity: event.target.value }))}>{["critical", "high", "medium", "low"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="case-owner">Remediation owner</Label><Input id="case-owner" maxLength={120} className={inputStyle} value={draft.owner} onChange={(event) => setDraft((v) => ({ ...v, owner: event.target.value }))}/></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="case-observation">Evidence / observed condition</Label><Textarea id="case-observation" maxLength={4000} className={inputStyle} value={draft.evidence} onChange={(event) => setDraft((v) => ({ ...v, evidence: event.target.value }))}/></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="case-recommendation">Recommended action</Label><Textarea id="case-recommendation" maxLength={4000} className={inputStyle} value={draft.recommendation} onChange={(event) => setDraft((v) => ({ ...v, recommendation: event.target.value }))}/></div>
            <div className="space-y-2"><Label htmlFor="case-due-date">Remediation due date</Label><Input id="case-due-date" type="date" value={draft.dueDate} className={inputStyle} onChange={(event) => setDraft((v) => ({ ...v, dueDate: event.target.value }))}/></div>
          </div>
          <Button disabled={working || !target} onClick={addFinding}><Plus className="mr-2 h-4 w-4" />Add finding</Button>
          <p className="text-xs text-muted-foreground">Draft: {summary.total} findings · {summary.critical} critical · {summary.high} high · {summary.open} open · {summary.verified} verified</p>
          <div className="space-y-3">{findings.map((finding) => <div key={finding.id} className={"rounded-xl border bg-background p-4 " + severityStyle[finding.severity]}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{finding.title}</h3><p className="mt-1 text-xs text-muted-foreground">{finding.severity.toUpperCase()} · Owner: {finding.owner || "Unassigned"} · Due: {finding.dueDate || "Not scheduled"}</p></div><Button size="sm" variant="ghost" aria-label={"Remove " + finding.title} onClick={() => { setFindings((items) => items.filter((item) => item.id !== finding.id)); markDirty(); }} disabled={working}><Trash2 className="h-4 w-4" /></Button></div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{finding.evidence || "No observation recorded"}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor={"finding-status-" + finding.id}>Remediation status</Label><select id={"finding-status-" + finding.id} value={finding.status} className={selectStyle} onChange={(event) => updateFinding(finding.id, { status: event.target.value })}>{["open", "in-progress", "blocked", "verified", "accepted"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor={"finding-retest-" + finding.id}>Retest evidence (required for verified)</Label><Textarea id={"finding-retest-" + finding.id} maxLength={2000} className={inputStyle} value={finding.retestNote} onChange={(event) => updateFinding(finding.id, { retestNote: event.target.value })}/></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor={"finding-approval-" + finding.id}>Risk-owner approval reference (required for accepted)</Label><Input id={"finding-approval-" + finding.id} maxLength={2000} className={inputStyle} value={finding.riskAcceptanceNote} onChange={(event) => updateFinding(finding.id, { riskAcceptanceNote: event.target.value })}/></div>
            </div>
          </div>)}</div>
        </CardContent>
      </Card>}

      {selected && <Card className="border-border bg-card text-foreground"><CardHeader><CardTitle>4. Save and restore private evidence snapshots</CardTitle><CardDescription>Immutable versioned JSON files in the existing private pentest-evidence bucket; metadata inserts are audited by database triggers. Saving is not the same as independently validating a finding.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2"><Button disabled={!canSave || working || !dirty} onClick={() => void saveCase()}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save private snapshot</Button><Button variant="outline" disabled={!canSave || working} onClick={exportReport}><Download className="mr-2 h-4 w-4" />Export Markdown report</Button><Button variant="outline" disabled={working} onClick={() => void loadEvidence(selected.id)}><RefreshCw className="mr-2 h-4 w-4" />Refresh evidence</Button></div>
          {dirty && <p className="text-xs text-amber-200">Unsaved local changes. Saved snapshots remain immutable; a new save creates a new version.</p>}
          <div className="space-y-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Archive className="h-4 w-4" />Saved case snapshots ({snapshots.length} shown)</h3>
            {snapshots.length === 0 ? <p className="text-sm text-muted-foreground">No saved versions found for this engagement.</p> : snapshots.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"><div><p>Private snapshot · {new Date(item.created_at).toLocaleString()}</p><p className="text-xs text-muted-foreground">{item.file_size} bytes · {item.file_name}</p></div><Button variant="outline" size="sm" disabled={working} onClick={() => void restoreCase(item)}><FileText className="mr-2 h-4 w-4" />Restore version</Button></div>)}
          </div>
          <div className="rounded-lg border border-border bg-background p-3"><h3 className="text-sm font-semibold">Evidence already attached to this engagement ({otherEvidence.length} shown)</h3><p className="mt-1 text-xs text-muted-foreground">Read-only evidence metadata; files are managed in your engagement's private evidence panel.</p><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{otherEvidence.slice(0,12).map((item) => <li key={item.id}>• {item.file_name} — {item.description || "No description"}</li>)}</ul><Link className="mt-2 inline-block text-xs text-cyan-300 underline" to="/black-hat-pentesting">Open engagement evidence and audit history</Link></div>
        </CardContent>
      </Card>}
      <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-950/15 p-4 text-sm text-amber-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><p>Security boundary: only the existing Supabase RLS and private storage policies enforce ownership. Snapshot contents and retest claims are entered by the analyst, not verified by the server. No scans, automated patching, or active testing are launched here.</p></div>
    </div>
  </main>;
}
