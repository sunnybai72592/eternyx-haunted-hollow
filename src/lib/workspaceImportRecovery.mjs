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


// A client-side freshness check, not an authorization substitute: every
// sensitive DB/Storage operation still depends on server-side owner RLS.
export async function assertWorkspaceImportOwner(client, expectedOwner) {
  if (!client?.auth?.getUser || typeof expectedOwner !== "string" || !expectedOwner) {
    throw new Error("A signed-in account is required for a private restore");
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id || data.user.id !== expectedOwner) {
    throw new Error("The signed-in account changed or its session expired. " +
      "Restore stopped before the next private operation; sign in and reselect your archive.");
  }
  return true;
}


// A successful upload response alone is not sufficient. Read the private
// object back and compare its REAL bytes with the validated archive. Never
// overwrite a pre-existing key, including after an ambiguous network error.
export async function storeAndVerifyWorkspaceImportFile(storage, path, file, registered=false) {
  if (!file || !(file.bytes instanceof Uint8Array) ||
      !Number.isSafeInteger(file.size_bytes) ||
      file.bytes.length !== file.size_bytes ||
      typeof file.mime_type !== "string" || !file.mime_type) {
    throw new Error("Invalid private file bytes or manifest");
  }
  const hash = await sha256Hex(file.bytes);
  if (!registered) {
    const { error } = await storage.upload(path, file.bytes, {
      upsert: false, contentType: file.mime_type,
    });
    if (error) {
      // May have uploaded before the network reply was lost: only accept it
      // when a complete byte-for-byte retrieval matches.
      await verifyExistingImportFile(storage, path, file.bytes, hash);
      return true;
    }
  }
  await verifyExistingImportFile(storage, path, file.bytes, hash);
  return true;
}

// Reopening a completed archive must not falsely claim the current project
// still equals the original backup. Recheck the server DB checkpoint and every
// included private file; detect missing, tampered or extra registered claims.
export async function verifyCompletedWorkspaceImport(client, owner, sessionId, files = []) {
  await assertWorkspaceImportOwner(client, owner);
  if (typeof sessionId !== "string" || !sessionId || !Array.isArray(files) || files.length > 8) {
    throw new Error("Invalid completed import verification request");
  }
  const { data: integrity, error: integrityError } = await client.rpc(
    "workspace_import_integrity", { p_session_id: sessionId });
  if (integrityError || integrity?.session_id !== sessionId ||
      integrity?.status !== "complete" || integrity?.content_matches !== true) {
    throw new Error("The completed project's contents differ from its last import checkpoint, " +
      "or integrity could not be verified. The original archive was NOT re-applied.");
  }
  const { data: claims, error: claimsError } = await client
    .from("workspace_import_files")
    .select("file_index,storage_path,sha256,title,size_bytes,mime_type,registered")
    .eq("session_id", sessionId);
  if (claimsError || !Array.isArray(claims) || claims.length !== files.length) {
    throw new Error("Completed import's private file claims could not be verified");
  }
  const storage = client.storage.from("workspace-private");
  const positions = new Set();
  for (const claim of claims) {
    if (!Number.isInteger(claim.file_index) || claim.file_index < 0 ||
        claim.file_index >= files.length || positions.has(claim.file_index) ||
        claim.registered !== true) {
      throw new Error("Completed import has unexpected or unregistered private file claims");
    }
    positions.add(claim.file_index);
    const file = files[claim.file_index];
    if (claim.title !== file.title || claim.size_bytes !== file.size_bytes ||
        claim.mime_type !== file.mime_type ||
        claim.sha256 !== await sha256Hex(file.bytes)) {
      throw new Error("Completed import private file manifest does not match its source");
    }
    await verifyExistingImportFile(storage, claim.storage_path, file.bytes, claim.sha256);
  }
  return true;
}
