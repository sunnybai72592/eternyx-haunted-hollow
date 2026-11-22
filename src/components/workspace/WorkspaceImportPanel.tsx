import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parseWorkspaceRestore, WORKSPACE_RESTORE_MAX_BYTES } from "@/lib/workspaceRestore.mjs";
import { parseWorkspaceFullBackup, WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "@/lib/workspaceFullBackup.mjs";
import { WORKSPACE_BUCKET, workspaceFileKey } from "@/lib/workspaceRules.mjs";

type Parsed = ReturnType<typeof parseWorkspaceRestore> & {
  files?: Array<{ title: string; mime_type: string; size_bytes: number; bytes: Uint8Array }>;
};
type Props = {
  owner: string;
  disabled: boolean;
  onImported: (id: string, result: string, failed: boolean) => void;
};
const textError = (value: unknown) => value instanceof Error ? value.message : "Import failed";

export default function WorkspaceImportPanel({ owner, disabled, onImported }: Props) {
  const [preview, setPreview] = useState<Parsed | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setSource("");
    setError("");
    setProgress("");
    if (!file) return;
    if (file.size < 1 || file.size > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
      setError("Select an ETERNYX JSON export or backup no larger than 24 MiB.");
      return;
    }
    try {
      const content = await file.text();
      const header = JSON.parse(content);
      const validated = header?.format_version === 2
        ? await parseWorkspaceFullBackup(content)
        : parseWorkspaceRestore(content);
      setPreview(validated);
      setSource(file.name);
    } catch (failure) {
      setError(textError(failure));
    }
  };

  const run = async () => {
    if (!preview || busy || disabled) return;
    if (!window.confirm(
      "Create a NEW private project called " + preview.project.name + " with " +
      preview.tasks.length + " tasks and " + preview.items.length + " saved notes/links? " +
      (preview.files?.length ?? 0) + " file contents will be restored and " +
      preview.filesSkipped + " file manifests have no binary data. " +
      "If an upload batch fails, the created project and successful records will remain."
    )) return;
    setBusy(true);
    setError("");
    setProgress("Creating a private project…");
    let createdId: string | null = null;
    let taskCount = 0;
    let itemCount = 0;
    let fileCount = 0;
    try {
      const { data, error: createError } = await supabase.from("workspace_projects")
        .insert({ owner_id: owner, name: preview.project.name, description: preview.project.description })
        .select("id").single();
      if (createError || !data) throw new Error(createError?.message ?? "Could not create project");
      createdId = data.id;
      const chunks = <T,>(rows: T[], size = 50): T[][] =>
        Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
          rows.slice(index * size, (index + 1) * size));

      for (const batch of chunks(preview.tasks)) {
        setProgress("Restoring tasks: " + taskCount + "/" + preview.tasks.length);
        const { error: taskError } = await supabase.from("workspace_tasks").insert(
          batch.map((entry) => ({
            owner_id: owner, project_id: createdId!, title: entry.title,
            status: entry.status, due_on: entry.due_on,
          }))
        );
        if (taskError) throw new Error("Task import failed after " + taskCount + " records: " + taskError.message);
        taskCount += batch.length;
      }
      for (const batch of chunks(preview.items)) {
        setProgress("Restoring saved work: " + itemCount + "/" + preview.items.length);
        const { error: itemError } = await supabase.from("workspace_items").insert(
          batch.map((entry) => ({ owner_id: owner, project_id: createdId!, ...entry }))
        );
        if (itemError) throw new Error("Saved-item import failed after " + itemCount + " records: " + itemError.message);
        itemCount += batch.length;
      }
      for (const file of preview.files ?? []) {
        setProgress("Restoring verified private files: " + fileCount + "/" + preview.files!.length);
        const key = workspaceFileKey(owner, createdId!, file.title, crypto.randomUUID());
        const { error: uploadError } = await supabase.storage.from(WORKSPACE_BUCKET)
          .upload(key, file.bytes, { upsert: false, contentType: file.mime_type });
        if (uploadError) throw new Error("Private file restore failed: " + uploadError.message);
        const { error: recordError } = await supabase.from("workspace_items").insert({
          owner_id: owner, project_id: createdId!, kind: "file",
          title: file.title, mime_type: file.mime_type,
          file_size: file.size_bytes, storage_path: key,
        });
        if (recordError) {
          const cleanup = await supabase.storage.from(WORKSPACE_BUCKET).remove([key]);
          throw new Error("File record creation failed: " + recordError.message +
            (cleanup.error ? ". Storage cleanup also failed; contact support." : ". Incomplete upload was removed."));
        }
        fileCount += 1;
      }
      setProgress("");
      setPreview(null);
      setSource("");
      if (input.current) input.current.value = "";
      onImported(createdId,
        "Restored " + taskCount + " tasks, " + itemCount + " notes/links and " +
        fileCount + " private file(s). " + preview.filesSkipped +
        " file manifests had no binary data.", false);
    } catch (failure) {
      setProgress("");
      const msg = textError(failure);
      setError(msg);
      if (createdId) onImported(createdId,
        "Partial import: " + taskCount + " tasks, " + itemCount + " saved items and " +
        fileCount + " private files created. " +
        msg + " Open the project to inspect and retry manually.", true);
    } finally {
      setBusy(false);
    }
  };

  return <section className="space-y-3 border-t border-border pt-4">
    <h3 className="flex items-center gap-2 font-semibold"><FileUp className="h-4 w-4 text-cyan-400" aria-hidden="true" /> Restore an export</h3>
    <p className="text-xs leading-5 text-muted-foreground">
      Restore a separate private project from a regular export (v1) or complete backup (v2).
      A verified v2 backup also restores included private files. Historical revisions are not included;
      v1 file manifests cannot restore binary data. No original projects are overwritten.
    </p>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Choose ETERNYX Workspace project export"
      onChange={(event) => void choose(event)}
      disabled={busy || disabled}
      className="block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-2" />
    {preview && <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
      <strong className="block break-words">{preview.project.name}</strong>
      <p className="break-all text-muted-foreground">From {source}</p>
      <p>{preview.tasks.length} tasks · {preview.items.length} notes/links · {preview.files?.length ?? 0} verified file(s) · {preview.filesSkipped} skipped file manifest(s)</p>
      <Button size="sm" type="button" disabled={busy || disabled} onClick={() => void run()}>
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Confirm restore
      </Button>
    </div>}
    {progress && <p role="status" className="text-xs text-cyan-300">{progress}</p>}
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  </section>;
}
