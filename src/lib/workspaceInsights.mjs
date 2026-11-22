// Real, owner-loaded Workspace insights. Never fabricate scores or totals.
// Server-side quotas are authoritative; these sums are registered rows only.
export const WORKSPACE_PROJECT_LIMIT = 100;
export const WORKSPACE_TASK_LIMIT = 5000;
export const WORKSPACE_ITEM_LIMIT = 5000;
export const WORKSPACE_REGISTERED_FILE_BYTES_LIMIT = 100 * 1024 * 1024;

export function workspaceRegisteredBytes(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => (
    sum + (item?.kind === "file" && Number.isSafeInteger(item.file_size) && item.file_size > 0
      ? item.file_size : 0)
  ), 0);
}

export function workspaceByteLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return Math.round(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
}

export function sortWorkspaceProjects(projects) {
  return [...projects].sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) ||
    String(a.name).localeCompare(String(b.name))
  );
}

// Only searches the actual authenticated rows already loaded and RLS-protected.
// The UI explicitly reports that an over-limit library is not silently searched.
export function searchWorkspaceRecords(projects, tasks, items, input, maxResults = 30) {
  const query = String(input ?? "").trim().toLocaleLowerCase().slice(0, 80);
  if (query.length < 2) return [];
  const bounded = Number.isInteger(maxResults) ? Math.max(1, Math.min(maxResults, 100)) : 30;
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const results = [];

  const append = (kind, id, project, title, detail) => {
    if (results.length >= bounded) return;
    results.push({
      kind, id, projectId: project.id, projectName: project.name,
      title: String(title).slice(0, 200), detail: String(detail ?? "").slice(0, 240),
    });
  };

  for (const project of sortWorkspaceProjects(projects)) {
    if (results.length >= bounded) break;
    if ((project.name + " " + (project.description ?? "")).toLocaleLowerCase().includes(query)) {
      append("project", project.id, project, project.name, project.description);
    }
  }
  for (const task of tasks) {
    if (results.length >= bounded) break;
    const project = projectById.get(task.project_id);
    if (!project) continue;
    if ((task.title + " " + (task.due_on ?? "")).toLocaleLowerCase().includes(query)) {
      append("task", task.id, project, task.title, task.due_on || task.status);
    }
  }
  for (const item of items) {
    if (results.length >= bounded) break;
    const project = projectById.get(item.project_id);
    if (!project) continue;
    if ((item.title + " " + (item.note_text ?? "") + " " +
      (item.target_url ?? "")).toLocaleLowerCase().includes(query)) {
      append("item", item.id, project, item.title, item.kind);
    }
  }
  return results;
}
