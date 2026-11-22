export const WORKSPACE_BUCKET = "workspace-private";
export const MAX_WORKSPACE_FILE_BYTES = 5 * 1024 * 1024;
export const WORKSPACE_MIME_TYPES = Object.freeze([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "text/plain", "text/csv", "application/json",
]);

// Never turn an arbitrary note/link into a javascript:, data:, or protocol-relative URL.
export function validWorkspaceLink(value) {
  const text = String(value ?? "").trim();
  if (text.length < 2 || text.length > 2000 || /\s/.test(text)) return false;
  if (text.startsWith("/") && !text.startsWith("//") && !text.startsWith("/\\")) return true;
  if (!text.startsWith("https://")) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password;
  } catch { return false; }
}

export function workspaceFileKey(userId, projectId, fileName, fileId) {
  if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-f0-9-]{36}$/i.test(projectId) ||
      !/^[a-f0-9-]{36}$/i.test(fileId)) throw new Error("Invalid workspace file identity");
  const clean = String(fileName).replace(/[^\p{L}\p{N}._-]/gu, "_").replace(/^\.+/, "").slice(0, 90) || "file";
  return userId + "/" + projectId + "/" + fileId + "-" + clean;
}

export function workspaceFileAllowed(file) {
  return !!file && file.size > 0 && file.size <= MAX_WORKSPACE_FILE_BYTES &&
    WORKSPACE_MIME_TYPES.includes(file.type);
}

export const WORKSPACE_EVENT_LABELS = Object.freeze({
  project_created: "Project created",
  project_updated: "Project updated",
  task_created: "Task added",
  task_updated: "Task updated",
  task_deleted: "Task deleted",
  item_created: "Item saved",
  item_deleted: "Item removed",
});
