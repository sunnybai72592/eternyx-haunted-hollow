// API pagination does not rely on Supabase's max-rows default or silently
// present truncated collections as a complete Workspace library.
export async function fetchWorkspaceRows(client, table, ownerId, orderBy = "created_at", opts = {}) {
  if (!["workspace_projects", "workspace_tasks", "workspace_items"].includes(table)) {
    throw new Error("Unsupported Workspace collection");
  }
  const pageSize = opts.pageSize ?? 250;
  const maxRows = opts.maxRows ?? 5000;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
      !Number.isInteger(maxRows) || maxRows < pageSize || maxRows > 10000) {
    throw new Error("Invalid Workspace page boundaries");
  }
  const rows = [];
  for (let start = 0; start <= maxRows; start += pageSize) {
    const count = Math.min(pageSize, maxRows + 1 - start);
    const { data, error } = await client.from(table).select("*")
      .eq("owner_id", ownerId).order(orderBy, { ascending: false })
      .order("id", { ascending: false }).range(start, start + count - 1);
    if (error) throw new Error("Failed loading " + table + ": " + error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (rows.length > maxRows) {
      throw new Error("This Workspace contains more than " + maxRows + " " + table +
        " records. Export or contact support for a larger library; no partial set was displayed.");
    }
    if (batch.length < count) return rows;
  }
  return rows;
}
