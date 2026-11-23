import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileClock, Fingerprint, Loader2, RefreshCw, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engagementMaySaveCase } from "@/lib/securityCaseSnapshot.mjs";
import { INVESTIGATION_MARKER } from "@/lib/securityInvestigationUtils.mjs";
import { inspectUnifiedEvidence, validateUnifiedCaseDownload } from "@/lib/securityUnifiedCases.mjs";
import {
  validatePrivateEvidenceMetadata, normalizeExpectedSha256,
  hashOwnedEvidenceBytes, verifyInvestigationReferences,
  createProvenanceManifest, MAX_VERIFIED_RECORDS,
} from "@/lib/securityEvidenceProvenance.mjs";

type Engagement = Database["public"]["Tables"]["pentest_engagements"]["Row"];
type Evidence = Database["public"]["Tables"]["pentest_evidence"]["Row"];
type AuditEvent = Database["public"]["Tables"]["pentest_audit_events"]["Row"];
type Hashed = Awaited<ReturnType<typeof hashOwnedEvidenceBytes>>;
type Referenced = ReturnType<typeof verifyInvestigationReferences>;
const PAGE_SIZE = 30;
const selectClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground";
const MAX_REFERENCES = 20;

function downloadPrivateJson(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], {
    type: "application/json;charset=utf-8",
  }));
  const anchor = document.createElement("a");
  anchor.download = "eternyx-evidence-provenance-manifest.json";
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SecurityEvidenceProvenance() {
  const userId = useAuthStore((state) => state.user?.id);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [metadata, setMetadata] = useState<Evidence[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expectedDigests, setExpectedDigests] = useState<Record<string, string>>({});
  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, Hashed>>({});
  const [references, setReferences] = useState<Record<string, Referenced>>({});
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const loadToken = useRef(0);
  const reviewToken = useRef(0);
  const selected = useMemo(() => engagements.find((e) => e.id === engagementId), [engagements, engagementId]);
  const canReview = Boolean(userId && selected && selected.owner_id === userId &&
    engagementMaySaveCase(selected));
  const candidates = metadata.filter((row) => {
    const match = (row.file_name + " " + row.mime_type + " " + row.created_at)
      .toLowerCase().includes(search.trim().toLowerCase());
    if (!match) return false;
    if (filter === "investigations") return row.description === INVESTIGATION_MARKER && row.mime_type === "application/json";
    if (filter === "images") return row.mime_type.startsWith("image/");
    if (filter === "documents") return row.mime_type === "application/pdf" || row.mime_type === "text/plain" || row.mime_type === "text/csv";
    return true;
  });
  const hashed = Object.values(checks);
  const traceable = metadata.filter((row) => row.description === INVESTIGATION_MARKER && row.mime_type === "application/json");
  const hashedIds = useMemo(() => new Set(Object.keys(checks)), [checks]);
  const mismatchCount = hashed.filter((item) =>
    item.comparison.baseline === "mismatch" || item.comparison.expected === "mismatch").length;

  useEffect(() => {
    let active = true;
    loadToken.current++; reviewToken.current++;
    setLoading(true); setEngagements([]); setEngagementId("");
    setMetadata([]); setAudit([]); setChecks({}); setBaselines({}); setReferences({});
    setExpectedDigests({}); setRecordErrors({}); setError(""); setNotice("");
    if (!userId) { setLoading(false); return () => { active = false; }; }
    void (async () => {
      const result = await supabase.from("pentest_engagements").select("*").eq("owner_id", userId)
        .order("updated_at", { ascending: false }).limit(100);
      if (!active) return;
      if (result.error) setError("Owned engagements could not be loaded: " + result.error.message);
      else setEngagements(result.data || []);
      setLoading(false);
    })();
    return () => { active = false; loadToken.current++; reviewToken.current++; };
  }, [userId]);

  const loadEvidence = useCallback(async (id: string, start = 0) => {
    if (!userId || !id) return;
    const token = ++loadToken.current;
    setLoadingRows(true);
    const [evidence, events] = await Promise.all([
      supabase.from("pentest_evidence").select("*").eq("owner_id", userId)
        .eq("engagement_id", id).order("created_at", { ascending: false })
        .order("id", { ascending: false }).range(start, start + PAGE_SIZE - 1),
      start === 0 ? supabase.from("pentest_audit_events").select("*")
        .eq("owner_id", userId).eq("engagement_id", id)
        .order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (token !== loadToken.current) return;
    if (evidence.error || events.error) {
      if (start === 0) { setMetadata([]); setAudit([]); }
      setError("Private evidence metadata or audit is not accessible: " +
        (evidence.error?.message || events.error?.message));
    } else {
      const rows = evidence.data || [];
      setMetadata((prev) => start === 0 ? rows :
        [...prev, ...rows.filter((row) => !prev.some((old) => old.id === row.id))]);
      if (start === 0) setAudit(events.data || []);
      setOffset(start + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
      setError("");
    }
    setLoadingRows(false);
  }, [userId]);

  useEffect(() => {
    loadToken.current++; reviewToken.current++;
    setMetadata([]); setAudit([]); setChecks({}); setBaselines({});
    setReferences({}); setExpectedDigests({}); setRecordErrors({});
    setOffset(0); setHasMore(false); setLoadingRows(false); setBusy(false);
    setNotice(""); setError(""); setSearch(""); setFilter("all");
    if (engagementId) void loadEvidence(engagementId);
  }, [engagementId, loadEvidence]);

  const verify = async (record: Evidence) => {
    if (!userId || !selected || !canReview || busy ||
        (!checks[record.id] && Object.keys(checks).length >= MAX_VERIFIED_RECORDS)) return;
    const token = ++reviewToken.current;
    const owner = userId;
    const engagement = selected;
    setBusy(true); setError(""); setNotice("");
    try {
      const expected = normalizeExpectedSha256(expectedDigests[record.id]);
      const meta = validatePrivateEvidenceMetadata(record, engagement, owner);
      const result = await supabase.storage.from("pentest-evidence").download(meta.objectPath);
      if (result.error || !result.data) throw new Error("Private evidence object cannot be downloaded.");
      if (result.data.size !== meta.size) throw new Error("Downloaded bytes differ from registered metadata size.");
      const byteBuffer = await result.data.arrayBuffer();
      const observation = await hashOwnedEvidenceBytes(byteBuffer, record, engagement, owner, {
        baseline: baselines[record.id] || null, expected, observedAt: new Date().toISOString(),
      });
      if (token !== reviewToken.current) return;
      setBaselines((prev) => prev[record.id] ? prev : { ...prev, [record.id]: observation.sha256 });
      setChecks((prev) => ({ ...prev, [record.id]: observation }));
      setRecordErrors((prev) => { const next = { ...prev }; delete next[record.id]; return next; });
      setNotice("Private bytes hashed locally with SHA-256. This is an observation, not independent custody attestation.");
    } catch (problem) {
      if (token !== reviewToken.current) return;
      setChecks((prev) => { const next = { ...prev }; delete next[record.id]; return next; });
      setRecordErrors((prev) => ({ ...prev, [record.id]: problem instanceof Error ? problem.message : "Evidence verification failed." }));
    } finally {
      if (token === reviewToken.current) setBusy(false);
    }
  };

  const trace = async (record: Evidence) => {
    if (!userId || !selected || !canReview || busy) return;
    const owner = userId, engagement = selected, token = ++reviewToken.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const meta = inspectUnifiedEvidence(record, engagement, owner);
      if (!meta || meta.kind !== "investigation") throw new Error("Choose a registered private investigation snapshot.");
      const result = await supabase.storage.from("pentest-evidence").download(meta.path);
      if (result.error || !result.data || result.data.size !== record.file_size ||
          result.data.size > meta.maxBytes) {
        throw new Error("Investigation snapshot is unavailable or has an invalid size.");
      }
      const raw = await result.data.text();
      const parsed = validateUnifiedCaseDownload(raw, record, engagement, owner);
      if (parsed.kind !== "investigation") throw new Error("Not a validated investigation snapshot.");
      if (parsed.snapshot.evidenceIds.length > MAX_REFERENCES) throw new Error("Too many private evidence references.");
      const verification = parsed.snapshot.evidenceIds.length ?
        await supabase.from("pentest_evidence").select("*")
          .eq("owner_id", owner).eq("engagement_id", engagement.id)
          .in("id", parsed.snapshot.evidenceIds).limit(MAX_REFERENCES)
        : { data: [] as Evidence[], error: null };
      if (verification.error || !verification.data) throw new Error("Referenced private metadata could not be verified.");
      const reference = verifyInvestigationReferences(raw, record, engagement, owner, verification.data);
      if (token !== reviewToken.current) return;
      setReferences((prev) => ({ ...prev, [record.id]: reference }));
      setRecordErrors((prev) => { const next = { ...prev }; delete next[record.id]; return next; });
      setNotice("Investigation references verified against owned metadata. File bytes require separate hashing.");
    } catch (problem) {
      if (token !== reviewToken.current) return;
      setReferences((prev) => { const next = { ...prev }; delete next[record.id]; return next; });
      setRecordErrors((prev) => ({ ...prev, [record.id]: problem instanceof Error ? problem.message : "Investigation reference tracing failed." }));
    } finally {
      if (token === reviewToken.current) setBusy(false);
    }
  };

  const refresh = () => {
    if (!selected || busy) return;
    reviewToken.current++;
    setChecks({}); setReferences({}); setRecordErrors({});
    setNotice("Cleared current verification results. Session baselines remain for explicit repeat-download comparisons.");
    void loadEvidence(selected.id, 0);
  };

  const exportManifest = () => {
    if (!userId || !selected || !canReview || !hashed.length || busy) return;
    try {
      const manifest = createProvenanceManifest(selected, userId, hashed, Object.values(references));
      downloadPrivateJson(manifest);
      setNotice("Session-only JSON provenance manifest exported. No server signature or trusted original hash was created.");
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Private manifest could not be exported.");
    }
  };

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>Cybersecurity Hub</Link>
    <header className="rounded-3xl border border-cyan-300/20 bg-card p-7">
      <div className="flex items-center gap-2 text-cyan-200"><Fingerprint className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 8</span></div>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Private Evidence Provenance</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Download private evidence with owner-scoped authorization, hash the actual bytes locally using SHA-256, compare repeated observations, verify investigation links and export a confidentiality-conscious manifest.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link to="/cybersecurity/unified-cases" className="text-cyan-300 underline">Unified private cases</Link><Link to="/cybersecurity/investigations" className="text-cyan-300 underline">Investigation editor</Link><Link to="/black-hat-pentesting" className="text-cyan-300 underline">Private evidence upload</Link></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/30 p-4 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/25 p-4 text-sm text-cyan-200">{notice}</div>}
    <Card className="border-border bg-card"><CardHeader><CardTitle>1. Choose an owned, attested engagement</CardTitle><CardDescription>Existing RLS and private Storage policies enforce server-side access. No public file URLs are generated.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="provenance-engagement">Owned engagement</Label>
      <select id="provenance-engagement" className={selectClass} value={engagementId} disabled={busy || loading} onChange={(e) => setEngagementId(e.target.value)}>
        <option value="">Select a private engagement</option>{engagements.map((item) => <option key={item.id} value={item.id}>{item.engagement_name} · {item.status}</option>)}
      </select>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading owned engagements…</p>}
      {selected && <p className="text-xs text-muted-foreground">Declared targets: {selected.scope_targets.length} · Exclusions: {selected.excluded_targets.length} · {canReview ? "Attested scope available" : "Case verification disabled: valid attestation/scope required"}</p>}
    </CardContent></Card>
    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>2. Inspect real private evidence</CardTitle><CardDescription>Hashes are computed only after an explicit private download. First observation becomes an in-memory baseline; repeat checks may expose changed bytes but cannot prove malicious modification.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="provenance-filter">Evidence category</Label><select id="provenance-filter" className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All supported evidence</option><option value="investigations">Investigation snapshots</option><option value="images">Images</option><option value="documents">Documents and text</option></select></div>
        <div className="space-y-2"><Label htmlFor="provenance-search">Search metadata</Label><Input id="provenance-search" placeholder="Private filename or date" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy || loadingRows} onClick={refresh}><RefreshCw className="mr-2 h-4 w-4"/>Refresh private metadata</Button>
        <p className="text-xs text-muted-foreground">{metadata.length} records loaded · {hashed.length} locally hashed · {mismatchCount} mismatched comparisons · {traceable.length} investigation snapshots loaded</p>
      </div>
      {!canReview && <p className="flex items-start gap-2 text-sm text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>Attested, owned and currently valid scope is required before private content review.</p>}
      {!candidates.length && !loadingRows && <p className="text-sm text-muted-foreground">No matching private evidence metadata in the currently loaded pages.</p>}
      <div className="space-y-3">{candidates.map((record) => <div key={record.id} className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-all text-sm font-semibold">{record.file_name}</h3><p className="mt-1 text-xs text-muted-foreground">{record.mime_type} · {record.file_size} bytes · {new Date(record.created_at).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Metadata ID: {record.id}</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!canReview || busy || (!checks[record.id] && hashed.length >= MAX_VERIFIED_RECORDS)} onClick={() => void verify(record)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Fingerprint className="mr-2 h-4 w-4"/>}{checks[record.id] ? "Re-download and compare" : "Download and hash"}</Button>
          {record.description === INVESTIGATION_MARKER && <Button size="sm" variant="outline" disabled={!canReview || busy} onClick={() => void trace(record)}>Trace linked evidence</Button>}</div>
        </div>
        <div className="mt-3 max-w-xl space-y-2"><Label htmlFor={"expected-"+record.id}>Optional independently obtained expected SHA-256</Label><Input id={"expected-"+record.id} value={expectedDigests[record.id] || ""} onChange={(e) => setExpectedDigests((old) => ({ ...old, [record.id]: e.target.value }))} maxLength={64} placeholder="64 hexadecimal characters; blank means no trusted baseline" /></div>
        {checks[record.id] && <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-xs">
          <p className="flex items-center gap-2 text-cyan-200"><CheckCircle2 className="h-4 w-4"/>SHA-256 calculated for downloaded bytes · {checks[record.id].size} bytes · {new Date(checks[record.id].observedAt).toLocaleString()}</p>
          <p className="break-all font-mono text-foreground">{checks[record.id].sha256}</p>
          <p className="text-muted-foreground">Session baseline: {checks[record.id].comparison.baseline} · Operator-provided checksum: {checks[record.id].comparison.expected}</p>
          {(checks[record.id].comparison.baseline === "mismatch" || checks[record.id].comparison.expected === "mismatch") &&
            <p role="alert" className="flex items-start gap-2 text-rose-200"><ShieldX className="h-4 w-4 shrink-0"/>Hash differs from one of the comparison values. Check the bytes, source and reference; this alone does not prove tampering.</p>}
        </div>}
        {references[record.id] && <div className="mt-3 space-y-1 rounded-lg border border-border p-3 text-xs">
          <p className="font-semibold text-cyan-200">Owner-scoped investigation metadata references verified</p>
          <p className="text-muted-foreground">{references[record.id].referencedIds.length} evidence IDs referenced · {references[record.id].referencedIds.filter((id) => hashedIds.has(id)).length} independently downloaded and hashed in this session</p>
          {references[record.id].referencedIds.map((id) => <p key={id} className="break-all text-muted-foreground">{id} · {hashedIds.has(id) ? "Local SHA-256 observation recorded" : "Content not hashed in this session"}</p>)}
        </div>}
        {recordErrors[record.id] && <p role="alert" className="mt-2 text-xs text-rose-200">Verification unavailable: {recordErrors[record.id]}</p>}
      </div>)}</div>
      {hasMore && <Button variant="outline" disabled={busy || loadingRows} onClick={() => void loadEvidence(selected.id, offset)}>{loadingRows ? "Loading…" : "Load older private evidence"}</Button>}
      {loadingRows && <p role="status" className="text-xs text-muted-foreground">Loading private evidence rows…</p>}
    </CardContent></Card>}
    {selected && <Card className="border-border bg-card"><CardHeader><CardTitle>3. Export locally observed provenance</CardTitle><CardDescription>Export is a local JSON manifest of observed SHA-256 hashes, byte counts and references. It is not signed or trusted original custody documentation.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">{[
        { label: "Evidence objects hashed", value: hashed.length },
        { label: "Checksum mismatches", value: mismatchCount },
        { label: "Investigations with references checked", value: Object.keys(references).length },
      ].map((item) => <div key={item.label} className="rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></div>)}</div>
      <Button variant="outline" disabled={!canReview || !hashed.length || busy} onClick={exportManifest}><Download className="mr-2 h-4 w-4"/>Export private JSON manifest</Button>
      <p className="text-xs text-muted-foreground">No storage object paths, filenames, raw case narratives or evidence bytes are included. The file contains identifiers and hashes, so handle it as confidential.</p>
      <h3 className="text-sm font-semibold">Recent existing evidence audit metadata</h3>
      {!audit.length && <p className="text-sm text-muted-foreground">No audit events are available in the loaded history.</p>}
      <div className="space-y-1">{audit.map((item) => <p key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground"><FileClock className="h-4 w-4 shrink-0"/>{new Date(item.created_at).toLocaleString()} · {item.event_type.replaceAll("_"," ")}</p>)}</div>
    </CardContent></Card>}
    <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-950/10 p-4 text-sm text-amber-100"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0"/>Integrity boundary: browser SHA-256 comparisons do not prove who authored a file, whether the original bytes were genuine, legal chain of custody, or absence of compromise. This screen performs no public scanning, alerting, containment, remote execution or database mutation.</p>
  </div></main>;
}
