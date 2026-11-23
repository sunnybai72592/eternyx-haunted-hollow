// Complete, owner-scoped current-record reads for project exports.
// An expected count is verified on every page; silent truncation or a shifted
// page must never become an apparently successful backup.
export const WORKSPACE_EXPORT_LIMIT = 1000;
export const WORKSPACE_EXPORT_PAGE_SIZE = 200;

async function fetchRows(client, table, owner, projectId, pageSize) {
  const results = [];
  const seen = new Set();
  let expected = null;
  for (let start = 0; start <= WORKSPACE_EXPORT_LIMIT; start += pageSize) {
    const { data, count, error } = await client.from(table)
      .select("*", { count: "exact" })
      .eq("owner_id", owner).eq("project_id", projectId)
      .order("id", { ascending: true }).range(start, start + pageSize - 1);
    if (error) throw new Error("Cannot complete private " + table + " export: " + error.message);
    if (!Array.isArray(data) || !Number.isSafeInteger(count) ||
        count < 0 || count > WORKSPACE_EXPORT_LIMIT) {
      throw new Error("Private " + table + " export needs an exact count of at most 1,000 records");
    }
    if (expected === null) expected = count;
    else if (expected !== count) throw new Error(
      "Project " + table + " changed during export. Retry the backup.");
    if (data.length > pageSize || start + data.length > expected) {
      throw new Error("Project " + table + " returned inconsistent page boundaries");
    }
    for (const item of data) {
      if (!item || typeof item.id !== "string" || !item.id ||
          item.owner_id !== owner || item.project_id !== projectId || seen.has(item.id)) {
        throw new Error("Project " + table + " returned repeated or foreign records");
      }
      seen.add(item.id);
      results.push(item);
    }
    if (results.length === expected) return results;
    if (data.length < pageSize) {
      throw new Error("Private " + table + " export page was truncated");
    }
  }
  throw new Error("Private project export exceeded its supported record count");
}

export async function fetchWorkspaceExportSnapshot(client, owner, projectId, pageSize = WORKSPACE_EXPORT_PAGE_SIZE) {
  if (!client || typeof owner !== "string" || !owner ||
      typeof projectId !== "string" || !projectId ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("A signed-in owner, private project and valid pagination are required");
  }
  const [tasks, items] = await Promise.all([
    fetchRows(client, "workspace_tasks", owner, projectId, pageSize),
    fetchRows(client, "workspace_items", owner, projectId, pageSize),
  ]);
  return { tasks, items };
}
