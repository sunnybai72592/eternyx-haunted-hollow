import {
  editDeveloperFile, normalizeDeveloperProject,
} from "./developerProjectLab.mjs";

export const MAX_EDITOR_UNDO = 16;
export const DEVELOPER_REVISION_REPORT_SCHEMA = "eternyx-developer-revisions-v1";
const MAX_DIFF_SNIPPET_LINES = 8;

export function createDeveloperEditHistory(projectId) {
  if (typeof projectId !== "string" || !/^[a-z0-9-]{1,64}$/i.test(projectId)) {
    throw new Error("Editor history requires a valid project identifier.");
  }
  return { projectId, files: {} };
}

function getValidFile(project, filename) {
  const current = normalizeDeveloperProject(project);
  const found = current.files.find(file => file.name === filename);
  if (!found) throw new Error("Editor file no longer exists.");
  return { current, found };
}

function safeState(history, project, filename) {
  const { current, found } = getValidFile(project, filename);
  if (!history || history.projectId !== current.id || !history.files || typeof history.files !== "object") {
    throw new Error("Editor history belongs to a different project.");
  }
  const entry = Object.hasOwn(history.files, filename) ? history.files[filename] : null;
  if (!entry || entry.current !== found.content) return {
    current, found, entry: { undo: [], redo: [], current: found.content },
  };
  return { current, found, entry };
}

export function editDeveloperWithHistory(history, project, filename, content) {
  if (typeof content !== "string") throw new Error("Only plain text editor content is supported.");
  const { current, found, entry } = safeState(history, project, filename);
  const next = editDeveloperFile(current, filename, content);
  if (content === found.content) return { project: current, history };
  const updated = {
    current: content,
    undo: [...entry.undo, found.content].slice(-MAX_EDITOR_UNDO),
    redo: [],
  };
  return { project: next, history: { ...history, files: { ...history.files, [filename]: updated } } };
}

export function developerEditHistoryCounts(history, project, filename) {
  try {
    const { entry } = safeState(history, project, filename);
    return { undo: entry.undo.length, redo: entry.redo.length };
  } catch {
    return { undo: 0, redo: 0 };
  }
}

export function stepDeveloperEditHistory(history, project, filename, direction) {
  if (direction !== "undo" && direction !== "redo") throw new Error("Unknown editor history direction.");
  const { current, found, entry } = safeState(history, project, filename);
  const key = direction === "undo" ? "undo" : "redo";
  const opposite = direction === "undo" ? "redo" : "undo";
  if (entry[key].length === 0) return { changed: false, project: current, history };
  const value = entry[key].at(-1);
  const next = editDeveloperFile(current, filename, value);
  const updated = {
    ...entry, current: value,
    [key]: entry[key].slice(0, -1),
    [opposite]: [...entry[opposite], found.content].slice(-MAX_EDITOR_UNDO),
  };
  return { changed: true, project: next,
    history: { ...history, files: { ...history.files, [filename]: updated } } };
}

function splitFileLines(file) {
  return file ? file.content.split("\n") : [];
}

export function inspectDeveloperRevision(project, savedBaseline = null) {
  const working = normalizeDeveloperProject(project);
  const saved = savedBaseline ? normalizeDeveloperProject(savedBaseline) : null;
  if (saved && saved.id !== working.id) throw new Error("Saved comparison belongs to another project.");
  const previous = new Map((saved?.files || []).map(f => [f.name.toLowerCase(), f]));
  const current = new Map(working.files.map(f => [f.name.toLowerCase(), f]));
  const names = [...new Set([...previous.keys(), ...current.keys()])];
  const changes = [];
  for (const key of names) {
    const before = previous.get(key) || null;
    const after = current.get(key) || null;
    const oldLines = splitFileLines(before);
    const newLines = splitFileLines(after);
    if (before && after && before.name === after.name && before.content === after.content) continue;
    let prefix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
    let suffix = 0;
    while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix &&
      oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]) suffix++;
    const removed = oldLines.slice(prefix, oldLines.length - suffix);
    const inserted = newLines.slice(prefix, newLines.length - suffix);
    changes.push({
      filename: after?.name || before.name,
      status: !before ? "added" : !after ? "deleted" : "modified",
      oldLine: before ? prefix + 1 : 0,
      newLine: after ? prefix + 1 : 0,
      beforeLines: oldLines.length,
      afterLines: newLines.length,
      removedLines: removed.length,
      addedLines: inserted.length,
      // Full source is *never* exported. Excerpts are shown only locally.
      removedPreview: removed.slice(0, MAX_DIFF_SNIPPET_LINES),
      addedPreview: inserted.slice(0, MAX_DIFF_SNIPPET_LINES),
      truncated: removed.length > MAX_DIFF_SNIPPET_LINES || inserted.length > MAX_DIFF_SNIPPET_LINES,
    });
  }
  return changes;
}

export function exportDeveloperRevisionReport(project, savedBaseline = null) {
  const changes = inspectDeveloperRevision(project, savedBaseline);
  const items = changes.map(({ filename, status, oldLine, newLine,
    beforeLines, afterLines, removedLines, addedLines, truncated }) =>
    ({ filename, status, oldLine, newLine, beforeLines, afterLines, removedLines, addedLines, truncated }));
  return JSON.stringify({
    schema: DEVELOPER_REVISION_REPORT_SCHEMA,
    createdAt: new Date().toISOString(),
    sourceExcluded: true,
    scope: "Single contiguous changed-line region after common prefix/suffix; not a Git diff, audit or source review.",
    changedFiles: items.length,
    changes: items,
  }, null, 2);
}
