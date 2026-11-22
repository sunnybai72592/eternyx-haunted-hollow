// Portable, explicit export of owner-chosen Workspace records (not file content).
// Whitelist public fields so internal IDs, owner IDs and storage object keys do
// not leak into downloaded project archives.
export function buildWorkspaceExport(project, tasks, items, exportedAt = new Date().toISOString()) {
  if (!project || !Array.isArray(tasks) || !Array.isArray(items)) {
    throw new Error("A project and its complete task/item records are required");
  }
  if (tasks.some((task) => task.project_id !== project.id) ||
      items.some((item) => item.project_id !== project.id)) {
    throw new Error("Export contains records from another project");
  }
  return {
    format: "eternyx.workspace.project",
    format_version: 1,
    exported_at: exportedAt,
    project: {
      name: project.name, description: project.description,
      status: project.status, created_at: project.created_at,
    },
    tasks: tasks.map((task) => ({
      title: task.title, status: task.status,
      due_on: task.due_on, created_at: task.created_at,
    })),
    items: items.map((item) => ({
      kind: item.kind, title: item.title, created_at: item.created_at,
      ...(item.kind === "note" ? { text: item.note_text } : {}),
      ...(item.kind === "link" ? { url: item.target_url } : {}),
      ...(item.kind === "file" ? {
        file: { mime_type: item.mime_type, size_bytes: item.file_size, binary_included: false },
      } : {}),
    })),
    limitations: "Private file bytes and historical revisions are not included. This is a metadata and text archive, not a complete file backup.",
  };
}

export function workspaceExportFileName(name) {
  const clean = String(name ?? "").trim().replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^\.+/, "").slice(0, 80) || "project";
  return clean + "-eternyx-workspace.json";
}

export function filterWorkspaceTasks(tasks, status, query) {
  const phrase = String(query ?? "").trim().toLocaleLowerCase();
  return tasks.filter((task) =>
    (status === "all" || task.status === status) &&
    (!phrase || (String(task.title ?? "") + " " + String(task.due_on ?? ""))
      .toLocaleLowerCase().includes(phrase))
  );
}

export function filterWorkspaceItems(items, kind, query) {
  const phrase = String(query ?? "").trim().toLocaleLowerCase();
  return items.filter((item) =>
    (kind === "all" || item.kind === kind) &&
    (!phrase || (String(item.title ?? "") + " " +
      String(item.note_text ?? "") + " " + String(item.target_url ?? ""))
      .toLocaleLowerCase().includes(phrase))
  );
}
