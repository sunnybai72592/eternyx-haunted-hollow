import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList, Download, FileClock, Loader2, Plus, RefreshCw, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { engagementMaySaveCase } from "@/lib/securityCaseSnapshot.mjs";
import { INVESTIGATION_MARKER, INVESTIGATION_MAX_BYTES, INVESTIGATION_EVENTS,
  INVESTIGATION_PRIORITIES, INVESTIGATION_STATUSES, createInvestigation,
  parseInvestigation, investigationReport, investigationTriage } from "@/lib/securityInvestigationUtils.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type Audit = Database["public"]["Tables"]["pentest_audit_events"]["Row"];
type SavedInvestigation = ReturnType<typeof parseInvestigation>;
type Entry = SavedInvestigation["timeline"][number];
type Action = SavedInvestigation["actions"][number];
const PAGE_SIZE = 30;
const inputClass = "border-border bg-background text-foreground";
const selectClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground";
const defaults = () => ({
  title: "", summary: "", investigator: "", priority: "medium", status: "open",
  closureNote: "", createdAt: "", timeline: [] as Entry[], actions: [] as Action[], evidenceIds: [] as string[],
});

function downloadReport(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "eternyx-private-investigation.md"; anchor.click();
  URL.revokeObjectURL(url);
}

export default function SecurityInvestigationWorkspace() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [target, setTarget] = useState("");
  const [caseData, setCaseData] = useState(defaults);
  const [records, setRecords] = useState<Evidence[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [recordsOffset, setRecordsOffset] = useState(0);
  const [moreRecords, setMoreRecords] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [timelineType, setTimelineType] = useState("observation");
  const [timelineDescription, setTimelineDescription] = useState("");
  const [timelineActor, setTimelineActor] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [evidenceToLink, setEvidenceToLink] = useState("");
  const loadToken = useRef(0);
  const selected = useMemo(() => engagements.find((e) => e.id === engagementId), [engagements, engagementId]);
  const targets = useMemo(() => selected?.scope_targets.filter((x) => !selected.excluded_targets.includes(x)) ?? [], [selected]);
  const allowed = Boolean(selected && userId && selected.owner_id === userId &&
    engagementMaySaveCase(selected) && targets.includes(target));
  const snapshots = records.filter((item) => item.description === INVESTIGATION_MARKER && item.mime_type === "application/json");
  const attachments = records.filter((item) => item.description !== INVESTIGATION_MARKER);
  const triage = useMemo(() => investigationTriage(caseData), [caseData]);

  const editCase = (change: Partial<ReturnType<typeof defaults>>) => {
    setCaseData((current) => ({ ...current, ...change }));
    setDirty(true); setNotice("");
  };
  const reset = () => {
    setCaseData(defaults()); setTarget(""); setDirty(false); setError(""); setNotice("");
    setTimelineType("observation"); setTimelineDescription(""); setTimelineActor("");
    setActionTitle(""); setActionOwner(""); setActionDate(""); setEvidenceToLink("");
  };
  useEffect(() => {
    let active = true;
    loadToken.current++;
    setEngagements([]); setEngagementId(""); reset(); setLoading(true);
    if (!userId) { setLoading(false); return () => { active = false; }; }
    void (async () => {
      const result = await supabase.from("pentest_engagements").select("*").eq("owner_id", userId)
        .order("updated_at", { ascending: false }).limit(100);
      if (!active) return;
      if (result.error) setError("Could not load owned engagements: " + result.error.message);
      else setEngagements(result.data || []);
      setLoading(false);
    })();
    return () => { active = false; loadToken.current++; };
  }, [userId]);

  const loadRecords = useCallback(async (id: string, offset = 0) => {
    if (!userId || !id) return;
    const token = ++loadToken.current;
    setLoadingRecords(true);
    const [evidenceResult, auditResult] = await Promise.all([
      supabase.from("pentest_evidence").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      offset === 0 ? supabase.from("pentest_audit_events").select("*").eq("owner_id", userId)
        .eq("engagement_id", id).order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (token !== loadToken.current) return;
    if (evidenceResult.error || auditResult.error) {
      if (offset === 0) { setRecords([]); setAudit([]); }
      setError("Private evidence or audit data could not be loaded: " +
        (evidenceResult.error?.message || auditResult.error?.message));
    } else {
      const data = evidenceResult.data || [];
      setRecords((current) => offset === 0 ? data : [
        ...current, ...data.filter((row) => !current.some((v) => v.id === row.id)),
      ]);
      if (offset === 0) setAudit(auditResult.data || []);
      setRecordsOffset(offset + data.length); setMoreRecords(data.length === PAGE_SIZE);
      setError("");
    }
    setLoadingRecords(false);
  }, [userId]);

  useEffect(() => {
    loadToken.current++;
    setRecords([]); setAudit([]); setRecordsOffset(0); setMoreRecords(false);
    setLoadingRecords(false);
    if (engagementId) void loadRecords(engagementId);
  }, [engagementId, loadRecords]);

  const chooseEngagement = (id: string) => {
    if (working) return;
    if (dirty && !window.confirm("Discard unsaved investigation changes and switch engagements?")) return;
    reset(); setEngagementId(id);
  };
  const addEvent = () => {
    if (caseData.timeline.length >= 100) { setError("A snapshot supports up to 100 events."); return; }
    if (!timelineDescription.trim()) { setError("Enter an event description."); return; }
    editCase({ timeline: [...caseData.timeline, {
      id: crypto.randomUUID(), occurredAt: new Date().toISOString(),
      type: timelineType, description: timelineDescription.trim(), actor: timelineActor.trim(),
    }] });
    setTimelineDescription(""); setError("");
  };
  const addAction = () => {
    if (caseData.actions.length >= 50) { setError("A snapshot supports up to 50 action items."); return; }
    if (!actionTitle.trim()) { setError("Enter an action description."); return; }
    editCase({ actions: [...caseData.actions, {
      id: crypto.randomUUID(), title: actionTitle.trim(), owner: actionOwner.trim(),
      dueDate: actionDate, status: "open",
    }] });
    setActionTitle(""); setActionOwner(""); setActionDate(""); setError("");
  };
  const knownEvidenceIds = new Set(attachments.map((item) => item.id));
  const linkEvidence = () => {
    if (!evidenceToLink || !knownEvidenceIds.has(evidenceToLink)) {
      setError("Choose existing private evidence from this engagement."); return;
    }
    if (caseData.evidenceIds.length >= 20) { setError("Up to 20 evidence links are supported."); return; }
    if (caseData.evidenceIds.includes(evidenceToLink)) { setError("Evidence is already linked."); return; }
    editCase({ evidenceIds: [...caseData.evidenceIds, evidenceToLink] });
    setEvidenceToLink(""); setError("");
  };

  const verifyEvidenceOwnership = async (ids: string[], id: string) => {
    if (!userId || !ids.length) return [];
    const result = await supabase.from("pentest_evidence").select("id")
      .eq("owner_id", userId).eq("engagement_id", id).in("id", ids).limit(20);
    if (result.error || !result.data || result.data.length !== ids.length ||
      new Set(result.data.map((row) => row.id)).size !== ids.length) {
      throw new Error("Not all private evidence links were found under this owned engagement.");
    }
    return result.data.map((row) => row.id);
  };
  const assemble = async () => {
    if (!selected || !userId) throw new Error("Choose a private engagement.");
    const ownedEvidence = await verifyEvidenceOwnership(caseData.evidenceIds, selected.id);
    return createInvestigation({ ...caseData, target }, selected, userId, ownedEvidence);
  };
  const save = async () => {
    if (!selected || !userId || !allowed || working || !dirty) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const snapshot = await assemble();
      const blob = new File([JSON.stringify(snapshot)], "security-investigation-" + crypto.randomUUID() + ".json", { type: "application/json" });
      if (blob.size < 1 || blob.size > INVESTIGATION_MAX_BYTES) throw new Error("Investigation snapshot is oversized.");
      const objectPath = userId + "/" + selected.id + "/" + crypto.randomUUID() + "-" + blob.name;
      const upload = await supabase.storage.from("pentest-evidence").upload(objectPath, blob, {
        contentType: "application/json", upsert: false,
      });
      if (upload.error) throw new Error("Private case upload failed: " + upload.error.message);
      const registered = await supabase.from("pentest_evidence").insert({
        owner_id: userId, engagement_id: selected.id, storage_path: objectPath,
        file_name: blob.name, mime_type: blob.type, file_size: blob.size, description: INVESTIGATION_MARKER,
      });
      if (registered.error) {
        const cleanup = await supabase.storage.from("pentest-evidence").remove([objectPath]);
        throw new Error("Case metadata registration failed: " + registered.error.message +
          (cleanup.error ? ". Unregistered object cleanup failed; contact support." : ". Unregistered object cleaned up."));
      }
      editCase({ createdAt: snapshot.createdAt });
      setDirty(false);
      setNotice("Private investigation version saved. A new version is needed for later edits.");
      await loadRecords(selected.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Investigation could not be saved."); }
    finally { setWorking(false); }
  };
  const restore = async (record: Evidence) => {
    if (!selected || !userId || working) return;
    if (dirty && !window.confirm("Discard unsaved edits and restore this private investigation version?")) return;
    if (record.owner_id !== userId || record.engagement_id !== selected.id ||
      record.description !== INVESTIGATION_MARKER || record.mime_type !== "application/json" ||
      record.file_size < 1 || record.file_size > INVESTIGATION_MAX_BYTES ||
      !record.storage_path.startsWith(userId + "/" + selected.id + "/")) {
      setError("Version metadata is not owned by this engagement."); return;
    }
    setWorking(true); setError(""); setNotice("");
    try {
      const download = await supabase.storage.from("pentest-evidence").download(record.storage_path);
      if (download.error || !download.data || download.data.size > INVESTIGATION_MAX_BYTES) {
        throw new Error("Private investigation file could not be downloaded safely.");
      }
      const parsed = parseInvestigation(await download.data.text(), selected, userId);
      await verifyEvidenceOwnership(parsed.evidenceIds, selected.id);
      setTarget(parsed.target);
      setCaseData({
        title: parsed.title, summary: parsed.summary, investigator: parsed.investigator,
        priority: parsed.priority, status: parsed.status, closureNote: parsed.closureNote,
        createdAt: parsed.createdAt, timeline: parsed.timeline, actions: parsed.actions,
        evidenceIds: parsed.evidenceIds,
      });
      setDirty(false); setNotice("Restored validated owner-scoped investigation from private storage.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Restore failed."); }
    finally { setWorking(false); }
  };
  const exportCase = async () => {
    if (!allowed || working) return;
    setWorking(true);
    try { downloadReport(investigationReport(await assemble())); setError(""); setNotice("Analyst investigation report exported."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Report export failed."); }
    finally { setWorking(false); }
  };

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4" />Cybersecurity Hub</Link>
    <header className="rounded-3xl border border-cyan-300/20 bg-card p-7"><div className="flex items-center gap-2 text-cyan-200"><ClipboardList className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 6</span></div>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Private Security Investigations</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Coordinate owner-scoped investigations, timelines, assigned tasks, private evidence and closure narratives. Snapshots are versioned in the existing private pentest evidence store; no new database migration is required.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link to="/cybersecurity/cases" className="text-cyan-300 underline">Assessment case workspace</Link><Link to="/cybersecurity/case-intelligence" className="text-cyan-300 underline">Review case versions</Link></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/25 p-4 text-sm text-cyan-200">{notice}</div>}
    <Card className="border-border bg-card"><CardHeader><CardTitle>1. Choose an attested private engagement</CardTitle><CardDescription>Only owned scope targets appear; an engagement attestation is user-provided, not independently verified testing permission.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="investigation-engagement">Engagement</Label><select id="investigation-engagement" value={engagementId} className={selectClass} disabled={working || loading} onChange={(event) => chooseEngagement(event.target.value)}><option value="">Select owned engagement</option>{engagements.map((e) => <option key={e.id} value={e.id}>{e.engagement_name} · {e.status}</option>)}</select>
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading private engagements…</p>}
        {!loading && !engagements.length && <p className="text-sm text-muted-foreground">No engagements found. <Link to="/black-hat-pentesting" className="text-cyan-300 underline">Create an engagement and attest scope</Link>.</p>}
        {selected && <p className="text-xs text-muted-foreground">{selected.scope_targets.length} declared targets · {selected.excluded_targets.length} exclusions. {engagementMaySaveCase(selected) ? "Owned scope available" : "Attested active scope required before saving"}</p>}
      </CardContent></Card>

    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>2. Investigation identity and scope</CardTitle><CardDescription>New versions can only be saved under a currently permitted and non-excluded declared target.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="investigation-target">Authorized target</Label><select id="investigation-target" className={selectClass} value={target} disabled={working} onChange={(event) => { if (dirty && !window.confirm("Discard current unsaved investigation to change target?")) return; reset(); setTarget(event.target.value); }}><option value="">Choose scoped target</option>{targets.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="investigation-title">Investigation title</Label><Input id="investigation-title" className={inputClass} maxLength={180} value={caseData.title} onChange={(e) => editCase({ title: e.target.value })}/></div>
      <div className="space-y-2"><Label htmlFor="investigation-lead">Lead investigator</Label><Input id="investigation-lead" className={inputClass} maxLength={120} value={caseData.investigator} onChange={(e) => editCase({ investigator: e.target.value })}/></div>
      <div className="space-y-2"><Label htmlFor="investigation-priority">Priority (analyst assigned)</Label><select id="investigation-priority" className={selectClass} value={caseData.priority} onChange={(e) => editCase({ priority: e.target.value })}>{INVESTIGATION_PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="investigation-status">Investigation status</Label><select id="investigation-status" className={selectClass} value={caseData.status} onChange={(e) => editCase({ status: e.target.value })}>{INVESTIGATION_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="investigation-summary">Summary / hypotheses</Label><Textarea id="investigation-summary" maxLength={4000} className={inputClass} value={caseData.summary} onChange={(e) => editCase({ summary: e.target.value })} placeholder="Analyst observation only; do not paste passwords or sensitive personal data." /></div>
    </CardContent></Card>}

    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>3. Investigation timeline</CardTitle><CardDescription>Up to 100 analyst-recorded events. History here is not an automatic SIEM feed or independently validated audit log.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="event-type">Event type</Label><select id="event-type" className={selectClass} value={timelineType} onChange={(e) => setTimelineType(e.target.value)}>{INVESTIGATION_EVENTS.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="event-actor">Actor / reporter</Label><Input id="event-actor" maxLength={120} className={inputClass} value={timelineActor} onChange={(e) => setTimelineActor(e.target.value)} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="event-details">Event narrative</Label><Textarea id="event-details" maxLength={2000} className={inputClass} value={timelineDescription} onChange={(e) => setTimelineDescription(e.target.value)} /></div></div>
      <Button disabled={working || !timelineDescription.trim() || caseData.timeline.length>=100} onClick={addEvent}><Plus className="mr-2 h-4 w-4"/>Add timeline event</Button>
      <div className="space-y-2">{caseData.timeline.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm"><div><p className="font-semibold">{item.type} · {new Date(item.occurredAt).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">Reporter: {item.actor || "Unassigned"}</p></div><Button variant="ghost" size="sm" aria-label={"Remove event " + item.id} disabled={working} onClick={() => editCase({ timeline: caseData.timeline.filter((x) => x.id !== item.id) })}><Trash2 className="h-4 w-4"/></Button></div>)}</div>
    </CardContent></Card>}

    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>4. Assigned response actions</CardTitle><CardDescription>Manage up to 50 tracked tasks and analyst-entered due dates. Outstanding actions must be completed or cancelled before closure.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="action-title">Action required</Label><Input id="action-title" className={inputClass} maxLength={180} value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="action-owner">Responsible person or team</Label><Input id="action-owner" className={inputClass} maxLength={120} value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="action-date">Due date</Label><Input id="action-date" type="date" className={inputClass} value={actionDate} onChange={(e) => setActionDate(e.target.value)} /></div></div>
      <Button disabled={working || !actionTitle.trim() || caseData.actions.length>=50} onClick={addAction}><Plus className="mr-2 h-4 w-4"/>Add action</Button>
      <p className="text-xs text-muted-foreground">Pending: {triage.pending} · Overdue by entered dates: {triage.overdue} · Done: {triage.complete}</p>
      <div className="space-y-2">{caseData.actions.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm"><div className="min-w-48 flex-1"><p className="font-semibold">{task.title}</p><p className="text-xs text-muted-foreground">Owner: {task.owner || "Unassigned"} · Due: {task.dueDate || "Unscheduled"}</p></div><select aria-label={"Status of action " + task.title} className={selectClass} disabled={working} value={task.status} onChange={(e) => editCase({ actions: caseData.actions.map((x) => x.id === task.id ? { ...x, status: e.target.value } : x) })}>{["open","in-progress","done","cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select><Button variant="ghost" size="sm" aria-label={"Remove action " + task.title} disabled={working} onClick={() => editCase({ actions: caseData.actions.filter((x) => x.id !== task.id) })}><Trash2 className="h-4 w-4"/></Button></div>)}</div>
    </CardContent></Card>}

    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>5. Link existing private evidence and document resolution</CardTitle><CardDescription>References are verified against private evidence metadata for this exact user and engagement before saving or restoring; files remain private.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-56 flex-1 space-y-2"><Label htmlFor="investigation-evidence">Owned evidence metadata</Label><select id="investigation-evidence" className={selectClass} value={evidenceToLink} onChange={(e) => setEvidenceToLink(e.target.value)}><option value="">Select private evidence</option>{attachments.map((item) => <option key={item.id} value={item.id}>{item.file_name} · {new Date(item.created_at).toLocaleString()}</option>)}</select></div><Button variant="outline" disabled={working || !evidenceToLink} onClick={linkEvidence}>Link evidence</Button></div>
      <div className="space-y-1">{caseData.evidenceIds.map((id) => <div key={id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{attachments.find((item) => item.id === id)?.file_name || "Private evidence " + id}</span><Button size="sm" variant="ghost" aria-label={"Unlink evidence " + id} onClick={() => editCase({ evidenceIds: caseData.evidenceIds.filter((value) => value !== id) })}><Trash2 className="h-4 w-4"/></Button></div>)}</div>
      <div className="space-y-2"><Label htmlFor="investigation-closure">Resolution / closure narrative</Label><Textarea id="investigation-closure" maxLength={4000} className={inputClass} value={caseData.closureNote} onChange={(e) => editCase({ closureNote: e.target.value })} placeholder="Resolved/closed requires a meaningful narrative, linked private evidence and a decision or retest event. This remains analyst-reported." /></div>
    </CardContent></Card>}

    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>6. Save, restore and export versioned investigations</CardTitle><CardDescription>Saving creates an immutable JSON object in the existing private evidence bucket and inserts owner-scoped audited metadata. There is no automatic detection, containment or shared editable case table.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2"><Button disabled={!allowed || working || !dirty} onClick={() => void save()}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}Save new private version</Button><Button variant="outline" disabled={!allowed || working} onClick={() => void exportCase()}><Download className="mr-2 h-4 w-4" />Export analyst report</Button><Button variant="outline" disabled={working || loadingRecords} onClick={() => void loadRecords(selected.id, 0)}><RefreshCw className="mr-2 h-4 w-4"/>Refresh records</Button></div>
      {!allowed && <p className="flex items-start gap-2 text-sm text-amber-200"><ShieldAlert className="h-4 w-4 shrink-0"/>Saving is disabled until an owned, attested, in-scope target is selected.</p>}
      {dirty && <p className="text-xs text-amber-200">Unsaved changes: create a new version to preserve them.</p>}
      <h3 className="text-sm font-semibold">Private investigation versions ({snapshots.length} loaded)</h3>
      {snapshots.length === 0 && <p className="text-sm text-muted-foreground">No saved investigations in the loaded history.</p>}
      <div className="space-y-2">{snapshots.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs"><div><p>{new Date(item.created_at).toLocaleString()} · {item.file_name}</p><p className="text-muted-foreground">{item.file_size} bytes · private owner-scoped snapshot</p></div><Button size="sm" variant="outline" disabled={working} onClick={() => void restore(item)}><FileClock className="mr-2 h-4 w-4"/>Restore</Button></div>)}</div>
      {moreRecords && <Button variant="outline" disabled={working || loadingRecords} onClick={() => void loadRecords(selected.id, recordsOffset)}>{loadingRecords ? "Loading..." : "Load older private evidence"}</Button>}
      {loadingRecords && <p role="status" className="text-xs text-muted-foreground">Loading private evidence history…</p>}
      <div className="rounded-lg border border-border bg-background p-4"><h3 className="text-sm font-semibold">Existing owner-scoped audit activity ({audit.length} recent records)</h3><div className="mt-2 space-y-1">{audit.slice(0,10).map((item) => <p key={item.id} className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()} · {item.event_type.replaceAll("_"," ")}</p>)}</div><Link to="/black-hat-pentesting" className="mt-2 inline-block text-xs text-cyan-300 underline">Open full engagement evidence panel</Link></div>
    </CardContent></Card>}

    <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-950/10 p-4 text-sm text-amber-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>Trust boundary: actual read/write authorization is enforced by existing Supabase owner RLS and private storage policies. Investigator notes, linked records, scope attestations and closure states are human-entered, not verified security outcomes. No live scans, alerts, automatic containment or remote execution are performed.</p>
  </div></main>;
}
