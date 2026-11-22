import { buildWorkspaceExport } from "./workspaceLibrary.mjs";
import { createWorkspaceFullBackup, parseWorkspaceFullBackup,
  WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "./workspaceFullBackup.mjs";
import { parseWorkspaceRestore, WORKSPACE_RESTORE_MAX_TASKS,
  WORKSPACE_RESTORE_MAX_ITEMS } from "./workspaceRestore.mjs";

export const WORKSPACE_ARCHIVE_V3 = 3;
export const WORKSPACE_ARCHIVE_STEP_LIMIT = 30;
export const WORKSPACE_ARCHIVE_TOTAL_STEPS = WORKSPACE_RESTORE_MAX_TASKS * WORKSPACE_ARCHIVE_STEP_LIMIT;
const encodedLength = (text) => new TextEncoder().encode(text).length;

const safeStep = (step, label) => {
  if (!step || typeof step !== "object" || Array.isArray(step) ||
    typeof step.title !== "string" || step.title.trim().length === 0 ||
    step.title.length > 180 || typeof step.done !== "boolean") {
    throw new Error(label + " must have a 1–180 character title and boolean done state");
  }
  return { title: step.title.trim(), done: step.done };
};

export function attachWorkspaceChecklists(tasks, steps, ownerId = null) {
  if (!Array.isArray(tasks) || !Array.isArray(steps) ||
    tasks.length > WORKSPACE_RESTORE_MAX_TASKS || steps.length > WORKSPACE_ARCHIVE_TOTAL_STEPS) {
    throw new Error("Checklist export exceeds 1,000 tasks or 30,000 steps");
  }
  const byTask = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || !task.id ||
      byTask.has(task.id) || (ownerId && task.owner_id !== ownerId)) {
      throw new Error("Checklist export contains duplicate, missing or foreign task identity");
    }
    byTask.set(task.id, []);
  }
  const seen = new Set();
  for (const step of steps) {
    if (!step || !byTask.has(step.task_id) ||
      (ownerId && step.owner_id !== ownerId) ||
      typeof step.id !== "string" || !step.id || seen.has(step.id)) {
      throw new Error("Checklist export includes an unowned, duplicate or orphan step");
    }
    seen.add(step.id);
    const list = byTask.get(step.task_id);
    if (list.length >= WORKSPACE_ARCHIVE_STEP_LIMIT) {
      throw new Error("Checklist export exceeds 30 steps for one task");
    }
    list.push({ ...safeStep(step, "Checklist step"), date: step.created_at ?? "", id: step.id });
  }
  return tasks.map((task) => ({
    task, checklist: byTask.get(task.id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id))
      .map(({ title, done }) => ({ title, done })),
  }));
}

export async function createWorkspaceArchiveV3(project, tasks, items, steps, downloadFile = null) {
  if (!project || !Array.isArray(items) || items.length > WORKSPACE_RESTORE_MAX_ITEMS) {
    throw new Error("Checklist archive needs an owned project and at most 1,000 saved items");
  }
  const matched = attachWorkspaceChecklists(tasks, steps, project.owner_id ?? null);
  const snapshot = downloadFile
    ? JSON.parse(await createWorkspaceFullBackup(project, tasks, items, downloadFile))
    : buildWorkspaceExport(project, tasks, items);
  const output = {
    ...snapshot,
    format_version: WORKSPACE_ARCHIVE_V3,
    archive_mode: downloadFile ? "files" : "metadata",
    tasks: snapshot.tasks.map((task, index) => ({ ...task, checklist: matched[index].checklist })),
    limitations: downloadFile
      ? "Current tasks, task checklist steps, notes, links and up to 8 actual private file contents. Original completion timestamps, note revisions and audit history are excluded."
      : "Current tasks and checklists, notes, links and file manifests. File contents, original completion timestamps, note revisions and audit history are excluded.",
  };
  const raw = JSON.stringify(output);
  if (encodedLength(raw) > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
    throw new Error("Checklist archive exceeds 24 MiB; no incomplete export was created");
  }
  return raw;
}

export async function parseWorkspaceArchiveV3(raw) {
  if (typeof raw !== "string" || encodedLength(raw) > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
    throw new Error("Checklist archive must be a JSON file no larger than 24 MiB");
  }
  let doc;
  try { doc = JSON.parse(raw); }
  catch { throw new Error("Checklist archive is invalid JSON"); }
  if (!doc || doc.format !== "eternyx.workspace.project" ||
      doc.format_version !== WORKSPACE_ARCHIVE_V3 ||
      !["metadata", "files"].includes(doc.archive_mode) ||
      !Array.isArray(doc.tasks) || !Array.isArray(doc.items) ||
      doc.tasks.length > WORKSPACE_RESTORE_MAX_TASKS ||
      doc.items.length > WORKSPACE_RESTORE_MAX_ITEMS) {
    throw new Error("Expected a supported ETERNYX Workspace checklist archive v3");
  }
  let stepCount = 0;
  const checklists = doc.tasks.map((task, index) => {
    if (!task || !Array.isArray(task.checklist) ||
      task.checklist.length > WORKSPACE_ARCHIVE_STEP_LIMIT) {
      throw new Error("Task " + (index + 1) + " has invalid or excessive checklist steps");
    }
    stepCount += task.checklist.length;
    if (stepCount > WORKSPACE_ARCHIVE_TOTAL_STEPS) {
      throw new Error("Checklist archive exceeds its overall step count");
    }
    return task.checklist.map((step, i) =>
      safeStep(step, "Task " + (index + 1) + " step " + (i + 1)));
  });
  if (doc.archive_mode === "metadata" &&
    doc.items.some((item) => item?.kind === "file" && item.file?.binary_included !== false)) {
    throw new Error("Metadata archive has an unexpected or incomplete private file manifest");
  }
  const legacy = JSON.stringify({
    ...doc, format_version: doc.archive_mode === "files" ? 2 : 1,
    tasks: doc.tasks.map(({ checklist, ...task }) => task),
  });
  const restored = doc.archive_mode === "files"
    ? await parseWorkspaceFullBackup(legacy)
    : parseWorkspaceRestore(legacy, { maxBytes: WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES });
  return {
    ...restored,
    archiveVersion: WORKSPACE_ARCHIVE_V3,
    archiveMode: doc.archive_mode,
    tasks: restored.tasks.map((task, index) => ({ ...task, checklist: checklists[index] })),
    stepCount,
  };
}
