import test from "node:test";
import assert from "node:assert/strict";
import {
  collectOwnedStorageKeys, removeOwnedStorage,
} from "../supabase/functions/_shared/workspace-storage-cleanup.mjs";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const project = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeBucket(initial, { failRemove = false, missing = false } = {}) {
  const objects = new Set(initial);
  const calls = [];
  return {
    objects, calls,
    async list(prefix, { limit, offset }) {
      if (missing) return { data: null, error: { statusCode: 404, message: "Bucket not found" } };
      calls.push(["list", prefix, limit, offset]);
      const descendants = [...objects].filter(path => path.startsWith(prefix + "/"))
        .map(path => path.slice(prefix.length + 1));
      const names = [...new Set(descendants.map(path => path.split("/")[0]))].sort();
      const data = names.map(name => {
        const nested = descendants.some(path => path.startsWith(name + "/"));
        return { name, id: nested ? null : "object-id" };
      }).slice(offset, offset + limit);
      return { data, error: null };
    },
    async remove(keys) {
      calls.push(["remove", keys]);
      if (failRemove) return { data: null, error: { message: "storage unavailable" } };
      for (const key of keys) objects.delete(key);
      return { data: keys.map(name => ({ name })), error: null };
    },
  };
}

test("removes owner files across nested projects without deleting other accounts", async () => {
  const original = [
    alice + "/" + project + "/report.pdf",
    alice + "/" + project + "/notes.csv",
    alice + "/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/draft.txt",
    bob + "/" + project + "/do-not-touch.txt",
  ];
  const bucket = fakeBucket(original);
  assert.equal((await collectOwnedStorageKeys(bucket, alice)).length, 3);
  const result = await removeOwnedStorage(bucket, alice);
  assert.deepEqual(result, { removed: 3, available: true });
  assert.deepEqual([...bucket.objects], [bob + "/" + project + "/do-not-touch.txt"]);
  assert.ok(bucket.calls.every(call => call[0] === "remove"
    ? call[1].every(path => path.startsWith(alice + "/"))
    : call[1].startsWith(alice)));
});

test("paginates 100+ projects without skipping owned files", async () => {
  const all = Array.from({ length: 152 }, (_, i) =>
    alice + "/project-" + String(i).padStart(4, "0") + "/one.txt");
  const bucket = fakeBucket(all);
  assert.equal((await removeOwnedStorage(bucket, alice)).removed, 152);
  assert.equal(bucket.objects.size, 0);
  assert.ok(bucket.calls.some(call => call[0] === "list" && call[3] === 100));
});

test("fails closed on Storage remove errors and leaves the caller to retry", async () => {
  const name = alice + "/" + project + "/protected.txt";
  const bucket = fakeBucket([name], { failRemove: true });
  await assert.rejects(removeOwnedStorage(bucket, alice), /Failed to delete private account files/);
  assert.ok(bucket.objects.has(name));
});

test("allows accounts with no Workspace bucket and rejects invalid identities", async () => {
  assert.deepEqual(await removeOwnedStorage(fakeBucket([], { missing: true }), alice),
    { removed: 0, available: false });
  await assert.rejects(removeOwnedStorage(fakeBucket([]), "../../other"), /Invalid account identity/);
});

test("detects partially successful removes and refuses false cleanup success", async () => {
  const name = alice + "/" + project + "/file.pdf";
  const bucket = fakeBucket([name]);
  bucket.remove = async () => ({ data: [], error: null });
  await assert.rejects(removeOwnedStorage(bucket, alice), /remain after cleanup/);
  assert.ok(bucket.objects.has(name));
});
