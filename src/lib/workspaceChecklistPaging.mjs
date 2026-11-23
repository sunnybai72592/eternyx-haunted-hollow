// Fetch every persisted checklist row for exactly the exported owned task IDs.
// This is not a cache: a failed/missing page rejects the whole archive.
export async function fetchWorkspaceChecklistSnapshot(client, ownerId, tasks, options = {}) {
  if (!client || typeof ownerId !== "string" || !ownerId || !Array.isArray(tasks) ||
    tasks.length > 1000 || tasks.some(task => !task?.id || task.owner_id !== ownerId) ||
    new Set(tasks.map(task => task.id)).size !== tasks.length) {
    throw new Error("Checklist snapshot requires unique, owned task identities");
  }
  const chunkSize = options.chunkSize ?? 20;
  const pageSize = options.pageSize ?? 200;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 20 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("Invalid checklist snapshot pagination");
  }
  const all = [];
  const seenIds = new Set();
  for (let i = 0; i < tasks.length; i += chunkSize) {
    const batch = tasks.slice(i, i + chunkSize);
    const ids = batch.map(task => task.id);
    const allowed = new Set(ids);
    const maxCount = batch.length * 30;
    let expected = null;
    let readCount = 0;
    for (let start = 0; start <= maxCount; start += pageSize) {
      const { data, count, error } = await client.from("workspace_task_steps")
        .select("id,task_id,owner_id,title,done,created_at", { count: "exact" })
        .eq("owner_id", ownerId).in("task_id", ids)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) throw new Error("Checklist backup could not load every step: " + error.message);
      if (!Array.isArray(data) || !Number.isSafeInteger(count) ||
          count < 0 || count > maxCount) {
        throw new Error("Checklist backup has no trustworthy exact count or exceeds its step cap");
      }
      if (expected === null) expected = count;
      else if (expected !== count) throw new Error(
        "Checklist changed during backup; retry the export");
      if (data.length > pageSize || readCount + data.length > expected) {
        throw new Error("Checklist backup received inconsistent page boundaries");
      }
      for (const row of data) {
        if (!row || typeof row.id !== "string" || !row.id ||
            row.owner_id !== ownerId || !allowed.has(row.task_id)) {
          throw new Error("Checklist backup returned a foreign or unrelated task step");
        }
        if (seenIds.has(row.id)) throw new Error(
          "Checklist backup returned a duplicate step identity");
        seenIds.add(row.id);
        all.push(row);
      }
      readCount += data.length;
      if (readCount === expected) break;
      if (data.length < pageSize) {
        throw new Error("Checklist backup page was truncated; no incomplete archive was created");
      }
    }
    if (readCount !== expected) throw new Error(
      "Checklist backup could not verify its full step count");
  }
  return all;
}
