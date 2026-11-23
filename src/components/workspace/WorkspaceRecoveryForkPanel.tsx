import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileDiff, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "@/lib/workspaceFullBackup.mjs";
import { sha256Hex } from "@/lib/workspaceImportRecovery.mjs";
import { createWorkspaceRecoveryFork, parsePortableWorkspaceArchive } from "@/lib/workspaceRecoveryFork.mjs";
import { compareWorkspaceRecoveryRecords, fetchWorkspaceRecoveryComparison } from "@/lib/workspaceRecoveryCompare.mjs";

type Target = { sessionId: string; sourceHash: string; projectId: string; projectName: string };
type Preview = {
  tasks: {archiveTotal:number;currentTotal:number;exact:number;archiveOnly:number;currentOnly:number};
  items: {archiveTotal:number;currentTotal:number;exact:number;archiveOnly:number;currentOnly:number};
  limitations: string;
};
const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : "Could not prepare a verified recovery copy";

export default function WorkspaceRecoveryForkPanel({
  target, owner, disabled, onClose,
}: {target: Target; owner: string; disabled: boolean; onClose: (message?: string) => void}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("");
  const [comparison, setComparison] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);

  const selectSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setRaw(null);
    setSourceBytes(null);
    setComparison(null);
    setNotice("");
    setError("");
    if (!file) return;
    if (file.size < 1 || file.size > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
      setError("Select the original Workspace JSON file, no larger than 24 MiB.");
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256Hex(bytes);
      if (hash !== target.sourceHash) {
        throw new Error("The selected file does NOT match this import's original SHA-256. No recovery copy was prepared.");
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const archive = await parsePortableWorkspaceArchive(content);
      if (archive.forkMarker) {
        throw new Error("This source is already a recovery copy. Please select the original import file.");
      }
      const current = await fetchWorkspaceRecoveryComparison(supabase, owner, target.projectId);
      const snapshot = compareWorkspaceRecoveryRecords(archive.parsed,
        current.tasks, current.items.filter(item => item.kind === "note" || item.kind === "link"));
      if (!active.current) return;
      setComparison(snapshot);
      setRaw(content);
      setSourceBytes(bytes);
      setName(file.name);
    } catch (failure) {
      if (active.current) setError(messageFrom(failure));
    } finally {
      if (active.current) setBusy(false);
    }
  };

  const download = async () => {
    if (!raw || !sourceBytes || !comparison || busy || disabled) return;
    if (!window.confirm(
      "Create a DISTINCT recovery archive that restores as a NEW private project? " +
      "It contains the original archive's notes, tasks, checklist data and any embedded private files. " +
      "It does NOT copy later edits from your protected partial project. " +
      "Keep that original project and a separate backup; no project will be overwritten. Continue?"
    )) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fork = await createWorkspaceRecoveryFork(
        raw, target.sourceHash, crypto.randomUUID(), new Date().toISOString(), sourceBytes);
      const content = new Blob([fork.content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eternyx-recovery-copy-" + new Date().toISOString().slice(0,10) + "-" +
        fork.fingerprint.slice(0,12) + ".json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      const message = "Recovery copy download started (" + fork.fingerprint.slice(0,12) +
        "…). Select that DOWNLOADED copy in Restore an export to create a new project. " +
        "Your existing partial project and the original archive remain untouched.";
      if (active.current) {
        setNotice(message);
        onClose(message);
      }
    } catch (failure) {
      if (active.current) setError(messageFrom(failure));
    } finally {
      if (active.current) setBusy(false);
    }
  };

  const cancel = () => {
    active.current = false;
    onClose();
  };

  return <section id="workspace-recovery-fork" className="space-y-3 rounded-xl border border-border p-4"
    aria-label="Preserve changed project and prepare a separate recovery archive">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold">
        <FileDiff className="h-4 w-4 text-cyan-400" aria-hidden="true" />
        Separate recovery copy — no overwrite
      </h3>
      <Button size="sm" variant="ghost" type="button" onClick={cancel}
        disabled={busy}><X className="mr-1 h-4 w-4" /> Cancel</Button>
    </div>
    <p className="text-sm text-muted-foreground">
      Existing project: <strong>{target.projectName}</strong>. Keep its manual edits.
      Select the exact original import archive to review the source against its current
      task and note/link records. This operation reads owner-scoped records only.
    </p>
    <p className="text-xs break-all text-muted-foreground">
      Required original SHA-256: {target.sourceHash.slice(0,16)}…
    </p>
    <label htmlFor="workspace-fork-file" className="block text-xs font-medium">
      Original archive used for this import
    </label>
    <input id="workspace-fork-file" ref={input} type="file" accept=".json,application/json"
      aria-label="Choose exact original archive to create a separate recovery copy"
      onChange={event => void selectSource(event)} disabled={busy || disabled}
      className="block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-2" />
    {busy && <p role="status" className="text-xs text-muted-foreground">
      Validating original file and reading current owner-scoped records…
    </p>}
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="text-xs text-cyan-300">{notice}</p>}
    {comparison && <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <strong className="block">Read-only comparison: {name}</strong>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["Tasks",comparison.tasks],
          ["Notes and links",comparison.items],
        ] as const).map(([label,result])=><div key={label} className="space-y-1">
          <p className="font-medium">{label}</p>
          <p>{result.exact} exact matches</p>
          <p>{result.archiveOnly} records in original archive not exactly matched in current project</p>
          <p>{result.currentOnly} current project records not exactly matched in original archive</p>
          <p className="text-muted-foreground">Source {result.archiveTotal} · current {result.currentTotal}</p>
        </div>)}
      </div>
      <p className="text-amber-400">
        <ShieldAlert className="mr-1 inline h-4 w-4" aria-hidden="true" />
        {comparison.limitations}
      </p>
      <p className="text-muted-foreground">
        The new archive will contain the verified ORIGINAL source, not these later
        project edits. Back up the current project separately before proceeding.
      </p>
      <Button size="sm" type="button" disabled={busy || disabled} onClick={() => void download()}>
        <Download className="mr-1 h-4 w-4" aria-hidden="true" />
        Download separately restorable recovery copy
      </Button>
    </div>}
  </section>;
}
