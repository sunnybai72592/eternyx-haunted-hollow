import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parseWorkspaceRestore } from "@/lib/workspaceRestore.mjs";
import { parseWorkspaceFullBackup, WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "@/lib/workspaceFullBackup.mjs";
import { parseWorkspaceArchiveV3 } from "@/lib/workspaceChecklistArchive.mjs";
import { validateWorkspaceRecoveryForkHeader } from "@/lib/workspaceRecoveryFork.mjs";
import { WORKSPACE_BUCKET } from "@/lib/workspaceRules.mjs";
import {
  importManifest, itemRestoreBatches, sha256Hex, taskRestoreBatches,
  verifyExistingImportFile,
} from "@/lib/workspaceImportRecovery.mjs";

type Parsed = ReturnType<typeof parseWorkspaceRestore> & {
  archiveVersion?: number;
  archiveMode?: "metadata" | "files";
  stepCount?: number;
  tasks: Array<{ title: string; status: string; due_on: string | null; priority: string;
    details: string; checklist?: Array<{ title: string; done: boolean }> }> ;
  files?: Array<{ title: string; mime_type: string; size_bytes: number; bytes: Uint8Array }>;
};
type Props = {
  owner: string;
  disabled: boolean;
  resumeFingerprint?: string | null;
  onResumeConsumed?: () => void;
  onImported: (id: string, result: string, failed: boolean) => void;
};
const textError = (value: unknown) => value instanceof Error ? value.message : "Import failed";

export default function WorkspaceImportPanel({
  owner, disabled, resumeFingerprint, onResumeConsumed, onImported,
}: Props) {
  const [preview, setPreview] = useState<Parsed | null>(null);
  const [source, setSource] = useState("");
  const [sourceHash, setSourceHash] = useState("");
  const [sourceVersion, setSourceVersion] = useState(1);
  const [isRecoveryFork, setIsRecoveryFork] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setSource("");
    setSourceHash("");
    setIsRecoveryFork(false);
    setImportNotice("");
    setError("");
    setProgress("");
    if (!file) return;
    if (file.size < 1 || file.size > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
      setError("Select an ETERNYX JSON export or backup no larger than 24 MiB.");
      return;
    }
    try {
      // Hash the exact original archive bytes, not re-encoded text:
      // distinct malformed UTF-8 inputs must never share an import session.
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const content = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
      const header = JSON.parse(content);
      const forkMarker = validateWorkspaceRecoveryForkHeader(header?.recovery_fork);
      const validated = header?.format_version === 3
        ? await parseWorkspaceArchiveV3(content)
        : header?.format_version === 2
          ? await parseWorkspaceFullBackup(content)
          : parseWorkspaceRestore(content);
      const fingerprint = await sha256Hex(sourceBytes);
      if (resumeFingerprint && fingerprint !== resumeFingerprint) {
        throw new Error("This file is not the exact archive selected for recovery. " +
          "Choose the original byte-for-byte file or cancel the recovery target.");
      }
      setPreview(validated);
      setSourceHash(fingerprint);
      setSourceVersion(header.format_version);
      setIsRecoveryFork(Boolean(forkMarker));
      setSource(file.name);
      if (resumeFingerprint) onResumeConsumed?.();
    } catch (failure) {
      setError(textError(failure));
    }
  };

  const run = async () => {
    if (!preview || !sourceHash || inFlight.current || busy || disabled) return;
    if (!window.confirm(
      "Restore or RESUME this verified archive into its account-owned project? " +
      preview.tasks.length + " tasks, " + (preview.stepCount ?? 0) + " checklist steps, " +
      preview.items.length + " notes/links and " + (preview.files?.length ?? 0) + " private files. " +
      (isRecoveryFork
        ? "This is a SEPARATELY RESTORABLE recovery copy. It will not overwrite your protected partial project. "
        : "The same exact file will reuse its previous import instead of creating duplicates. ") +
      "Different files create separate projects; batches and Storage are not globally atomic."
    )) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setImportNotice("");
    setProgress("Finding your private restore session…");
    let projectId: string | null = null;
    let sessionId: string | null = null;
    try {
      const manifest = importManifest(preview, sourceHash, sourceVersion);
      const { data: beginData, error: beginError } = await supabase.rpc(
        "workspace_import_begin", manifest);
      if (beginError || !beginData) {
        throw new Error("Could not start or recover import: " +
          (beginError?.message ?? "no server response"));
      }
      const begin = beginData as {
        session_id: string; project_id: string; status: string; reused: boolean;
      };
      if (!begin.session_id || !begin.project_id) {
        throw new Error("Import session response is incomplete");
      }
      projectId = begin.project_id;
      sessionId = begin.session_id;

      if (begin.status === "held") {
        throw new Error("This import is protected. Its saved work has not been deleted. " +
          "Inspect it in Recovery Center before releasing the hold.");
      }
      if (begin.status === "discarding") {
        throw new Error("This import was sealed for disposal. It cannot be resumed. " +
          "Inspect its empty project in Recovery Center before final removal.");
      }
      if (begin.status === "complete") {
        setProgress("");
        setImportNotice("This exact archive was already restored to a private project. No new records were created.");
        onImported(projectId, "Previously completed restore opened; duplicate project creation prevented.", false);
        return;
      }
      if (begin.reused) {
        setImportNotice("Resuming the previously created private project. Committed batches will not run twice.");
      }

      const taskBatches = taskRestoreBatches(preview);
      const itemBatches = itemRestoreBatches(preview);
      let taskCount = 0;
      let stepCount = 0;
      let itemCount = 0;
      let fileCount = 0;

      for (let index = 0; index < taskBatches.length; index++) {
        const batch = taskBatches[index];
        setProgress("Verifying task and checklist batch " + (index + 1) + "/" + taskBatches.length);
        const { data, error } = await supabase.rpc("workspace_import_apply_batch", {
          p_session_id: sessionId, p_phase: "tasks", p_batch_index: index, p_payload: batch,
        });
        if (error) throw new Error("Task batch " + (index + 1) + ": " + error.message);
        const result = data as { rows?: number; steps?: number; replayed?: boolean } | null;
        const expectedSteps = batch.reduce((count, task) => count + task.checklist.length, 0);
        if (result?.rows !== batch.length || result?.steps !== expectedSteps) {
          throw new Error("Task batch receipt did not match the archive. Review the partial project.");
        }
        taskCount += batch.length;
        stepCount += expectedSteps;
      }

      for (let index = 0; index < itemBatches.length; index++) {
        const batch = itemBatches[index];
        setProgress("Verifying saved item batch " + (index + 1) + "/" + itemBatches.length);
        const { data, error } = await supabase.rpc("workspace_import_apply_batch", {
          p_session_id: sessionId, p_phase: "items", p_batch_index: index, p_payload: batch,
        });
        if (error) throw new Error("Saved item batch " + (index + 1) + ": " + error.message);
        const result = data as { rows?: number; replayed?: boolean } | null;
        if (result?.rows !== batch.length) {
          throw new Error("Saved item batch receipt did not match the archive.");
        }
        itemCount += batch.length;
      }

      for (const [index, file] of (preview.files ?? []).entries()) {
        setProgress("Verifying private file " + (index + 1) + "/" + preview.files!.length);
        const hash = await sha256Hex(file.bytes);
        const { data: claimData, error: claimError } = await supabase.rpc(
          "workspace_import_claim_file", {
            p_session_id: sessionId, p_file_index: index, p_title: file.title,
            p_size_bytes: file.size_bytes, p_mime_type: file.mime_type, p_sha256: hash,
          });
        if (claimError) throw new Error("Private file claim failed: " + claimError.message);
        const claim = claimData as { storage_path?: string; registered?: boolean } | null;
        if (!claim?.storage_path) throw new Error("Private file claim returned no Storage key");
        if (!claim.registered) {
          const storage = supabase.storage.from(WORKSPACE_BUCKET);
          const { error: uploadError } = await storage.upload(
            claim.storage_path, file.bytes, { upsert: false, contentType: file.mime_type });
          if (uploadError) {
            // A prior request may have uploaded then lost network access.
            // Never blindly replace an existing private object: download and
            // verify it byte-for-byte against the validated archive hash.
            await verifyExistingImportFile(storage, claim.storage_path, file.bytes, hash);
          }
          const { data: registered, error: registerError } = await supabase.rpc(
            "workspace_import_register_file", {
              p_session_id: sessionId, p_file_index: index,
            });
          if (registerError || registered !== true) {
            throw new Error("Private file registration is incomplete: " +
              (registerError?.message ?? "server did not acknowledge registration"));
          }
        }
        fileCount++;
      }

      const { data: finished, error: finishError } = await supabase.rpc(
        "workspace_import_finish", { p_session_id: sessionId });
      if (finishError || finished !== true) {
        throw new Error("Restore could not be finalized: " +
          (finishError?.message ?? "server completion not acknowledged"));
      }
      const { data: statusData, error: statusError } = await supabase.rpc(
        "workspace_import_status", { p_session_id: sessionId });
      if (statusError || !statusData) {
        throw new Error("Could not verify final import progress: " +
          (statusError?.message ?? "missing server receipt"));
      }
      const receipt = statusData as {
        status?: string; tasks?: number; steps?: number; items?: number; files?: number;
      };
      if (receipt.status !== "complete" || receipt.tasks !== taskCount ||
        receipt.steps !== stepCount || receipt.items !== itemCount ||
        receipt.files !== fileCount) {
        throw new Error("Final restored counts do not match the server receipt. Review this project.");
      }

      setProgress("");
      setPreview(null);
      setSource("");
      setSourceHash("");
      if (input.current) input.current.value = "";
      onImported(projectId,
        "Verified restore: " + taskCount + " tasks, " + stepCount +
        " checklist steps, " + itemCount + " notes/links, " + fileCount +
        " private file(s). " + preview.filesSkipped + " metadata-only file manifest(s) were skipped.", false);
    } catch (failure) {
      setProgress("");
      const message = textError(failure);
      setError(message);
      if (sessionId && projectId) {
        let committed = "The exact archive can be selected again to resume safely.";
        try {
          const { data } = await supabase.rpc("workspace_import_status",
            { p_session_id: sessionId });
          const status = data as {
            tasks?: number; steps?: number; items?: number; files?: number;
          } | null;
          if (status) committed = "Committed on server: " +
            (status.tasks ?? 0) + " tasks, " + (status.steps ?? 0) +
            " steps, " + (status.items ?? 0) + " saved items, " +
            (status.files ?? 0) + " files. Select the same archive and retry.";
        } catch {
          // The source archive remains selected for a safe manual retry.
        }
        onImported(projectId,
          "Import needs recovery: " + message + ". " + committed, true);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <section className="space-y-3 border-t border-border pt-4">
    <h3 className="flex items-center gap-2 font-semibold"><FileUp className="h-4 w-4 text-cyan-400" aria-hidden="true" /> Restore an export</h3>
    <p className="text-xs leading-5 text-muted-foreground">
      Select a version 1, 2 or 3 export. An exact archive fingerprint resumes its
      previous private restore; previously committed task and note batches are verified,
      not duplicated. Private file retries verify SHA-256 without overwriting existing
      uploads. Different archives create separate projects; historical revisions are excluded.
    </p>
    {resumeFingerprint && <div className="space-y-2 rounded-lg border border-border p-2 text-xs">
      <p>Resume selected archive SHA-256: {resumeFingerprint.slice(0, 16)}…
        Choose the exact original file. A different file is rejected before import.</p>
      <Button size="sm" type="button" variant="outline" onClick={onResumeConsumed}
        disabled={busy || disabled}>Cancel recovery target</Button>
    </div>}
    <input id="workspace-import-file" ref={input} type="file" accept=".json,application/json" aria-label="Choose ETERNYX Workspace project export"
      onChange={(event) => void choose(event)}
      disabled={busy || disabled}
      className="block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-2" />
    {preview && <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
      <strong className="block break-words">{preview.project.name}</strong>
      <p className="break-all text-muted-foreground">From {source}</p>
      <p>{preview.tasks.length} tasks · {preview.stepCount ?? 0} checklist steps · {preview.items.length} notes/links · {preview.files?.length ?? 0} verified file(s) · {preview.filesSkipped} skipped file manifest(s)</p>
      <p className="text-muted-foreground">SHA-256 file fingerprint: {sourceHash.slice(0, 12)}… · Resume-safe</p>
      {isRecoveryFork && <p className="text-amber-400">
        Separate recovery copy detected. This will create or resume a DISTINCT private
        project and will NOT merge or overwrite the original partially restored project.
        Provenance fields are informational, not a digital signature.
      </p>}
      <Button size="sm" type="button" disabled={busy || disabled} onClick={() => void run()}>
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Restore or resume
      </Button>
    </div>}
    {progress && <p role="status" className="text-xs text-cyan-300">{progress}</p>}
    {importNotice && <p role="status" className="text-xs text-cyan-300">{importNotice}</p>}
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  </section>;
}
