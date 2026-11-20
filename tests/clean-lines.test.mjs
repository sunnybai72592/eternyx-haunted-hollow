import test from "node:test";
import assert from "node:assert/strict";
import { cleanLines } from "../src/lib/cleanLines.mjs";

test("counts actual changes across mixed line endings and preserves first spelling", () => {
  assert.deepEqual(cleanLines(" A \r\na\rB\n  \n", { ignoreCase: true }), {
    lines: ["A", "B"], blanks: 2, duplicates: 1, trimmed: 1
  });
  assert.deepEqual(cleanLines("").lines, []);
  assert.equal(cleanLines("").blanks, 0);
});
test("preserves order and case by default and applies the requested ordering independently", () => {
  const source = "B\nA\na\nB";
  assert.deepEqual(cleanLines(source).lines, ["B", "A", "a"]);
  assert.deepEqual(cleanLines("B\nA\nB", { order: "ascending" }).lines, ["A", "B"]);
  assert.deepEqual(cleanLines("A\nB\nB", { deduplicate: false, ignoreCase: true, order: "descending" }).lines, ["B", "B", "A"]);
});
