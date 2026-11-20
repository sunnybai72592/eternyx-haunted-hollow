import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryboard, timecode } from "../src/lib/ai/storyboard.mjs";

test("blank lines consume no time and repeated shots keep their positions", () => {
  const board = buildStoryboard("  أولاً \r\n\rDetail\nDetail", 10, "9:16");
  assert.equal(board.totalSeconds, 30);
  assert.deepEqual(board.shots.map(s => [s.description, s.startSeconds, s.endSeconds]),
    [["أولاً", 0, 10], ["Detail", 10, 20], ["Detail", 20, 30]]);
  assert.deepEqual(JSON.parse(JSON.stringify(board)), board);
});

test("supports an empty draft and enforces export limits", () => {
  assert.deepEqual(buildStoryboard("  ", 3, "1:1").shots, []);
  assert.equal(timecode(buildStoryboard("x\n".repeat(60), 15, "16:9").totalSeconds), "15:00");
  assert.throws(() => buildStoryboard("x\n".repeat(61), 5, "16:9"), /60 shots/);
  assert.throws(() => buildStoryboard("x".repeat(12001), 5, "16:9"), /12,000/);
  assert.throws(() => buildStoryboard("x", 0, "16:9"));
  assert.throws(() => buildStoryboard("x", 5, "wide"));
});
