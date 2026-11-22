// Deterministic views of actual, owner-scoped Workspace tasks.
// No fabricated scores, simulated reminders, or background notifications.
export const WORKSPACE_TASK_PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);
const rank = Object.freeze({ low: 1, normal: 2, high: 3, urgent: 4 });
const safePriority = (value) => rank[value] ? value : "normal";
const comparePriority = (a, b) => rank[safePriority(b.priority)] - rank[safePriority(a.priority)];
const compareDue = (a, b) => (a.due_on || "9999-12-31").localeCompare(b.due_on || "9999-12-31");
const compareId = (a, b) => String(a.id).localeCompare(String(b.id));

export function validWorkspacePriority(value) {
  return typeof value === "string" && WORKSPACE_TASK_PRIORITIES.includes(value);
}

export function sortWorkspaceProjectTasks(tasks, sort = "due") {
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    if (sort === "priority") return comparePriority(a, b) || compareDue(a, b) || compareId(a, b);
    if (sort === "recent") return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) ||
      compareId(a, b);
    if (sort === "status") return Number(a.status === "done") - Number(b.status === "done") ||
      comparePriority(a, b) || compareDue(a, b) || compareId(a, b);
    return compareDue(a, b) || comparePriority(a, b) || compareId(a, b);
  });
  return sorted;
}

export function filterWorkspaceTaskPriority(tasks, filter) {
  if (filter === "all") return tasks;
  if (!validWorkspacePriority(filter)) return [];
  return tasks.filter((task) => safePriority(task.priority) === filter);
}

export function buildWorkspaceFocus(projects, tasks, today, maxResults = 80) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const candidate = [];
  for (const task of tasks) {
    if (task.status === "done") continue;
    const project = projectById.get(task.project_id);
    if (!project) continue; // Never expose a task without its owned project.
    const group = !task.due_on ? "unscheduled" :
      task.due_on < today ? "overdue" :
      task.due_on === today ? "today" : "upcoming";
    candidate.push({
      id: task.id, projectId: project.id, projectName: project.name,
      title: task.title, due_on: task.due_on, status: task.status,
      priority: safePriority(task.priority),
      archived: project.status === "archived", group,
    });
  }
  const priorityOf = (value) => rank[value.priority] ?? 2;
  const groups = Object.fromEntries(["overdue", "today", "upcoming", "unscheduled"].map(key => [key, []]));
  for (const task of candidate) groups[task.group].push(task);
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) =>
      Number(a.archived) - Number(b.archived) ||
      priorityOf(b) - priorityOf(a) ||
      compareDue(a, b) || compareId(a, b));
  }
  const limit = Number.isInteger(maxResults) ? Math.max(1, Math.min(200, maxResults)) : 80;
  const ordered = ["overdue", "today", "upcoming", "unscheduled"]
    .flatMap((group) => groups[group]);
  const results = ordered.slice(0, limit);
  return {
    results,
    total: candidate.length,
    remaining: Math.max(0, candidate.length - results.length),
    counts: {
      overdue: groups.overdue.length, today: groups.today.length,
      upcoming: groups.upcoming.length, unscheduled: groups.unscheduled.length,
    },
  };
}
