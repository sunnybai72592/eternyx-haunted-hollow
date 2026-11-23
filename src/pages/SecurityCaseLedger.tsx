import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ClipboardList, FileCheck2, FileClock, Loader2, LockKeyhole, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { SECURITY_LEDGER_TABLES, evaluateLedgerReadiness } from "@/lib/securityLedgerReadiness.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type Asset = {
  id: string; owner_id: string; engagement_id: string; target: string;
  steward: string; criticality: string; notes: string; created_at: string;
};
type Finding = {
  id: string; owner_id: string; engagement_id: string; asset_id: string;
  title: string; severity: string; evidence: string; recommendation: string;
  remediation_owner: string; status: string; due_date: string | null;
  retest_note: string; risk_acceptance_note: string; created_at: string;
};
type History = {
  id: string; owner_id: string; engagement_id: string; finding_id: string;
  event_type: string; previous_status: string | null; new_status: string | null;
  changed_fields: string[]; created_at: string;
};
type EvidenceLink = {
  id: string; owner_id: string; engagement_id: string;
  finding_id: string; evidence_id: string;
};
type LedgerTable = "security_case_assets" | "security_case_findings" | "security_case_finding_evidence" | "security_case_finding_history";

// Generated Supabase database types represent the currently deployed schema, not this
// staging-only proposal. The narrow adapter is intentionally isolated to this page.
// The server's RLS, composite FKs, and triggers must enforce authorization after rollout.
// Regenerate official Supabase types after the migration passes staging.
type LedgerBuilder = {
  select: (columns: string) => LedgerBuilder;
  eq: (column: string, value: string) => LedgerBuilder;
  order: (column: string, options: { ascending: boolean }) => LedgerBuilder;
  limit: (count: number) => LedgerBuilder;
  insert: (values: Record<string, unknown>) => LedgerBuilder;
  update: (values: Record<string, unknown>) => LedgerBuilder;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: (resolve: (value: { data: unknown; error: { message: string } | null }) => unknown) => Promise<unknown>;
};
type LedgerResponse = { data: unknown; error: { message: string } | null };
const ledger = (table: LedgerTable) =>
  (supabase as unknown as { from: (table: string) => LedgerBuilder }).from(table);
const control = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300";
const severity = ["low", "medium", "high", "critical"];
const statuses = ["open", "in-progress", "blocked", "verified", "accepted"];

export default function SecurityCaseLedger() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [links, setLinks] = useState<EvidenceLink[]>([]);
  const [backendReady, setBackendReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState("");
  const [steward, setSteward] = useState("");
  const [criticality, setCriticality] = useState("medium");
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [findingSeverity, setFindingSeverity] = useState("medium");
  const [observation, setObservation] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [remediationOwner, setRemediationOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [findingId, setFindingId] = useState("");
  const [newStatus, setNewStatus] = useState("in-progress");
  const [retestNote, setRetestNote] = useState("");
  const [riskNote, setRiskNote] = useState("");
  const [evidenceFindingId, setEvidenceFindingId] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const requestToken = useRef(0);
  const selected = engagements.find((item) => item.id === engagementId);
  const allowedTargets = useMemo(() => selected?.scope_targets.filter(
    (item) => !selected.excluded_targets.includes(item),
  ) ?? [], [selected]);
  const scoped = Boolean(selected?.authorization_attested &&
    selected.authorization_attested_at && selected.scope_targets.length > 0 &&
    ["authorized","in_progress","on_hold","completed"].includes(selected.status));
  const canWrite = backendReady && Boolean(userId && selected && scoped);
  const selectedAsset = assets.find((item) => item.id === assetId);
  const selectedFinding = findings.find((item) => item.id === findingId);
  const unresolved = findings.filter((item) =>
    ["open","in-progress","blocked"].includes(item.status));
  const scopeNote = "The owner attests written permission; ETERNYX does not independently verify testing authorization.";

  useEffect(() => {
    let valid = true;
    requestToken.current += 1;
    setEngagements([]); setEngagementId(""); setBackendReady(false);
    setAssets([]); setFindings([]); setHistory([]); setEvidence([]); setLinks([]);
    setLoading(true); setError(""); setNotice("");
    if (!userId) { setLoading(false); return () => { valid = false; }; }
    void (async () => {
      try {
        const probes = SECURITY_LEDGER_TABLES.map((table) =>
          ledger(table).select("id").eq("owner_id", userId).limit(1) as unknown as Promise<LedgerResponse>);
        const [existing, ...tableResults] = await Promise.all([
          supabase.from("pentest_engagements").select("*").eq("owner_id", userId)
            .order("updated_at", { ascending: false }).limit(100),
          ...probes,
        ]);
        if (!valid) return;
        const readiness = evaluateLedgerReadiness({
          userId, engagements: existing,
          tableResults: Object.fromEntries(SECURITY_LEDGER_TABLES.map((table, index) =>
            [table, tableResults[index]])),
        });
        if (readiness.ready) {
          setEngagements(existing.data || []);
          setBackendReady(true);
          setError("");
        } else {
          setEngagements([]);
          setBackendReady(false);
          setError("Schema not deployed or accessible. " + readiness.reason +
            " The indexed ledger is disabled; existing private case snapshots are still available.");
        }
      } catch {
        if (!valid) return;
        setBackendReady(false); setEngagements([]);
        setError("Schema not deployed or accessible. Database preflight failed. No ledger data is displayed.");
      } finally {
        if (valid) setLoading(false);
      }
    })();
    return () => { valid = false; requestToken.current += 1; };
  }, [userId]);

  const loadLedger = useCallback(async (id: string) => {
    if (!backendReady || !id || !userId) return;
    const token = ++requestToken.current;
    setLoadingRecords(true);
    const [assetsResult, findingsResult, historyResult, linksResult, evidenceResult] = await Promise.all([
      ledger("security_case_assets").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).limit(100) as unknown as Promise<LedgerResponse>,
      ledger("security_case_findings").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).limit(200) as unknown as Promise<LedgerResponse>,
      ledger("security_case_finding_history").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).limit(100) as unknown as Promise<LedgerResponse>,
      ledger("security_case_finding_evidence").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .limit(200) as unknown as Promise<LedgerResponse>,
      supabase.from("pentest_evidence").select("*").eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (token !== requestToken.current) return;
    const failure = [assetsResult, findingsResult, historyResult, linksResult, evidenceResult]
      .find((result) => result.error)?.error;
    if (failure) {
      // Fail closed: a partial set must not appear as a complete case.
      setAssets([]); setFindings([]); setHistory([]); setEvidence([]); setLinks([]);
      setError("Private ledger read failed. No partial records are presented: " + failure.message);
    } else {
      setAssets((assetsResult.data || []) as Asset[]);
      setFindings((findingsResult.data || []) as Finding[]);
      setHistory((historyResult.data || []) as History[]);
      setLinks((linksResult.data || []) as EvidenceLink[]);
      setEvidence(evidenceResult.data || []);
      setError("");
    }
    setLoadingRecords(false);
  }, [backendReady, userId]);

  useEffect(() => {
    requestToken.current += 1;
    setAssets([]); setFindings([]); setHistory([]); setEvidence([]); setLinks([]);
    setAssetId(""); setFindingId(""); setEvidenceFindingId("");
    setTarget(""); setEvidenceId(""); setNotice("");
    setLoadingRecords(false);
    if (engagementId && backendReady) void loadLedger(engagementId);
  }, [engagementId, backendReady, loadLedger]);

  const createAsset = async () => {
    if (!canWrite || !userId || !selected || busy) return;
    if (!target || !allowedTargets.includes(target) || !severity.includes(criticality)) {
      setError("Choose a currently authorized, non-excluded target and a valid criticality."); return;
    }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await (ledger("security_case_assets")
      .insert({ owner_id: userId, engagement_id: selected.id, target, steward: steward.trim(), criticality })
      .select("id") as unknown as Promise<LedgerResponse>);
    if (failure) setError("Asset not saved: " + failure.message);
    else {
      setNotice("Scoped asset saved in the indexed ledger. No target scan was run.");
      setTarget(""); setSteward("");
      await loadLedger(selected.id);
    }
    setBusy(false);
  };

  const addFinding = async () => {
    if (!canWrite || !userId || !selected || !selectedAsset || busy) return;
    if (title.trim().length < 3 || title.length > 180 || !severity.includes(findingSeverity)
      || observation.length > 4000 || recommendation.length > 4000 || remediationOwner.length > 120) {
      setError("Enter a valid bounded finding title, severity, observation and remediation details."); return;
    }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await (ledger("security_case_findings")
      .insert({
        owner_id: userId, engagement_id: selected.id, asset_id: selectedAsset.id,
        title: title.trim(), severity: findingSeverity,
        evidence: observation.trim(), recommendation: recommendation.trim(),
        remediation_owner: remediationOwner.trim(), status: "open", due_date: dueDate || null,
      }).select("id") as unknown as Promise<LedgerResponse>);
    if (failure) setError("Finding not saved: " + failure.message);
    else {
      setTitle(""); setObservation(""); setRecommendation(""); setDueDate("");
      setNotice("Finding recorded under its scoped asset. The database should append a creation history event.");
      await loadLedger(selected.id);
    }
    setBusy(false);
  };

  const updateFinding = async () => {
    if (!canWrite || !userId || !selected || !selectedFinding || busy) return;
    if (!statuses.includes(newStatus)) { setError("Invalid remediation status."); return; }
    if (newStatus === "verified" && (retestNote.trim().length < 12 || selectedFinding.evidence.trim().length < 10)) {
      setError("Verified status requires original observation evidence and a meaningful retest note."); return;
    }
    if (newStatus === "accepted" && riskNote.trim().length < 12) {
      setError("Accepted risk requires a documented risk-owner approval reference."); return;
    }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await (ledger("security_case_findings")
      .update({ status: newStatus, retest_note: retestNote.trim(), risk_acceptance_note: riskNote.trim() })
      .eq("id", selectedFinding.id).eq("owner_id", userId)
      .eq("engagement_id", selected.id) as unknown as Promise<LedgerResponse>);
    if (failure) setError("Remediation not saved: " + failure.message);
    else {
      setNotice("Remediation status saved. Its previous and new status should appear in trigger-written history.");
      setFindingId(""); setRetestNote(""); setRiskNote("");
      await loadLedger(selected.id);
    }
    setBusy(false);
  };

  const linkEvidence = async () => {
    if (!canWrite || !userId || !selected || busy) return;
    const chosenFinding = findings.find((item) => item.id === evidenceFindingId);
    const chosenEvidence = evidence.find((item) => item.id === evidenceId);
    if (!chosenFinding || !chosenEvidence || chosenFinding.owner_id !== userId ||
      chosenEvidence.owner_id !== userId ||
      chosenFinding.engagement_id !== selected.id || chosenEvidence.engagement_id !== selected.id) {
      setError("Only evidence and findings from this owned engagement may be linked."); return;
    }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await (ledger("security_case_finding_evidence")
      .insert({ owner_id: userId, engagement_id: selected.id, finding_id: chosenFinding.id,
        evidence_id: chosenEvidence.id }).select("id") as unknown as Promise<LedgerResponse>);
    if (failure) setError("Evidence reference was not saved: " + failure.message);
    else {
      setEvidenceFindingId(""); setEvidenceId("");
      setNotice("Private evidence metadata linked to the finding. No public URL was created.");
      await loadLedger(selected.id);
    }
    setBusy(false);
  };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4" />Cybersecurity Hub</Link>
      <header className="rounded-3xl border border-cyan-300/20 bg-card p-7">
        <div className="flex items-center gap-2 text-cyan-200"><ClipboardList className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 4</span></div>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Indexed Security Case Ledger</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Relational assets, actionable findings, private evidence references and trigger-written remediation history. This workspace is disabled until its reviewed schema is deployed and authorized.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link to="/cybersecurity/cases" className="text-cyan-300 underline">Use existing private case snapshots</Link><Link to="/cybersecurity/case-intelligence" className="text-cyan-300 underline">Review version history</Link></div>
      </header>

      {loading && <p role="status" className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Checking indexed backend and owner access…</p>}
      {!loading && !backendReady && <div role="alert" className="rounded-xl border border-amber-300/30 bg-amber-950/15 p-5 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5"/>Schema not deployed or accessible</div>
        <p className="mt-2">Indexed case writes and results are disabled. The proposed SQL requires review and staging verification before production deployment. No fake asset list, findings or success state is shown.</p>
        <Link to="/cybersecurity/cases" className="mt-3 inline-block text-cyan-300 underline">Continue with existing private cases</Link>
      </div>}
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/15 p-4 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="rounded-xl border border-cyan-300/20 p-4 text-sm text-cyan-200">{notice}</p>}

      {backendReady && <Card className="border-border bg-card"><CardHeader><CardTitle>1. Owned engagement and declared scope</CardTitle><CardDescription>{scopeNote}</CardDescription></CardHeader><CardContent className="space-y-3">
        <Label htmlFor="ledger-engagement">Your private engagement</Label>
        <select id="ledger-engagement" className={control} value={engagementId} disabled={busy} onChange={(event) => setEngagementId(event.target.value)}>
          <option value="">Choose engagement</option>{engagements.map((item) => <option key={item.id} value={item.id}>{item.engagement_name} · {item.status}</option>)}
        </select>
        {selected && <p className="text-xs text-muted-foreground">{selected.scope_targets.length} declared targets · {selected.excluded_targets.length} exclusions. {scoped ? "Writes require current exact scope validation on the server." : "Attestation or permitted lifecycle is missing: no writes allowed."}</p>}
        {selected && <Button size="sm" variant="outline" disabled={loadingRecords || busy} onClick={() => void loadLedger(selected.id)}><RefreshCcw className="mr-2 h-4 w-4" />Refresh private records</Button>}
        {loadingRecords && <p role="status" className="text-xs text-muted-foreground">Loading owned assets, findings, evidence and history…</p>}
      </CardContent></Card>}

      {canWrite && <Card className="border-border bg-card"><CardHeader><CardTitle>2. Register an in-scope asset</CardTitle><CardDescription>Only exact currently authorized and non-excluded targets appear. No discovery or active network request is made.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-target">Declared scope target</Label><select id="ledger-target" className={control} value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose declared target</option>{allowedTargets.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="ledger-steward">Asset owner/team</Label><Input id="ledger-steward" maxLength={120} value={steward} onChange={(event) => setSteward(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="ledger-criticality">Criticality (analyst assigned)</Label><select id="ledger-criticality" className={control} value={criticality} onChange={(event) => setCriticality(event.target.value)}>{severity.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="sm:col-span-2"><Button disabled={busy || !target} onClick={() => void createAsset()}><Plus className="mr-2 h-4 w-4" />Save scoped asset</Button></div>
      </CardContent></Card>}

      {selected && backendReady && <Card className="border-border bg-card"><CardHeader><CardTitle>3. Indexed assets and findings</CardTitle><CardDescription>{assets.length} assets loaded · {findings.length} findings loaded · {unresolved.length} unresolved (analyst status, not independently validated).</CardDescription></CardHeader><CardContent className="space-y-4">
        {!assets.length && <p className="text-sm text-muted-foreground">No indexed asset records were returned for this engagement. Existing JSON snapshots are separate and have not been backfilled.</p>}
        {assets.map((asset) => <div key={asset.id} className="rounded-xl border border-border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{asset.target}</h3><p className="mt-1 text-xs text-muted-foreground">Steward: {asset.steward || "Unassigned"} · Criticality: {asset.criticality}</p></div><span className="text-xs text-muted-foreground">{findings.filter((item) => item.asset_id === asset.id).length} findings</span></div>
          {findings.filter((item) => item.asset_id === asset.id).map((finding) => <div key={finding.id} className="mt-3 rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{finding.title}</p><span className="text-xs text-muted-foreground">{finding.severity.toUpperCase()} · {finding.status}</span></div><p className="mt-1 text-xs text-muted-foreground">Owner: {finding.remediation_owner || "Unassigned"} · Deadline: {finding.due_date || "None"}</p><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{finding.evidence || "No observation text"}</p><p className="mt-2 text-xs text-muted-foreground">Linked private evidence records: {links.filter((link) => link.finding_id === finding.id).length}</p></div>)}
        </div>)}
      </CardContent></Card>}

      {canWrite && <Card className="border-border bg-card"><CardHeader><CardTitle>4. Add an analyst finding</CardTitle><CardDescription>Findings are saved under the selected owned asset. Server triggers enforce current scope and record a creation event.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-asset">Asset</Label><select id="ledger-asset" value={assetId} className={control} onChange={(event) => setAssetId(event.target.value)}><option value="">Choose indexed asset</option>{assets.map((item) => <option key={item.id} value={item.id}>{item.target}</option>)}</select></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-title">Finding title</Label><Input id="ledger-title" value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="ledger-severity">Analyst severity</Label><select id="ledger-severity" value={findingSeverity} className={control} onChange={(event) => setFindingSeverity(event.target.value)}>{severity.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="ledger-owner">Remediation owner</Label><Input id="ledger-owner" maxLength={120} value={remediationOwner} onChange={(event) => setRemediationOwner(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-evidence">Observed condition (do not paste secrets)</Label><Textarea id="ledger-evidence" maxLength={4000} value={observation} onChange={(event) => setObservation(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-recommendation">Recommended remediation</Label><Textarea id="ledger-recommendation" maxLength={4000} value={recommendation} onChange={(event) => setRecommendation(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="ledger-due">Due date</Label><Input type="date" id="ledger-due" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
        <div className="sm:col-span-2"><Button disabled={busy || !assetId || !title.trim()} onClick={() => void addFinding()}><FileCheck2 className="mr-2 h-4 w-4" />Register finding</Button></div>
      </CardContent></Card>}

      {canWrite && <Card className="border-border bg-card"><CardHeader><CardTitle>5. Record remediation and retest</CardTitle><CardDescription>Verified requires original observation and a retest note. Accepted requires a documented risk-owner approval reference. These remain user assertions.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-finding">Owned finding</Label><select id="ledger-finding" className={control} value={findingId} onChange={(event) => { setFindingId(event.target.value); setNewStatus("in-progress"); setRetestNote(""); setRiskNote(""); }}><option value="">Choose a finding</option>{findings.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="ledger-new-status">New status</Label><select id="ledger-new-status" className={control} value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-retest">Retest evidence narrative</Label><Textarea id="ledger-retest" maxLength={2000} value={retestNote} onChange={(event) => setRetestNote(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="ledger-risk">Risk owner approval reference</Label><Textarea id="ledger-risk" maxLength={2000} value={riskNote} onChange={(event) => setRiskNote(event.target.value)} /></div>
        <div className="sm:col-span-2"><Button disabled={busy || !findingId} onClick={() => void updateFinding()}><ShieldCheck className="mr-2 h-4 w-4" />Save remediation state</Button></div>
      </CardContent></Card>}

      {canWrite && <Card className="border-border bg-card"><CardHeader><CardTitle>6. Link existing private evidence</CardTitle><CardDescription>Evidence links refer only to existing metadata in the same owner's private engagement. No public storage URL is created.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="ledger-evidence-finding">Finding</Label><select id="ledger-evidence-finding" className={control} value={evidenceFindingId} onChange={(event) => setEvidenceFindingId(event.target.value)}><option value="">Choose finding</option>{findings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="ledger-evidence-record">Private evidence</Label><select id="ledger-evidence-record" className={control} value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Choose uploaded evidence</option>{evidence.map((item) => <option key={item.id} value={item.id}>{item.file_name}</option>)}</select></div>
        <div className="sm:col-span-2"><Button disabled={busy || !evidenceFindingId || !evidenceId} onClick={() => void linkEvidence()}><LockKeyhole className="mr-2 h-4 w-4" />Link private evidence metadata</Button></div>
      </CardContent></Card>}

      {selected && backendReady && <Card className="border-border bg-card"><CardHeader><CardTitle>7. Trigger-written audit history</CardTitle><CardDescription>History rows are read-only for application users. They record changed field names and status transitions, not full evidence bodies.</CardDescription></CardHeader><CardContent className="space-y-2">
        {!history.length && <p className="text-sm text-muted-foreground">No indexed finding history returned for this engagement.</p>}
        {history.map((item) => <div key={item.id} className="rounded-lg border border-border bg-background p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold"><FileClock className="h-4 w-4" />{item.event_type.replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></div><p className="mt-1 text-muted-foreground">Finding: {item.finding_id} · Status: {item.previous_status || "new"} → {item.new_status || "unchanged"}</p><p className="mt-1 text-muted-foreground">Changed fields: {item.changed_fields.join(", ") || "None"}</p></div>)}
        <p className="text-xs text-muted-foreground">Most recent 100 events are displayed; full server-side pagination is a subsequent release task.</p>
      </CardContent></Card>}

      <p className="rounded-xl border border-amber-300/20 bg-amber-950/10 p-4 text-sm text-amber-100">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        Deployment and trust boundary: the proposed relational schema is not yet applied or staging-verified. Once deployed, Supabase RLS, scoped database triggers and owner-composite foreign keys must enforce data boundaries. There is no live scanning, permission issuance, risk certification, automated remediation or SOC monitoring.
      </p>
    </div>
  </main>;
}
