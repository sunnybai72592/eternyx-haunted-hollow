import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryboard, readStoryboard, timecode } from "../src/lib/ai/storyboard.mjs";

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

test("reopens an existing export with its repeated shots, duration and framing", () => {
  const board = buildStoryboard("فجر\nDetail\nDetail", 3, "1:1");
  const draft = readStoryboard(JSON.stringify(board));
  assert.deepEqual(buildStoryboard(draft.text, draft.seconds, draft.format), board);
});
test("rejects malformed and inconsistent imports", () => {
  for (const source of ["{", "null", "{}", '{"shots":[]}']) assert.throws(() => readStoryboard(source));
  const board = buildStoryboard("A\nB", 5, "16:9");
  for (const change of [
    b => { b.shots[0] = null; }, b => { b.shots[1].startSeconds = 0; },
    b => { b.totalSeconds++; }, b => { b.format = "wide"; }, b => { b.shots[0].description = "A\nB"; },
  ]) {
    const copy = structuredClone(board);
    change(copy);
    assert.throws(() => readStoryboard(JSON.stringify(copy)));
  }
});
