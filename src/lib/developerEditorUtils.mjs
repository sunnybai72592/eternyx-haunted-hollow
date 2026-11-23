import {
  MAX_FILE_CHARS, addDeveloperFile, checkProjectFileName,
  normalizeDeveloperProject,
} from "./developerProjectLab.mjs";

const INDENT = "  ";
const MAX_JS_ISSUES = 80;

export function editorCursorInfo(text, start = 0, end = start) {
  const source = String(text);
  const pos = Math.max(0, Math.min(source.length, Number.isFinite(start) ? Math.floor(start) : 0));
  const rangeEnd = Math.max(pos, Math.min(source.length, Number.isFinite(end) ? Math.floor(end) : pos));
  const prefix = source.slice(0, pos);
  const line = prefix.split("\n").length;
  const lastNewline = prefix.lastIndexOf("\n");
  return { line, column: pos - lastNewline, selected: rangeEnd - pos, lines: source.split("\n").length, chars: source.length };
}

export function editorTabChange(text, start, end = start, shift = false) {
  if (typeof text !== "string" || text.length > MAX_FILE_CHARS) throw new Error("File is too large.");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new Error("Invalid editor selection.");
  }
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const selectionHasLines = text.slice(start, end).includes("\n");
  if (!selectionHasLines && !shift) {
    const value = text.slice(0, start) + INDENT + text.slice(end);
    if (value.length > MAX_FILE_CHARS) throw new Error("File would exceed 20,000 characters.");
    return { value, start: start + 2, end: start + 2 };
  }
  const lastIncludedPosition = selectionHasLines && end > start && text[end - 1] === "\n" ? end - 1 : end;
  const followingNewline = text.indexOf("\n", Math.max(lineStart, lastIncludedPosition));
  const lineEnd = followingNewline === -1 ? text.length : followingNewline;
  const segment = text.slice(lineStart, lineEnd);
  const lines = segment.split("\n");
  let offset = 0;
  const changes = [];
  const edited = lines.map((line) => {
    const at = lineStart + offset;
    offset += line.length + 1;
    if (!shift) {
      changes.push({ at, removed: 0, added: 2 });
      return INDENT + line;
    }
    const removed = line.startsWith("\t") ? 1 : line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
    if (removed) changes.push({ at, removed, added: 0 });
    return line.slice(removed);
  });
  if (!selectionHasLines && shift && !changes.length) return { value: text, start, end };
  const value = text.slice(0, lineStart) + edited.join("\n") + text.slice(lineEnd);
  if (value.length > MAX_FILE_CHARS) throw new Error("File would exceed 20,000 characters.");
  const remap = (index) => {
    let result = index;
    for (const edit of changes) {
      if (index < edit.at) continue;
      if (index < edit.at + edit.removed) result -= index - edit.at;
      else result += edit.added - edit.removed;
    }
    return Math.max(0, Math.min(result, value.length));
  };
  return { value, start: remap(start), end: remap(end) };
}

export function formatProjectJson(text) {
  if (typeof text !== "string" || text.length > MAX_FILE_CHARS) throw new Error("File is too large.");
  let formatted;
  try { formatted = JSON.stringify(JSON.parse(text), null, 2) + "\n"; }
  catch { throw new Error("The selected file is not valid JSON. Fix syntax before formatting."); }
  if (formatted.length > MAX_FILE_CHARS) throw new Error("Formatting would exceed the per-file limit.");
  return formatted;
}

export function normalizeProjectWhitespace(text, { trimTrailing = false } = {}) {
  if (typeof text !== "string" || text.length > MAX_FILE_CHARS) throw new Error("File is too large.");
  const normalized = text.replace(/\r\n?/g, "\n");
  return trimTrailing ? normalized.replace(/[ \t]+(?=\n|$)/g, "") : normalized;
}

export function duplicateDeveloperFile(project, filename) {
  const valid = normalizeDeveloperProject(project);
  const original = valid.files.find(file => file.name === filename);
  if (!original) throw new Error("File not found.");
  const point = original.name.lastIndexOf(".");
  const stem = original.name.slice(0, point);
  const ext = original.name.slice(point);
  const names = new Set(valid.files.map(file => file.name.toLowerCase()));
  for (let attempt = 1; attempt < 100; attempt++) {
    const suffix = attempt === 1 ? "-copy" : "-copy-" + attempt;
    const newName = stem.slice(0, Math.max(1, 64 - ext.length - suffix.length)) + suffix + ext;
    if (names.has(newName.toLowerCase())) continue;
    checkProjectFileName(newName);
    return { project: addDeveloperFile(valid, newName, original.content), name: newName };
  }
  throw new Error("Could not find a free file name.");
}

export function filterProjectFilenames(project, term) {
  const valid = normalizeDeveloperProject(project);
  const needle = String(term || "").trim().slice(0, 80).toLocaleLowerCase();
  return valid.files.filter(file => file.name.toLocaleLowerCase().includes(needle)).map(file => file.name);
}

export async function validateProjectJavascript(project) {
  const valid = normalizeDeveloperProject(project);
  const ts = await import("typescript");
  const findings = [];
  let filesChecked = 0;
  for (const file of valid.files) {
    if (!file.name.toLowerCase().endsWith(".js")) continue;
    filesChecked++;
    const source = ts.createSourceFile(file.name, file.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    for (const diagnostic of source.parseDiagnostics) {
      const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.start || 0);
      findings.push({ file: file.name, line: line + 1, column: character + 1, code: diagnostic.code,
        message: "JavaScript parser reported a syntax error at this location." });
      if (findings.length >= MAX_JS_ISSUES) return { filesChecked, issues: findings, truncated: true };
    }
  }
  return { filesChecked, issues: findings, truncated: false };
}

export async function exportJavascriptValidationReport(project) {
  const valid = normalizeDeveloperProject(project);
  const result = await validateProjectJavascript(valid);
  return JSON.stringify({
    schema: "eternyx-javascript-parser-report-v1",
    generatedAt: new Date().toISOString(),
    scope: "TypeScript JavaScript parser syntax only; no evaluation, compilation, type checking or runtime proof.",
    filesChecked: result.filesChecked,
    truncated: result.truncated,
    issues: result.issues.map(({ file, line, column, code }) => ({ file, line, column, code })),
  }, null, 2);
}
