import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildStoryboard, storyboardCsv, storyboardShotCaptionsSrt, storyboardSrtTimestamp } from "../src/lib/ai/storyboard.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/VideoStoryboard.tsx");

test("1: CSV exports ordered shot details, timestamps, duration and format", () => {
  const board = buildStoryboard("Opening frame\nClosing frame", 5, "16:9");
  const csv = storyboardCsv(board);
  assert.match(csv, /^"Shot","Start \(seconds\)","End \(seconds\)","Duration \(seconds\)","Frame format","Description"\r\n/);
  assert.ok(csv.includes('"1","0","5","5","16:9","Opening frame"'));
  assert.ok(csv.includes('"2","5","10","5","16:9","Closing frame"'));
  assert.ok(csv.endsWith("\r\n"));
});

test("2: spreadsheet formulas in captions are prefixed to prevent execution", () => {
  const board = buildStoryboard('=HYPERLINK("bad")\n+cmd\n@command\n-SUM(1,2)', 3, "1:1");
  const csv = storyboardCsv(board);
  for (const leading of ["'=HYPERLINK", "'+cmd", "'@command", "'-SUM"]) assert.ok(csv.includes(leading));
  assert.ok(csv.includes('""bad""'));
});

test("3: CSV preserves non-English text and distinct repeated shot entries", () => {
  const board = buildStoryboard("مرحبا\nمرحبا\nA, \"quoted\" frame", 10, "9:16");
  const csv = storyboardCsv(board);
  assert.equal((csv.match(/مرحبا/g) ?? []).length, 2);
  assert.ok(csv.includes('"A, ""quoted"" frame"'));
  assert.equal(csv.trimEnd().split("\r\n").length, 4);
});

test("4: SRT timestamps follow hour-minute-second format, including zero", () => {
  assert.equal(storyboardSrtTimestamp(0), "00:00:00,000");
  assert.equal(storyboardSrtTimestamp(65), "00:01:05,000");
  assert.equal(storyboardSrtTimestamp(3661), "01:01:01,000");
  for (const n of [-1, 1.25, NaN, Infinity]) assert.throws(() => storyboardSrtTimestamp(n));
});

test("5: shot description SRT follows sequence number and exact boundaries", () => {
  const board = buildStoryboard("First scene\nSecond scene", 5, "16:9");
  assert.equal(storyboardShotCaptionsSrt(board),
    "1\n00:00:00,000 --> 00:00:05,000\nFirst scene\n\n2\n00:00:05,000 --> 00:00:10,000\nSecond scene\n");
});

test("6: exports work for empty drafts without claiming a completed video", () => {
  const empty = buildStoryboard("", 5, "16:9");
  assert.match(storyboardCsv(empty), /^"Shot"/);
  assert.equal(storyboardShotCaptionsSrt(empty), "");
  assert.throws(() => storyboardCsv(null));
  assert.throws(() => storyboardShotCaptionsSrt(null));
});

test("7: captions preserve UTF-8 content and make no ungrounded transcript claims", () => {
  const srt = storyboardShotCaptionsSrt(buildStoryboard("پہلا منظر\nمشهد ثان", 3, "9:16"));
  assert.match(srt, /پہلا منظر/);
  assert.match(srt, /مشهد ثان/);
  assert.match(component, /not speech transcripts or AI-generated subtitles/);
});

test("8: storyboard UI exposes three clearly named, local-only exports", () => {
  assert.match(component, /Export shot timeline CSV/);
  assert.match(component, /Export shot captions SRT/);
  assert.match(component, /Download storyboard JSON/);
  assert.match(component, /role="group" aria-label="Export storyboard timeline"/);
  assert.match(component, /stay on your device/);
  assert.match(component, /new Blob\(\[value\]/);
});

test("9: storyboarding TSX parses correctly and does not call a paid video provider", () => {
  const parsed = ts.createSourceFile("VideoStoryboard.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  assert.doesNotMatch(component, /supabase\.functions\.invoke\(/);
});
