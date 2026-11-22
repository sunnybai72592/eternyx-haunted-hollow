import { validWorkspaceLink } from "./workspaceRules.mjs";
import { validWorkspacePriority } from "./workspaceTaskFocus.mjs";

export const WORKSPACE_RESTORE_MAX_BYTES = 1024 * 1024;
export const WORKSPACE_RESTORE_MAX_TASKS = 1000;
export const WORKSPACE_RESTORE_MAX_ITEMS = 1000;

const textIn = (value, max, label, min = 0) => {
  if (typeof value !== "string" || value.length > max || value.trim().length < min) {
    throw new Error(label + " must be between " + min + " and " + max + " characters");
  }
  return value.trim();
};
const isoDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Task due date must be YYYY-MM-DD");
  }
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Task due date is not a real calendar date");
  }
  return value;
};

export function parseWorkspaceRestore(raw, options = {}) {
  const maxBytes = options.maxBytes === 24 * 1024 * 1024
    ? options.maxBytes : WORKSPACE_RESTORE_MAX_BYTES;
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > maxBytes) {
    throw new Error("Import must be UTF-8 JSON no larger than " +
      (maxBytes === WORKSPACE_RESTORE_MAX_BYTES ? "1 MiB" : "24 MiB"));
  }
  let document;
  try { document = JSON.parse(raw); }
  catch { throw new Error("The selected file is not valid JSON"); }
  if (!document || typeof document !== "object" || Array.isArray(document) ||
      document.format !== "eternyx.workspace.project" || document.format_version !== 1 ||
      !document.project || !Array.isArray(document.tasks) || !Array.isArray(document.items)) {
    throw new Error("Import requires a supported ETERNYX Workspace project export (version 1)");
  }
  if (document.tasks.length > WORKSPACE_RESTORE_MAX_TASKS || document.items.length > WORKSPACE_RESTORE_MAX_ITEMS) {
    throw new Error("Import exceeds the 1,000-task or 1,000-item limit");
  }
  const project = {
    name: textIn(document.project.name, 120, "Project name", 1),
    description: textIn(document.project.description ?? "", 2000, "Project description"),
  };
  const tasks = document.tasks.map((task, index) => {
    if (!task || typeof task !== "object" || Array.isArray(task) ||
        !["todo","in_progress","done"].includes(task.status)) {
      throw new Error("Task " + (index + 1) + " has an invalid status");
    }
    const priority = task.priority === undefined ? "normal" : task.priority;
    if (!validWorkspacePriority(priority)) throw new Error("Task " + (index + 1) + " has an invalid priority");
    return {
      title: textIn(task.title, 200, "Task " + (index + 1) + " title", 1),
      details: textIn(task.details ?? "", 4000, "Task details"),
      status: task.status, priority,
      due_on: isoDate(task.due_on),
    };
  });
  let filesSkipped = 0;
  const items = [];
  document.items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Item " + (index + 1) + " is invalid");
    }
    if (item.kind === "file") {
      // Exported file manifests cannot be restored without binary content.
      filesSkipped++;
      return;
    }
    if (item.kind !== "note" && item.kind !== "link") {
      throw new Error("Item " + (index + 1) + " has an unsupported type");
    }
    const title = textIn(item.title, 160, "Item title", 1);
    if (item.kind === "note") {
      const note_text = textIn(item.text, 12000, "Note body", 1);
      items.push({ kind: "note", title, note_text, target_url: null });
    } else {
      const target_url = textIn(item.url, 2000, "Saved link", 2);
      if (!validWorkspaceLink(target_url)) throw new Error("Item " + (index + 1) + " has an unsafe or invalid link");
      items.push({ kind: "link", title, note_text: null, target_url });
    }
  });
  return { project, tasks, items, filesSkipped };
}

export function scheduleLabel(dueOn, today) {
  if (!dueOn) return "No due date";
  if (dueOn < today) return "Overdue";
  if (dueOn === today) return "Due today";
  return "Upcoming";
}

export function filterScheduledTasks(tasks, window, today) {
  if (window === "all") return tasks;
  return tasks.filter((task) => {
    const kind = scheduleLabel(task.due_on, today);
    return window === "unscheduled" ? kind === "No due date"
      : window === "overdue" ? kind === "Overdue" && task.status !== "done"
      : window === "today" ? kind === "Due today" && task.status !== "done"
      : window === "upcoming" ? kind === "Upcoming" && task.status !== "done"
      : false;
  });
}

export function localCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
