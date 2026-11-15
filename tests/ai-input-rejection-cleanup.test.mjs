import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/ai-generation-input-verify/index.ts", import.meta.url), "utf8");

test("invalid image rejection persists the rejected state before object cleanup", () => {
  const helperStart = source.indexOf("async function rejectPendingAsset(");
  const helperEnd = source.indexOf("\n}\n\nserve(", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "rejection helper must exist");
  const helper = source.slice(helperStart, helperEnd);
  const stateUpdate = helper.indexOf('.update({ status: "rejected" })');
  const stateCheck = helper.indexOf('.eq("status", "pending")');
  const selectedRow = helper.indexOf('.select("id")');
  const objectRemoval = helper.indexOf('.remove([asset.object_path])');
  assert.ok(stateUpdate >= 0 && stateCheck > stateUpdate);
  assert.ok(selectedRow > stateCheck);
  assert.ok(objectRemoval > selectedRow, "storage cleanup must follow confirmed state transition");
});

test("failed rejection persistence returns unavailable rather than claiming rejection", () => {
  const helper = source.slice(
    source.indexOf("async function rejectPendingAsset("),
    source.indexOf("\n}\n\nserve("),
  );
  assert.match(helper, /if \(error \|\| !data\)[\s\S]*?return false/);
  assert.match(source, /rejected \? 415 : 503/);
});

test("all invalid upload paths share the checked rejection helper", () => {
  const calls = source.match(/return await reject\(/g) ?? [];
  assert.equal(calls.length, 3, "size, signature, and dimension failures must use shared rejection handling");
  assert.match(source, /const rejected = await rejectPendingAsset\(supabase, asset, user\.id\)/);
});

test("object cleanup failure is logged after the asset has been made unusable", () => {
  const helper = source.slice(
    source.indexOf("async function rejectPendingAsset("),
    source.indexOf("\n}\n\nserve("),
  );
  assert.match(helper, /if \(removeError\)[\s\S]*?console\.error/);
  assert.match(helper, /return true/);
});
