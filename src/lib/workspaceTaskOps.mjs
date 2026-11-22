// Pure helpers for real task data only. Storage and RLS remain authoritative.
const WORKSPACE_TASK_LIMIT = 5000;
const prefix = /^[\u0000-\u0020]*[=+\-@\t\r]/u;

function cell(value) {
  const text = String(value ?? "").replace(/\u0000/g, "");
  // Spreadsheet programs may execute values starting with =,+,-,@, tab,
  // or CR. Force literal data in those exported cells.
  const safe = prefix.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function buildWorkspaceTasksCsv(project, tasks) {
  if (!project || typeof project.id !== "string" || !Array.isArray(tasks) ||
      tasks.length > WORKSPACE_TASK_LIMIT ||
      tasks.some(task => task.project_id !== project.id)) {
    throw new Error("CSV requires one owned project and no more than 5,000 of its tasks");
  }
  const rows = [
    ["Title", "Details", "Status", "Priority", "Due date", "Completed at"],
    ...tasks.map(task => [
      task.title, task.details ?? "", task.status, task.priority ?? "normal",
      task.due_on, task.completed_at,
    ]),
  ];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function workspaceTaskProgress(tasks, today) {
  const counts = { total: 0, done: 0, open: 0, overdue: 0, urgentOpen: 0, percentage: 0 };
  for (const task of tasks) {
    counts.total++;
    if (task.status === "done") counts.done++;
    else {
      counts.open++;
      if (task.due_on && task.due_on < today) counts.overdue++;
      if (task.priority === "urgent") counts.urgentOpen++;
    }
  }
  counts.percentage = counts.total ? Math.round(100 * counts.done / counts.total) : 0;
  return counts;
}

export function copyWorkspaceTask(task, ownerId, projectId) {
  if (typeof ownerId !== "string" || !ownerId || typeof projectId !== "string" ||
      !projectId || !task || task.project_id !== projectId) {
    throw new Error("Can only copy a task into its currently selected project");
  }
  const original = String(task.title ?? "").trim();
  if (!original) throw new Error("Task title is missing");
  const title = ("Copy of " + original).slice(0, 200);
  return {
    owner_id: ownerId, project_id: projectId, title,
    details: String(task.details ?? "").slice(0, 4000),
    due_on: task.due_on ?? null,
    priority: ["low", "normal", "high", "urgent"].includes(task.priority) ? task.priority : "normal",
    status: "todo",
    // Do not copy the completion timestamp or original task/checklist IDs.
  };
}
