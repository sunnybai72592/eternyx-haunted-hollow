import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCircle2, ClipboardCheck, Download, FileSearch, FolderOpen, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildWorkspaceRecoveryReport, recoveryIntegrityState, recoverySafetyWarnings } from "@/lib/workspaceRecoveryProtection.mjs";
import {
  WORKSPACE_RECOVERY_PAGE_SIZE, workspaceRecoveryCanFinalize,
  workspaceRecoveryCanPrepare, workspaceRecoveryMetrics,
  workspaceRecoveryPhase, workspaceRecoveryWarnings,
} from "@/lib/workspaceRecoveryReview.mjs";

type Session = Database["public"]["Tables"]["workspace_import_sessions"]["Row"];
type Project = Database["public"]["Tables"]["workspace_projects"]["Row"];
type Inspection = {
  session_id: string; project_id: string; project_name: string;
  project_status: string; status: string; source_version: number;
  expected_tasks: number; expected_steps: number; expected_items: number; expected_files: number;
  committed_tasks: number; committed_steps: number; committed_items: number; committed_files: number;
  actual_tasks: number; actual_steps: number; actual_items: number;
  stored_objects: number; file_claims: number; pending_uploads: number;
  missing_registered_files: number; unclaimed_objects: number;
  receipt_counts_match: boolean; can_prepare_discard: boolean; can_finalize_discard: boolean;
};

type Integrity = {
  session_id: string; project_id: string; status: string;
  baseline_known: boolean; content_matches: boolean;
  checkpoint_at: string | null; held_at: string | null; hold_reason: string;
};
type Props = {
  owner: string; disabled: boolean; projects: Project[];
  refreshKey: number;
  onOpen: (projectId: string) => void;
  onCheckpoint: (projectId: string) => void;
  onResume: (fingerprint: string) => void;
  onFork: (target: { sessionId: string; sourceHash: string;
    projectId: string; projectName: string }) => void;
  onDiscarded: () => void;
};

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to review this import";

const rowsQuery = (owner: string, start: number) =>
  supabase.from("workspace_import_sessions")
    .select("*").eq("owner_id", owner)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + WORKSPACE_RECOVERY_PAGE_SIZE - 1);

export default function WorkspaceRecoveryCenter({
  owner, disabled, projects, refreshKey, onOpen, onCheckpoint, onResume, onFork, onDiscarded,
}: Props) {
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const ticket = useRef(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"all" | "active" | "held" | "complete" | "discarding">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++ticket.current;
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await rowsQuery(owner, 0);
      if (queryError) throw new Error(queryError.message);
      if (currentOwner.current !== owner || ticket.current !== sequence) return;
      setSessions((data ?? []) as Session[]);
      setHasMore((data?.length ?? 0) === WORKSPACE_RECOVERY_PAGE_SIZE);
    } catch (failure) {
      if (currentOwner.current === owner && ticket.current === sequence) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === owner && ticket.current === sequence) setLoading(false);
    }
  }, [owner]);

  // Switching accounts clears private data immediately. A same-owner refresh
  // keeps the chosen inspection and confirmation state visible.
  useEffect(() => {
    setSessions([]);
    setHasMore(false);
    setSelectedId(null);
    setInspection(null);
    setIntegrity(null);
    setNotice("");
  }, [owner]);
  useEffect(() => {
    void refresh();
  }, [owner, refreshKey, refresh]);

  const loadMore = async () => {
    if (busy || loading || !hasMore) return;
    setLoading(true);
    setError("");
    const requestedOwner = owner;
    try {
      const { data, error: queryError } = await rowsQuery(owner, sessions.length);
      if (queryError) throw new Error(queryError.message);
      if (currentOwner.current !== requestedOwner) return;
      setSessions(old => [...old, ...((data ?? []) as Session[])]);
      setHasMore((data?.length ?? 0) === WORKSPACE_RECOVERY_PAGE_SIZE);
    } catch (failure) {
      if (currentOwner.current === requestedOwner) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === requestedOwner) setLoading(false);
    }
  };

  const inspect = useCallback(async (sessionId: string) => {
    setError("");
    setInspection(null);
    setIntegrity(null);
    setSelectedId(sessionId);
    setLoading(true);
    const requestedOwner = owner;
    try {
      const [snapshot, checkpoint] = await Promise.all([
        supabase.rpc("workspace_import_inspect", { p_session_id: sessionId }),
        supabase.rpc("workspace_import_integrity", { p_session_id: sessionId }),
      ]);
      if (snapshot.error || !snapshot.data) throw new Error(snapshot.error?.message ?? "No inspection receipt");
      if (checkpoint.error || !checkpoint.data) throw new Error(checkpoint.error?.message ?? "No integrity checkpoint");
      if (currentOwner.current !== requestedOwner) return;
      const report = snapshot.data as Inspection;
      const checked = checkpoint.data as Integrity;
      if (report.session_id !== sessionId || checked.session_id !== sessionId ||
          report.project_id !== checked.project_id) throw new Error("Recovery session identity mismatch");
      workspaceRecoveryMetrics(report);
      workspaceRecoveryWarnings(report);
      recoveryIntegrityState(checked);
      setIntegrity(checked);
      setInspection(report);
    } catch (failure) {
      if (currentOwner.current === requestedOwner) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === requestedOwner) setLoading(false);
    }
  }, [owner]);

  const operate = async (sessionId: string, op: "prepare" | "finalize" | "cancel") => {
    if (busy || disabled || !inspection || inspection.session_id !== sessionId) return;
    if (op === "prepare" && !workspaceRecoveryCanPrepare(inspection)) return;
    if (op === "finalize" && !workspaceRecoveryCanFinalize(inspection)) return;
    if (op === "cancel" && inspection.status !== "discarding") return;
    if (op === "prepare") {
      if (window.prompt(
        "Seal EMPTY unfinished import " + inspection.project_name +
        "? It must have no tasks, notes, checklist steps, file claims, or Storage files. " +
        "A second confirmation is required to permanently remove it. Type SEAL to proceed:"
      ) !== "SEAL") return;
    } else if (op === "finalize") {
      if (window.prompt(
        "PERMANENTLY DELETE this empty, sealed import project? Its import receipts will also be removed. " +
        "This cannot be undone. Type DELETE to proceed:"
      ) !== "DELETE") return;
    } else if (!window.confirm(
      "Undo the seal and make this unfinished project active again? No data will be deleted."
    )) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const name = op === "prepare" ? "workspace_import_prepare_discard"
        : op === "finalize" ? "workspace_import_finalize_discard"
          : "workspace_import_cancel_discard";
      const { data, error: requestError } = await supabase.rpc(name,
        { p_session_id: sessionId });
      if (requestError || data !== true) throw new Error(
        requestError?.message ?? "The server did not confirm the operation");
      if (currentOwner.current !== owner) return;
      setNotice(op === "prepare"
        ? "Empty import sealed and archived. Inspect again, then confirm final removal."
        : op === "finalize"
          ? "Empty import and its private session receipts permanently removed."
          : "Seal reversed. This unfinished project is active and can be resumed.");
      setView(op === "prepare" ? "discarding" : "active");
      if (op === "finalize") {
        setSelectedId(null);
        setInspection(null);
      }
      await refresh();
      if (op !== "finalize") await inspect(sessionId);
      onDiscarded();
    } catch (failure) {
      if (currentOwner.current === owner) {
        setError(messageFrom(failure) + " Refresh and inspect the project before retrying.");
      }
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  };

  const changeProtection = async (sessionId: string, shouldHold: boolean) => {
    if (busy || disabled || !inspection || !integrity ||
        inspection.session_id !== sessionId || integrity.session_id !== sessionId) return;
    if (!["active", "held"].includes(integrity.status)) return;
    const reason = shouldHold
      ? window.prompt("Protect this unfinished import from further restore writes? Current work stays saved. Enter an optional reason (300 characters maximum):", "Preserve existing project work")
      : "";
    if (reason === null) return;
    if (reason.length > 300) { setError("Protection reason must be 300 characters or fewer."); return; }
    if (!shouldHold && !window.confirm(
      "Release the hold? The server will reject this if project content changed since the last committed checkpoint."
    )) return;
    setBusy(true);
    setError("");
    setNotice("");
    const targetOwner = owner;
    try {
      const { data, error: requestError } = await supabase.rpc("workspace_import_set_hold",
        { p_session_id: sessionId, p_hold: shouldHold, p_reason: reason });
      if (requestError || data !== true) throw new Error(
        requestError?.message ?? "The server did not confirm protection");
      if (currentOwner.current !== targetOwner) return;
      setNotice(shouldHold
        ? "Recovery protected. Existing work remains saved; import writes are blocked."
        : "Recovery hold released after verifying the project's saved content.");
      setView(shouldHold ? "held" : "active");
      await refresh();
      await inspect(sessionId);
      onDiscarded();
    } catch (failure) {
      if (currentOwner.current === targetOwner) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === targetOwner) setBusy(false);
    }
  };

  const exportDiagnostic = () => {
    if (!inspection || !integrity || inspection.session_id !== integrity.session_id) return;
    if (!window.confirm(
      "Download a local RECOVERY DIAGNOSTIC containing metadata counts and checkpoint status only? It is not a project backup and does not contain private file bytes."
    )) return;
    try {
      const report = buildWorkspaceRecoveryReport(inspection, integrity);
      const blob = new Blob([report], { type: "application/json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = "eternyx-recovery-diagnostic-" + new Date().toISOString().slice(0, 10) + ".json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice("Local metadata-only diagnostic prepared. Export the real project separately to preserve content.");
    } catch (failure) { setError(messageFrom(failure)); }
  };

  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const visible = sessions.filter(s => view === "all" || s.status === view);
  const selected = sessions.find(s => s.id === selectedId);
  const metrics = inspection ? workspaceRecoveryMetrics(inspection) : [];
  const warnings = inspection ? workspaceRecoveryWarnings(inspection) : [];
  const integrityStatus = recoveryIntegrityState(integrity);
  const integrityWarnings = integrity ? recoverySafetyWarnings(inspection, integrity) : [];

  return <section className="space-y-3 border-t border-border pt-4"
    aria-label="Workspace import recovery">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold">
        <ClipboardCheck className="h-4 w-4 text-cyan-400" aria-hidden="true" />
        Import recovery center
      </h3>
      <Button size="sm" type="button" variant="ghost" disabled={disabled || loading || busy}
        onClick={() => void refresh()}>
        <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> Refresh
      </Button>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Private server-tracked import sessions, not estimates. Resume using the exact original archive.
      An import with saved work or private files cannot be discarded here.
    </p>
    <label htmlFor="workspace-recovery-filter" className="block text-xs font-medium">
      Filter the loaded session history
    </label>
    <select id="workspace-recovery-filter" value={view}
      onChange={event => setView(event.target.value as typeof view)}
      className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
      <option value="active">Unfinished</option>
      <option value="held">Protected / On hold</option>
      <option value="complete">Completed</option>
      <option value="discarding">Sealed for removal</option>
      <option value="all">All sessions</option>
    </select>
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="break-words text-xs text-cyan-300">{notice}</p>}
    {loading && <p role="status" className="text-xs text-muted-foreground">Checking real recovery records…</p>}
    <div className="max-h-80 space-y-2 overflow-y-auto" aria-label="Recent import sessions">
      {visible.map(session => <div key={session.id}
        className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <strong className="block break-words">
          {projectNames.get(session.project_id) ?? "Private imported project"}
        </strong>
        <p className="text-muted-foreground">
          {workspaceRecoveryPhase(session.status)} · v{session.source_version} ·
          {" " + new Date(session.created_at).toLocaleDateString()}
        </p>
        <p className="break-all text-muted-foreground">
          Archive SHA-256: {session.source_sha256.slice(0, 16)}…
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" type="button" disabled={disabled || busy}
            onClick={() => onOpen(session.project_id)}>
            <FolderOpen className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Open
          </Button>
          <Button size="sm" variant="outline" type="button" disabled={disabled || busy || loading}
            onClick={() => void inspect(session.id)}>
            <FileSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Inspect
          </Button>
          {session.status === "active" &&
            <Button size="sm" variant="outline" type="button"
              disabled={disabled || busy || loading ||
                !(selectedId === session.id && integrityStatus.canResume)}
              title="Inspect this session and confirm the saved content matches before resuming"
              onClick={() => onResume(session.source_sha256)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Resume verified archive
            </Button>}
        </div>
      </div>)}
      {!visible.length && !loading && <p className="text-xs text-muted-foreground">
        No matching sessions in the loaded history.
      </p>}
    </div>
    {hasMore && <Button size="sm" variant="outline" type="button" disabled={loading || busy}
      onClick={() => void loadMore()}>Load 20 more sessions</Button>}
    {sessions.length > 0 && <p className="text-xs text-muted-foreground">
      Showing {sessions.length} newest loaded sessions. This list does not claim to include older pages.
    </p>}

    {inspection && selected && <div className="space-y-3 rounded-xl border border-border p-3 text-xs"
      aria-label="Server inspection of selected import">
      <p className="break-words font-medium">
        Server inspection: {inspection.project_name}
      </p>
      <p className="text-muted-foreground">
        Project: {inspection.project_status} · Import: {workspaceRecoveryPhase(inspection.status)}
      </p>
      <p className={integrityStatus.warning ? "text-amber-400" : "text-muted-foreground"}>
        Server content checkpoint: {integrityStatus.label}.
      </p>
      {integrity?.checkpoint_at && <p className="text-muted-foreground">
        Last server checkpoint: {new Date(integrity.checkpoint_at).toLocaleString()}
      </p>}
      {integrity?.status === "held" && <p className="break-words text-muted-foreground">
        Protected since {integrity.held_at ? new Date(integrity.held_at).toLocaleString() : "unknown"};
        {integrity.hold_reason ? " reason: " + integrity.hold_reason : ""}
      </p>}
      {integrityWarnings.map((warning, index) => <p key={"integrity-"+index}
        className="text-amber-400" role="status">{warning}</p>)}
      {integrity && (integrity.status === "held" ||
        (integrity.status === "active" && !integrity.content_matches)) && <div className="space-y-2 rounded-lg border border-border p-2">
        <p className="text-amber-400">
          This import has protected or diverged work. A separate recovery archive
          preserves the existing project and restores the original source into a NEW project.
          It does not merge or replace manual edits.
        </p>
        <Button size="sm" variant="outline" type="button" disabled={disabled || busy || loading}
          onClick={() => {
            if (!window.confirm(
              "Create a side-by-side recovery COPY instead of overwriting this project? " +
              "First preserve your edited project with Backup files + checklists. " +
              "Then select the exact original archive and download a separate recovery archive."
            )) return;
            onFork({ sessionId: inspection.session_id,
              sourceHash: selected.source_sha256, projectId: inspection.project_id,
              projectName: inspection.project_name });
          }}>
          <FileSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Prepare separate recovery copy
        </Button>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" type="button" disabled={disabled || busy}
          onClick={() => onCheckpoint(inspection.project_id)}>
          <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Open project backup controls
        </Button>
        <Button size="sm" variant="outline" type="button" disabled={disabled || busy}
          onClick={exportDiagnostic}>
          <FileSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Download metadata report
        </Button>
        {integrity?.status === "active" && <Button size="sm" variant="outline"
          type="button" disabled={disabled || busy || loading}
          onClick={() => void changeProtection(inspection.session_id, true)}>
          <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Protect recovery
        </Button>}
        {integrity?.status === "held" && <Button size="sm" variant="outline"
          type="button" disabled={disabled || busy || loading || !integrity.content_matches}
          onClick={() => void changeProtection(inspection.session_id, false)}>
          <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Release hold
        </Button>}
      </div>
      <div className="grid gap-1">
        {metrics.map(metric => <p key={metric.label}>
          {metric.label}: {metric.committed}/{metric.expected} committed
          {metric.actual !== null ? " · " + metric.actual + " currently present" : ""}
        </p>)}
        <p>Physical private Storage objects: {inspection.stored_objects} ·
          {" " + inspection.file_claims} claimed · {inspection.pending_uploads} uploaded but not registered</p>
      </div>
      {warnings.map((warning, index) => <p key={index} className="text-amber-400">
        <Archive className="mr-1 inline h-3 w-3" aria-hidden="true" /> {warning}
      </p>)}
      {warnings.length === 0 && <p className="flex items-center gap-1 text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        No receipt-count or private Storage anomalies detected by this check.
      </p>}
      {inspection.status === "active" && <p className="text-muted-foreground">
        To resume, use the original byte-for-byte archive. Reconstructed or edited archives
        create different import identities.
      </p>}
      {inspection.status === "active" && !workspaceRecoveryCanPrepare(inspection) &&
        <p className="text-muted-foreground">
          Automatic empty-project disposal is blocked. Preserve and inspect saved work.
          To recover storage space, manually remove files through Workspace, then use the
          existing archived-project deletion controls after reviewing backups.
        </p>}
      {workspaceRecoveryCanPrepare(inspection) && <Button size="sm" type="button"
        variant="outline" disabled={busy || disabled || loading}
        onClick={() => void operate(inspection.session_id, "prepare")}>
        <Archive className="mr-1 h-4 w-4" aria-hidden="true" /> Seal empty unfinished import
      </Button>}
      {inspection.status === "discarding" && <Button size="sm" type="button"
        variant="outline" disabled={busy || disabled || loading}
        onClick={() => void operate(inspection.session_id, "cancel")}>
        <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" /> Undo seal — keep project
      </Button>}
      {workspaceRecoveryCanFinalize(inspection) && <Button size="sm" type="button"
        variant="destructive" disabled={busy || disabled || loading}
        onClick={() => void operate(inspection.session_id, "finalize")}>
        <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Permanently remove sealed EMPTY import
      </Button>}
    </div>}
  </section>;
}
