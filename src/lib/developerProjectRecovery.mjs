import { normalizeDeveloperProject } from "./developerProjectLab.mjs";

export const PROJECT_RECOVERY_SCHEMA = "eternyx-project-recovery-v1";
export const PROJECT_RECOVERY_STORAGE = "eternyx:developer-recovery:v1";
export const MAX_PROJECT_RECOVERY = 5;
export const MAX_RECOVERY_IMPORT_CHARS = 165000;
const HEX = /^[a-f0-9]{64}$/;

function canonicalProject(value) {
  const project = normalizeDeveloperProject(value);
  if (!project.id) throw new Error("Recovery requires a project identifier.");
  return project;
}

export async function projectRecoveryChecksum(value) {
  const valid = canonicalProject(value);
  if (!globalThis.crypto?.subtle) throw new Error("Browser cryptography is unavailable.");
  const bytes = new TextEncoder().encode(JSON.stringify(valid));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function createProjectRecovery(value, capturedAt = new Date().toISOString()) {
  const project = canonicalProject(value);
  const iso = new Date(capturedAt).toISOString();
  if (iso !== capturedAt) throw new Error("Invalid backup timestamp.");
  return { schema: PROJECT_RECOVERY_SCHEMA, capturedAt: iso,
    checksum: await projectRecoveryChecksum(project), project };
}

export function normalizeProjectRecovery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    value.schema !== PROJECT_RECOVERY_SCHEMA || !HEX.test(value.checksum || "")) {
    throw new Error("Unsupported or corrupted recovery snapshot.");
  }
  if (typeof value.capturedAt !== "string" || value.capturedAt.length > 40 ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    new Date(value.capturedAt).toISOString() !== value.capturedAt) {
    throw new Error("Invalid recovery timestamp.");
  }
  const project = canonicalProject(value.project);
  return { schema: PROJECT_RECOVERY_SCHEMA, capturedAt: value.capturedAt, checksum: value.checksum, project };
}

export async function verifyProjectRecovery(value) {
  const snapshot = normalizeProjectRecovery(value);
  const actual = await projectRecoveryChecksum(snapshot.project);
  if (snapshot.checksum !== actual) throw new Error("Backup checksum mismatch. Restore refused; the source may have changed.");
  return snapshot;
}

export function normalizeProjectRecoveries(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  const ids = new Set();
  for (const item of value.slice(0, MAX_PROJECT_RECOVERY * 4)) {
    try {
      const record = normalizeProjectRecovery(item);
      if (ids.has(record.project.id)) continue;
      ids.add(record.project.id);
      output.push(record);
      if (output.length >= MAX_PROJECT_RECOVERY) break;
    } catch { /* Do not trust corrupt local storage. */ }
  }
  return output;
}

export function parseProjectRecoveryStorage(raw) {
  if (typeof raw !== "string" || raw.length > 950000) return [];
  try { return normalizeProjectRecoveries(JSON.parse(raw)); }
  catch { return []; }
}

export function upsertProjectRecovery(existing, snapshot) {
  const record = normalizeProjectRecovery(snapshot);
  const safe = normalizeProjectRecoveries(existing);
  return [record, ...safe.filter(item => item.project.id !== record.project.id)].slice(0, MAX_PROJECT_RECOVERY);
}

export function deleteProjectRecovery(existing, id) {
  return normalizeProjectRecoveries(existing).filter(item => item.project.id !== id);
}

export function exportProjectRecovery(value) {
  return JSON.stringify(normalizeProjectRecovery(value), null, 2);
}

export async function importProjectRecovery(raw) {
  if (typeof raw !== "string" || raw.length > MAX_RECOVERY_IMPORT_CHARS) {
    throw new Error("Backup must be under 165,000 characters.");
  }
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Backup is not valid JSON."); }
  return verifyProjectRecovery(data);
}

export function recoverySummary(snapshot) {
  const valid = normalizeProjectRecovery(snapshot);
  return { id: valid.project.id, name: valid.project.name, capturedAt: valid.capturedAt,
    files: valid.project.files.length,
    characters: valid.project.files.reduce((sum, file) => sum + file.content.length, 0) };
}
