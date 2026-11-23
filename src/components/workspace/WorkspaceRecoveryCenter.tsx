import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCircle2, ClipboardCheck, FileSearch, FolderOpen, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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

type Props = {
  owner: string; disabled: boolean; projects: Project[];
  refreshKey: number;
  onOpen: (projectId: string) => void;
  onResume: (fingerprint: string) => void;
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
  owner, disabled, projects, refreshKey, onOpen, onResume, onDiscarded,
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
  const [view, setView] = useState<"all" | "active" | "complete" | "discarding">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);

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

  useEffect(() => {
    setSessions([]);
    setHasMore(false);
    setSelectedId(null);
    setInspection(null);
    setNotice("");
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
    setSelectedId(sessionId);
    setLoading(true);
    const requestedOwner = owner;
    try {
      const { data, error: queryError } = await supabase.rpc(
        "workspace_import_inspect", { p_session_id: sessionId });
      if (queryError || !data) throw new Error(queryError?.message ?? "No inspection receipt");
      if (currentOwner.current !== requestedOwner) return;
      const report = data as Inspection;
      if (report.session_id !== sessionId) throw new Error("Unexpected recovery session");
      workspaceRecoveryMetrics(report);
      workspaceRecoveryWarnings(report);
      setInspection(report);
    } catch (failure) {
      if (currentOwner.current === requestedOwner) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === requestedOwner) setLoading(false);
    }
  }, [owner]);

  const operate = async (sessionId: string, op: "prepare" | "finalize") => {
    if (busy || disabled || !inspection || inspection.session_id !== sessionId) return;
    if (op === "prepare" && !workspaceRecoveryCanPrepare(inspection)) return;
    if (op === "finalize" && !workspaceRecoveryCanFinalize(inspection)) return;
    if (op === "prepare") {
      if (window.prompt(
        "Seal EMPTY unfinished import " + inspection.project_name +
        "? It must have no tasks, notes, checklist steps, file claims, or Storage files. " +
        "A second confirmation is required to permanently remove it. Type SEAL to proceed:"
      ) !== "SEAL") return;
    } else if (window.prompt(
      "PERMANENTLY DELETE this empty, sealed import project? Its import receipts will also be removed. " +
      "This cannot be undone. Type DELETE to proceed:"
    ) !== "DELETE") return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const name = op === "prepare"
        ? "workspace_import_prepare_discard" : "workspace_import_finalize_discard";
      const { data, error: requestError } = await supabase.rpc(name,
        { p_session_id: sessionId });
      if (requestError || data !== true) throw new Error(
        requestError?.message ?? "The server did not confirm the operation");
      if (currentOwner.current !== owner) return;
      setNotice(op === "prepare"
        ? "Empty import sealed and archived. Inspect again, then confirm final removal."
        : "Empty import and its private session receipts permanently removed.");
      if (op === "finalize") {
        setSelectedId(null);
        setInspection(null);
      }
      await refresh();
      if (op === "prepare") await inspect(sessionId);
      onDiscarded();
    } catch (failure) {
      if (currentOwner.current === owner) {
        setError(messageFrom(failure) + " Refresh and inspect the project before retrying.");
      }
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  };

  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const visible = sessions.filter(s => view === "all" || s.status === view);
  const selected = sessions.find(s => s.id === selectedId);
  const metrics = inspection ? workspaceRecoveryMetrics(inspection) : [];
  const warnings = inspection ? workspaceRecoveryWarnings(inspection) : [];

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
            <Button size="sm" variant="outline" type="button" disabled={disabled || busy}
              onClick={() => onResume(session.source_sha256)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Resume exact archive
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
      {workspaceRecoveryCanFinalize(inspection) && <Button size="sm" type="button"
        variant="destructive" disabled={busy || disabled || loading}
        onClick={() => void operate(inspection.session_id, "finalize")}>
        <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Permanently remove sealed EMPTY import
      </Button>}
    </div>}
  </section>;
}
