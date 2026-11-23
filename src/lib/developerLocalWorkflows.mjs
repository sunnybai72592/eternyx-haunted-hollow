import {
  MAX_FILE_CHARS, MAX_PROJECT_CHARS, MAX_PROJECT_FILES,
  checkProjectFileName, editDeveloperFile, normalizeDeveloperProject,
} from "./developerProjectLab.mjs";

export const MAX_DEVELOPER_UPLOAD_BYTES = 120000;
export const PREVIEW_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "fluid", label: "Fluid", width: null }),
  Object.freeze({ id: "phone", label: "Phone 375", width: 375 }),
  Object.freeze({ id: "tablet", label: "Tablet 768", width: 768 }),
  Object.freeze({ id: "desktop", label: "Desktop 1200", width: 1200 }),
]);

export function developerPreviewWidth(mode) {
  const found = PREVIEW_VIEWPORTS.find(view => view.id === mode);
  if (!found) throw new Error("Unsupported preview viewport preset.");
  return found.width;
}

export function developerLinePosition(source, line, column = 1) {
  if (typeof source !== "string" || !Number.isInteger(line) || !Number.isInteger(column)) {
    throw new Error("Enter a valid integer line and column.");
  }
  const rows = source.split("\n");
  if (line < 1 || line > rows.length || column < 1) {
    throw new Error("Requested line is outside the current file.");
  }
  const index = rows.slice(0, line - 1).reduce((n, row) => n + row.length + 1, 0) +
    Math.min(column - 1, rows[line - 1].length);
  return { index, line, column: Math.min(column, rows[line - 1].length + 1) };
}

export function restoreSavedDeveloperFile(project, savedBaseline, filename) {
  const current = normalizeDeveloperProject(project);
  const baseline = normalizeDeveloperProject(savedBaseline);
  if (!current.id || baseline.id !== current.id) {
    throw new Error("The saved file belongs to a different project.");
  }
  const found = baseline.files.find(f => f.name === filename);
  if (!found) throw new Error("The selected file is not in the saved version.");
  if (!current.files.some(f => f.name === filename)) throw new Error("The selected working file is missing.");
  return editDeveloperFile(current, filename, found.content);
}

export function mergeDeveloperLocalTextFiles(project, entries, { overwrite = false } = {}) {
  const current = normalizeDeveloperProject(project);
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_PROJECT_FILES) {
    throw new Error("Select between 1 and 12 local text files.");
  }
  if (overwrite !== true && overwrite !== false) throw new Error("Invalid overwrite option.");
  const files = [...current.files];
  const indexByName = new Map(files.map((f, i) => [f.name.toLowerCase(), i]));
  const namesThisBatch = new Set();
  const added = [], replaced = [];
  let selectedName = "";
  for (const entry of entries) {
    const name = checkProjectFileName(entry?.name);
    if (typeof entry.content !== "string" || entry.content.length > MAX_FILE_CHARS ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry.content)) {
      throw new Error("Each local file must be safe UTF-8 text within 20,000 characters.");
    }
    const key = name.toLowerCase();
    if (namesThisBatch.has(key)) throw new Error("Duplicate file name in local import.");
    namesThisBatch.add(key);
    const existing = indexByName.get(key);
    if (existing !== undefined) {
      if (!overwrite) throw new Error("A project file already exists. Enable explicit replace to overwrite.");
      files[existing] = { name: files[existing].name, content: entry.content };
      replaced.push(files[existing].name);
      selectedName = files[existing].name;
    } else {
      if (files.length >= MAX_PROJECT_FILES) throw new Error("12-file limit reached.");
      files.push({ name, content: entry.content });
      indexByName.set(key, files.length - 1);
      added.push(name);
      selectedName = name;
    }
  }
  const next = normalizeDeveloperProject({ ...current, files });
  const chars = next.files.reduce((n, file) => n + file.content.length, 0);
  if (chars > MAX_PROJECT_CHARS) throw new Error("Project exceeds 90,000 characters.");
  return { project: next, added, replaced, selectedName };
}

/** Read only explicitly selected local browser File objects, never directory paths. */
export async function readDeveloperLocalTextFiles(selected) {
  const files = Array.from(selected || []);
  if (files.length < 1 || files.length > MAX_PROJECT_FILES) {
    throw new Error("Select between 1 and 12 local text files.");
  }
  let totalBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const output = [];
  for (const file of files) {
    const name = checkProjectFileName(file?.name);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 80000) {
      throw new Error("Each selected file must be at most 80 KB.");
    }
    totalBytes += file.size;
    if (totalBytes > MAX_DEVELOPER_UPLOAD_BYTES) throw new Error("Selected files exceed the 120 KB import limit.");
    if (typeof file.arrayBuffer !== "function") throw new Error("Cannot read the selected local file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size || bytes.byteLength > 80000) {
      throw new Error("Local file size changed while reading; import cancelled.");
    }
    let value;
    try { value = decoder.decode(bytes).replace(/^\uFEFF/, ""); }
    catch { throw new Error("Only valid UTF-8 text files are supported."); }
    if (value.length > MAX_FILE_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      throw new Error("The selected local file contains binary data or exceeds 20,000 characters.");
    }
    output.push({ name, content: value });
  }
  return output;
}
