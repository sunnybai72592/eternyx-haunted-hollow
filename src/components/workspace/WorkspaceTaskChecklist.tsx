import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckSquare, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["workspace_tasks"]["Row"];
type Step = Database["public"]["Tables"]["workspace_task_steps"]["Row"];

export default function WorkspaceTaskChecklist({
  task, owner, archived,
}: { task: Task; owner: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Step[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase.from("workspace_task_steps")
      .select("*").eq("owner_id", owner).eq("task_id", task.id)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .limit(31);
    if (fetchError) setError(fetchError.message);
    else {
      if ((data?.length ?? 0) > 30) setError("Checklist exceeds its server limit. Contact support.");
      else { setRows((data ?? []) as Step[]); setLoaded(true); }
    }
    setLoading(false);
  }, [owner, task.id]);

  useEffect(() => {
    setRows([]);
    setLoaded(false);
    setOpen(false);
    setNotice("");
    setError("");
  }, [owner, task.id]);

  const show = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!loaded) void refresh();
  };

  const run = async (work: () => Promise<void>, success: string) => {
    if (busy || archived) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      setNotice(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Checklist operation failed");
    } finally {
      setBusy(false);
    }
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || title.length > 180 || rows.length >= 30) return;
    void run(async () => {
      const { error: insertError } = await supabase.from("workspace_task_steps")
        .insert({ task_id: task.id, owner_id: owner, title });
      if (insertError) throw new Error(insertError.message);
      setNewTitle("");
    }, "Checklist step saved.");
  };

  const toggle = (step: Step) => {
    void run(async () => {
      const { data, error: updateError } = await supabase.from("workspace_task_steps")
        .update({ done: !step.done }).eq("id", step.id).eq("owner_id", owner)
        .eq("task_id", task.id).eq("updated_at", step.updated_at).select("id").maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!data) throw new Error("This checklist step changed in another tab. Refresh before editing.");
    }, step.done ? "Step reopened." : "Step completed.");
  };

  const rename = (step: Step, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title || title.length > 180) { setError("Step title must be 1–180 characters."); return; }
    void run(async () => {
      const { data, error: updateError } = await supabase.from("workspace_task_steps")
        .update({ title }).eq("id", step.id).eq("owner_id", owner)
        .eq("task_id", task.id).eq("updated_at", step.updated_at).select("id").maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!data) throw new Error("This checklist step changed in another tab. Refresh before editing.");
      setEditing(null);
    }, "Step renamed.");
  };

  const remove = (step: Step) => {
    if (!window.confirm("Delete checklist step " + step.title + "? This cannot be undone.")) return;
    void run(async () => {
      const { data, error: deleteError } = await supabase.from("workspace_task_steps")
        .delete().eq("id", step.id).eq("owner_id", owner).eq("task_id", task.id)
        .eq("updated_at", step.updated_at).select("id").maybeSingle();
      if (deleteError) throw new Error(deleteError.message);
      if (!data) throw new Error("Step was changed or removed in another tab. Refresh before retrying.");
    }, "Checklist step removed.");
  };

  const doneCount = rows.filter(step => step.done).length;

  return <div className="basis-full space-y-3">
    <Button type="button" size="sm" variant="outline" onClick={show} disabled={busy}
      aria-expanded={open} aria-controls={"workspace-checklist-" + task.id}>
      <CheckSquare className="mr-1 h-4 w-4" aria-hidden="true" />
      {open ? "Hide checklist" : "Checklist"}{loaded ? " · " + doneCount + "/" + rows.length : ""}
    </Button>
    {open && <div id={"workspace-checklist-" + task.id} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {loaded ? doneCount + " of " + rows.length + " steps complete · 30 max" : "Loading private task steps"}
          {archived ? " · archived read-only" : ""}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()}
          disabled={busy || loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Refresh steps
        </Button>
      </div>
      {loading && <p className="text-xs text-muted-foreground" role="status">Loading checklist…</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-xs text-cyan-300" role="status">{notice}</p>}
      {loaded && <ol className="space-y-2">
        {rows.map(step => <li key={step.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
          <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
            <input type="checkbox" checked={step.done} disabled={busy || archived}
              onChange={() => toggle(step)} aria-label={"Complete " + step.title}
              className="mt-1" />
            <span className={"break-words " + (step.done ? "text-muted-foreground line-through" : "")}>
              {step.title}</span>
          </label>
          {!archived && <>
            <Button size="icon" type="button" variant="ghost" disabled={busy}
              aria-label={"Rename step " + step.title}
              onClick={() => {
                setEditing(editing === step.id ? null : step.id);
                setEditTitle(step.title);
              }}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button size="icon" type="button" variant="ghost" disabled={busy}
              aria-label={"Delete step " + step.title} onClick={() => remove(step)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>}
          {editing === step.id && !archived && <form onSubmit={(event) => rename(step, event)}
            className="flex w-full flex-wrap gap-2">
            <Input value={editTitle} onChange={event => setEditTitle(event.target.value)}
              maxLength={180} required aria-label="New step title" className="min-w-[160px] flex-1" />
            <Button size="sm" type="submit" disabled={busy || !editTitle.trim()}>Save step</Button>
          </form>}
        </li>)}
        {!rows.length && <li className="text-sm text-muted-foreground">No steps added yet.</li>}
      </ol>}
      {!archived && loaded && rows.length < 30 && <form onSubmit={create}
        className="flex flex-wrap items-center gap-2">
        <Input value={newTitle} onChange={event => setNewTitle(event.target.value)}
          aria-label="New checklist step" placeholder="Next step…" maxLength={180}
          className="min-w-[180px] flex-1" required />
        <Button size="sm" type="submit" disabled={busy || !newTitle.trim()}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </form>}
    </div>}
  </div>;
}
