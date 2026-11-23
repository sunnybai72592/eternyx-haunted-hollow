import { useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, FileSearch, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auditWorkspaceBackupBytes } from "@/lib/workspaceBackupAudit.mjs";
import { WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "@/lib/workspaceFullBackup.mjs";

type Audit = Awaited<ReturnType<typeof auditWorkspaceBackupBytes>>;
const message = (err: unknown) => err instanceof Error ? err.message : "Local archive validation failed";

export default function WorkspaceBackupAudit({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const generation = useRef(0);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const token = ++generation.current;
    setResult(null);
    setError("");
    setFileName("");
    if (!file || disabled) return;
    if (file.size < 1 || file.size > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
      setError("Select a JSON backup of 24 MiB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const checked = await auditWorkspaceBackupBytes(new Uint8Array(await file.arrayBuffer()));
      if (token !== generation.current) return;
      setResult(checked);
      setFileName(file.name);
    } catch (err) {
      if (token === generation.current) setError(message(err));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };

  const reset = () => {
    generation.current++;
    setResult(null);
    setError("");
    setFileName("");
    setBusy(false);
    if (picker.current) picker.current.value = "";
  };

  return <section className="space-y-3 border-t border-border pt-4"
    aria-label="Verify a local Workspace backup">
    <h3 className="flex items-center gap-2 font-semibold">
      <FileSearch className="h-4 w-4 text-cyan-400" aria-hidden="true" />
      Verify a backup locally
    </h3>
    <p className="text-xs leading-5 text-muted-foreground">
      Check a v1, v2 or v3 JSON archive before relying on it.
      All checks run in this browser: the archive is not uploaded and no Workspace
      data is changed. Included private file bytes are checked against their
      embedded SHA-256 manifests.
    </p>
    <label htmlFor="workspace-backup-audit-file" className="block text-xs font-medium">
      Select saved ETERNYX Workspace JSON archive (up to 24 MiB)
    </label>
    <input ref={picker} id="workspace-backup-audit-file" type="file"
      accept=".json,application/json" disabled={disabled || busy}
      onChange={(event) => void choose(event)}
      className="block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-2" />
    {busy && <p role="status" className="text-xs text-muted-foreground">
      Inspecting archive structure, tasks, checklists and any included file bytes…
    </p>}
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    {result && <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <p className="flex items-center gap-2 font-medium text-cyan-300">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true"/>
        Local archive validation passed
      </p>
      <p className="break-words">{fileName} · {result.projectName}</p>
      <p>Format v{result.version} · {result.archiveMode} · {result.taskCount} tasks ·
        {" "+result.checklistCount} steps · {result.savedItemCount} notes/links</p>
      <p>{result.includedFiles} included private file(s), {result.actualFileBytes} verified bytes;
        {" "+result.skippedFiles} metadata-only file manifest(s) excluded</p>
      {result.isRecoveryCopy && <p>Separate recovery-copy marker detected (informational)</p>}
      {result.reviewedMarkerVersion !== null &&
        <p>Reviewed reconciliation v{result.reviewedMarkerVersion} ·
          {result.reviewedPayloadVerified
            ? " selected-record payload digest verified"
            : " legacy marker lacks selected-record digest"}</p>}
      <p className="break-all text-muted-foreground">Exact archive SHA-256: {result.sha256}</p>
      <p className="text-amber-400">
        <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        {result.limitations}
      </p>
      <Button size="sm" type="button" variant="outline"
        onClick={reset}>Clear result</Button>
    </div>}
  </section>;
}
