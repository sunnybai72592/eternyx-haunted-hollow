import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWorkspaceFocus } from "@/lib/workspaceTaskFocus.mjs";
import { localCalendarDate } from "@/lib/workspaceRestore.mjs";
import type { Database } from "@/integrations/supabase/types";

type Project = Database["public"]["Tables"]["workspace_projects"]["Row"];
type Task = Database["public"]["Tables"]["workspace_tasks"]["Row"];
const groups = [
  { key: "all", label: "All outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "unscheduled", label: "No due date" },
] as const;

export default function WorkspaceTaskFocus({
  projects, tasks, disabled, onOpen, onComplete,
}: {
  projects: Project[];
  tasks: Task[];
  disabled: boolean;
  onOpen: (projectId: string, taskId: string) => void;
  onComplete: (task: Task) => void;
}) {
  const [group, setGroup] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const today = localCalendarDate();
  const focus = useMemo(() =>
    buildWorkspaceFocus(projects, tasks, today, showAll ? 200 : 40),
    [projects, tasks, today, showAll]);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const displayed = group === "all" ? focus.results : focus.results.filter(task => task.group === group);

  return <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6"
    aria-label="Your work across projects">
    <div className="flex items-center gap-2">
      <CalendarClock className="h-5 w-5 text-cyan-400" aria-hidden="true" />
      <h2 className="text-xl font-semibold">My work across projects</h2>
    </div>
    <p className="text-sm text-muted-foreground">
      Real, unfinished tasks from your private Workspace. Archived projects are visible but cannot be edited.
      This is a live-on-refresh task view, not a notification service.
    </p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Focus on a task window">
      {groups.map(option => <Button key={option.key} type="button" size="sm"
        variant={group === option.key ? "default" : "outline"}
        onClick={() => setGroup(option.key)}>
        {option.label}{option.key !== "all" ? " (" + focus.counts[option.key] + ")" :
          " (" + focus.total + ")"}
      </Button>)}
    </div>
    <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
      {displayed.map(entry => {
        const task = tasksById.get(entry.id);
        return <div key={entry.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-medium">{entry.title}</p>
            <p className="text-xs text-muted-foreground">
              {entry.projectName} · {entry.priority} priority ·
              {entry.due_on ? " " + entry.due_on : " no due date"}
              {entry.archived ? " · archived (read-only)" : ""}
            </p>
          </div>
          <Button size="sm" type="button" variant="outline" disabled={disabled}
            onClick={() => onOpen(entry.projectId, entry.id)}>
            <FolderOpen className="mr-1 h-4 w-4" aria-hidden="true" /> Open
          </Button>
          {!entry.archived && task && <Button size="sm" type="button" variant="outline"
            disabled={disabled} onClick={() => onComplete(task)}>
            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> Done
          </Button>}
        </div>;
      })}
      {!displayed.length &&
        <p className="py-4 text-sm text-muted-foreground">No outstanding tasks in this group.</p>}
    </div>
    {focus.remaining > 0 && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Showing {focus.results.length} of {focus.total} unfinished tasks.</span>
      {!showAll && <Button type="button" size="sm" variant="outline" onClick={() => setShowAll(true)}>
        Show more work (up to 200)
      </Button>}
      {showAll && <span>Open a project to see the remaining tasks.</span>}
    </div>}
  </section>;
}
