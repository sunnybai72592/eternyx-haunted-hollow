// Private, owner-scoped import primitives: hashes are identity/detection tools,
// not digital signatures or encryption. Never persist the user's raw archive.
export const WORKSPACE_IMPORT_TASK_BATCH_SIZE = 25;
export const WORKSPACE_IMPORT_ITEM_BATCH_SIZE = 25;

export async function sha256Hex(bytes) {
  const binary = bytes instanceof Uint8Array ? bytes :
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : null;
  if (!binary) throw new Error("Cannot fingerprint invalid import data");
  const digest = await crypto.subtle.digest("SHA-256", binary);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

export function importManifest(parsed, fingerprint, version) {
  if (!parsed || !/^[0-9a-f]{64}$/.test(fingerprint) ||
    ![1, 2, 3].includes(version) ||
    !Array.isArray(parsed.tasks) || !Array.isArray(parsed.items) ||
    parsed.tasks.length > 1000 || parsed.items.length > 1000 ||
    !Array.isArray(parsed.files ?? [])) {
    throw new Error("Import file is not a validated ETERNYX archive");
  }
  const stepCount = parsed.tasks.reduce((count, task) =>
    count + (Array.isArray(task.checklist) ? task.checklist.length : 0), 0);
  if (stepCount > 30000 || (version < 3 && stepCount > 0) ||
    (parsed.files?.length ?? 0) > 8 || (version === 1 && parsed.files?.length)) {
    throw new Error("Archive exceeds verified restore limits");
  }
  return {
    p_source_sha256: fingerprint,
    p_source_version: version,
    p_project_name: parsed.project.name,
    p_description: parsed.project.description,
    p_expected_tasks: parsed.tasks.length,
    p_expected_steps: stepCount,
    p_expected_items: parsed.items.length,
    p_expected_files: parsed.files?.length ?? 0,
  };
}

export function taskRestoreBatches(parsed) {
  if (!parsed || !Array.isArray(parsed.tasks)) throw new Error("Missing validated tasks");
  return chunkImportRows(parsed.tasks.map(task => ({
    title: task.title,
    details: task.details,
    status: task.status,
    priority: task.priority,
    due_on: task.due_on,
    checklist: (task.checklist ?? []).map(step => ({ title: step.title, done: step.done })),
  })), WORKSPACE_IMPORT_TASK_BATCH_SIZE);
}

export function itemRestoreBatches(parsed) {
  if (!parsed || !Array.isArray(parsed.items)) throw new Error("Missing validated saved items");
  return chunkImportRows(parsed.items.map(item => ({
    kind: item.kind,
    title: item.title,
    note_text: item.note_text,
    target_url: item.target_url,
  })), WORKSPACE_IMPORT_ITEM_BATCH_SIZE);
}

export function chunkImportRows(rows, limit = 25) {
  if (!Array.isArray(rows) || !Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error("Invalid import batch boundaries");
  }
  return Array.from({ length: Math.ceil(rows.length / limit) }, (_, i) =>
    rows.slice(i * limit, (i + 1) * limit));
}

export async function verifyExistingImportFile(storage, path, expectedBytes, expectedHash) {
  if (typeof path !== "string" || !path ||
    !(expectedBytes instanceof Uint8Array) || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error("Cannot verify private file without its expected identity and bytes");
  }
  const { data, error } = await storage.download(path);
  if (error || !data) throw new Error("Prior private upload could not be verified: " +
    (error?.message || "file not found"));
  if (data.size !== expectedBytes.length) {
    throw new Error("Prior private upload has an unexpected size; import stopped");
  }
  const hash = await sha256Hex(new Uint8Array(await data.arrayBuffer()));
  if (hash !== expectedHash) {
    throw new Error("Prior private upload checksum mismatch; import stopped");
  }
  return true;
}
