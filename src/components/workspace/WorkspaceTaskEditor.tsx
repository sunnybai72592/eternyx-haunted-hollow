import { useEffect, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { WORKSPACE_TASK_PRIORITIES, validWorkspacePriority } from "@/lib/workspaceTaskFocus.mjs";

type Task = Database["public"]["Tables"]["workspace_tasks"]["Row"];
type Props = {
  task: Task; owner: string; disabled: boolean;
  onRun: (action: () => Promise<void>, message: string) => void;
};

export default function WorkspaceTaskEditor({ task, owner, disabled, onRun }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due_on ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDue(task.due_on ?? "");
    setPriority(task.priority);
    setEditing(false);
    setError("");
  }, [task.id, task.updated_at]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (!title.trim() || title.length > 200) {
      setError("Task title must contain 1–200 characters.");
      return;
    }
    if (!validWorkspacePriority(priority)) {
      setError("Choose an allowed task priority.");
      return;
    }
    setError("");
    onRun(async () => {
      const { data, error: queryError } = await supabase.from("workspace_tasks")
        .update({ title: title.trim(), due_on: due || null, priority })
        .eq("id", task.id).eq("owner_id", owner)
        .eq("updated_at", task.updated_at).select("id").maybeSingle();
      if (queryError) throw new Error(queryError.message);
      if (!data) throw new Error("This task was changed in another tab. Refresh and review the latest version.");
    }, "Task details saved.");
  };

  return <>
    <Button type="button" size="icon" variant="ghost" disabled={disabled}
      aria-label={"Edit task " + task.title} onClick={() => setEditing((value) => !value)}>
      <Pencil className="h-4 w-4" aria-hidden="true" />
    </Button>
    {editing && <form onSubmit={save} className="basis-full space-y-2 rounded-lg border border-border p-3">
      <label htmlFor={"workspace-task-title-" + task.id} className="block text-sm font-medium">Task title</label>
      <Input id={"workspace-task-title-" + task.id} value={title} maxLength={200} required
        onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor={"workspace-task-due-edit-" + task.id} className="block text-sm font-medium">Due date (optional)</label>
      <Input id={"workspace-task-due-edit-" + task.id} type="date" value={due}
        onChange={(event) => setDue(event.target.value)} />
      <label htmlFor={"workspace-task-priority-edit-" + task.id} className="block text-sm font-medium">Priority</label>
      <select id={"workspace-task-priority-edit-" + task.id} value={priority}
        onChange={(event) => setPriority(event.target.value)}
        className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
        {WORKSPACE_TASK_PRIORITIES.map(option => <option key={option} value={option}>
          {option.slice(0, 1).toUpperCase() + option.slice(1)}
        </option>)}
      </select>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={disabled || !title.trim() ||
        (title.trim() === task.title && due === (task.due_on ?? "") && priority === task.priority)}>
        Save task details
      </Button>
    </form>}
  </>;
}
