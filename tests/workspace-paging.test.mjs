import test from "node:test";
import assert from "node:assert/strict";
import { fetchWorkspaceRows } from "../src/lib/workspacePaging.mjs";

function fakeClient(records, calls) {
  return { from(table) {
    const query = {
      select() { return query; },
      eq(key, value) {
        calls.push({ method: "eq", key, value, table }); return query;
      },
      order(key, direction) {
        calls.push({ method: "order", key, ascending: direction.ascending }); return query;
      },
      range(start, end) {
        calls.push({ method: "range", start, end });
        return Promise.resolve({ data: records.slice(start, end + 1), error: null });
      },
    };
    return query;
  }};
}

test("fetches records across pages instead of silently truncating at 1000", async () => {
  const list = Array.from({ length: 1173 }, (_, i) => ({ id: String(i), owner_id: "alice" }));
  const calls = [];
  const actual = await fetchWorkspaceRows(fakeClient(list, calls),
    "workspace_tasks", "alice", "created_at", { pageSize: 250, maxRows: 2000 });
  assert.equal(actual.length, 1173);
  assert.deepEqual(calls.filter(c => c.method === "range").map(c => [c.start, c.end]),
    [[0,249],[250,499],[500,749],[750,999],[1000,1249]]);
  assert.ok(calls.filter(c => c.method === "eq").every(c => c.key === "owner_id" && c.value === "alice"));
  assert.ok(calls.some(c => c.method === "order" && c.key === "id"));
});

test("truncation is an explicit error, not fabricated complete records", async () => {
  const list = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(fetchWorkspaceRows(fakeClient(list, []), "workspace_items", "owner", "created_at",
    { pageSize: 2, maxRows: 4 }), /more than 4/);
});

test("rejects unknown tables and invalid paging sizes", async () => {
  await assert.rejects(fetchWorkspaceRows(fakeClient([], []), "auth.users", "owner"), /Unsupported/);
  await assert.rejects(fetchWorkspaceRows(fakeClient([], []), "workspace_projects", "owner", "created_at",
    { pageSize: 900 }), /Invalid/);
});

test("fails closed on a data API error", async () => {
  const bad = { from() {
    const q = { select() { return q; }, eq() { return q; }, order() { return q; },
      range() { return Promise.resolve({ data: null, error: { message: "RLS denied" } }); } };
    return q;
  }};
  await assert.rejects(fetchWorkspaceRows(bad, "workspace_items", "bob"), /RLS denied/);
});
