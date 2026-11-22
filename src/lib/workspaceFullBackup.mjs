import { buildWorkspaceExport } from "./workspaceLibrary.mjs";
import { parseWorkspaceRestore, WORKSPACE_RESTORE_MAX_ITEMS, WORKSPACE_RESTORE_MAX_TASKS } from "./workspaceRestore.mjs";
import { MAX_WORKSPACE_FILE_BYTES, WORKSPACE_MIME_TYPES } from "./workspaceRules.mjs";

// This is an intentionally small, explicit portable backup, NOT unlimited
// account storage or a promise of server-side retention.
export const WORKSPACE_BACKUP_MAX_FILES = 8;
export const WORKSPACE_BACKUP_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;

const bytesOf = (value) => new TextEncoder().encode(value).length;

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}
function encodeBytes(bytes) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(result);
}
function decodeBytes(value, declaredSize) {
  if (typeof value !== "string" || value.length > Math.ceil(declaredSize / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Backup file content is not valid canonical base64");
  }
  let binary;
  try { binary = atob(value); }
  catch { throw new Error("Backup file content cannot be decoded"); }
  if (binary.length !== declaredSize) throw new Error("Backup file size does not match manifest");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function requireFileManifest(item) {
  const file = item?.file;
  if (item?.kind !== "file" || typeof item.title !== "string" ||
      !item.title.trim() || item.title.length > 160 ||
      !file || typeof file !== "object" || Array.isArray(file) ||
      !Number.isInteger(file.size_bytes) || file.size_bytes < 1 ||
      file.size_bytes > MAX_WORKSPACE_FILE_BYTES ||
      !WORKSPACE_MIME_TYPES.includes(file.mime_type) ||
      file.binary_included !== true ||
      typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new Error("Backup includes an invalid file manifest");
  }
  return file;
}
function enforceCount(items, tasks) {
  if (items.length > WORKSPACE_RESTORE_MAX_ITEMS || tasks.length > WORKSPACE_RESTORE_MAX_TASKS) {
    throw new Error("This project exceeds the portable backup limit of 1,000 tasks or 1,000 items");
  }
  const files = items.filter((item) => item.kind === "file");
  if (files.length > WORKSPACE_BACKUP_MAX_FILES) {
    throw new Error("Complete backup supports up to " + WORKSPACE_BACKUP_MAX_FILES +
      " private files. Use the regular metadata export instead.");
  }
  const total = files.reduce((sum, item) => sum + Number(item.file_size ?? item.file?.size_bytes ?? 0), 0);
  if (total > WORKSPACE_BACKUP_MAX_FILE_BYTES) {
    throw new Error("Complete backup has a 12 MiB total private-file limit. Use the metadata export.");
  }
  return files;
}

export async function createWorkspaceFullBackup(project, tasks, items, downloadFile) {
  if (!Array.isArray(tasks) || !Array.isArray(items) || typeof downloadFile !== "function") {
    throw new Error("Complete backup requires project records and a private download handler");
  }
  const files = enforceCount(items, tasks);
  const base = buildWorkspaceExport(project, tasks, items);
  const byName = new Map();
  for (const item of items) {
    if (item.kind !== "file") continue;
    if (typeof item.storage_path !== "string" || !item.storage_path ||
      !WORKSPACE_MIME_TYPES.includes(item.mime_type) ||
      !Number.isInteger(item.file_size) || item.file_size < 1 ||
      item.file_size > MAX_WORKSPACE_FILE_BYTES) {
      throw new Error("Private file metadata is not valid for a complete backup");
    }
    const blob = await downloadFile(item.storage_path);
    if (!(blob instanceof Blob) || blob.size !== item.file_size) {
      throw new Error("A private file could not be verified; no incomplete backup was generated");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    byName.set(item.storage_path, {
      mime_type: item.mime_type, size_bytes: bytes.length,
      binary_included: true, sha256: await sha256(bytes),
      base64: encodeBytes(bytes),
    });
  }
  const output = {
    ...base, format_version: 2,
    items: base.items.map((entry, i) => items[i].kind === "file"
      ? { ...entry, file: byName.get(items[i].storage_path) } : entry),
    limitations: "Complete, size-bounded backup of current tasks, notes, links and private file bytes. Historical note revisions and project activity are not included.",
  };
  const raw = JSON.stringify(output);
  if (bytesOf(raw) > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
    throw new Error("Complete backup exceeds the 24 MiB JSON limit; use the metadata export");
  }
  if (files.length !== byName.size) throw new Error("Private file backup was incomplete");
  return raw;
}

export async function parseWorkspaceFullBackup(raw) {
  if (typeof raw !== "string" || bytesOf(raw) > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
    throw new Error("Complete backup must be 24 MiB or smaller");
  }
  let document;
  try { document = JSON.parse(raw); }
  catch { throw new Error("Not a valid JSON backup"); }
  if (!document || document.format !== "eternyx.workspace.project" ||
      document.format_version !== 2 || !Array.isArray(document.tasks) ||
      !Array.isArray(document.items)) {
    throw new Error("Expected an ETERNYX full Workspace backup (version 2)");
  }
  const manifests = enforceCount(document.items, document.tasks);
  // Reuse the exact v1 text and link validator after stripping binary fields;
  // never let an uploaded backup dictate project IDs or Storage object paths.
  const textVersion = JSON.stringify({
    format: document.format, format_version: 1,
    project: document.project, tasks: document.tasks,
    items: document.items.map((item) => item.kind === "file" ?
      { kind: "file", title: item.title } : item),
  });
  const restored = parseWorkspaceRestore(textVersion);
  const files = [];
  let totalBytes = 0;
  for (const item of manifests) {
    const file = requireFileManifest(item);
    totalBytes += file.size_bytes;
    if (totalBytes > WORKSPACE_BACKUP_MAX_FILE_BYTES) throw new Error("Backup exceeds 12 MiB of private file content");
    const bytes = decodeBytes(file.base64, file.size_bytes);
    if (await sha256(bytes) !== file.sha256) {
      throw new Error("Backup integrity verification failed for " + item.title);
    }
    files.push({ title: item.title, mime_type: file.mime_type, size_bytes: bytes.length, bytes });
  }
  return { ...restored, files, filesSkipped: 0 };
}
