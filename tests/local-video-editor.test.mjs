import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLocalVideoBoard, checkLocalMediaName, localVideoCommand, localVideoSrt,
  LOCAL_VIDEO_LIMITS,
} from "../src/lib/ai/localVideoEditor.mjs";

const sourceA = { name: "motion.mp4", size: 100, sha256: "a".repeat(64) };
const sourceB = { name: "dark.mp4", size: 200, sha256: "b".repeat(64) };
const audio = { name: "music.wav", size: 50, sha256: "c".repeat(64), rightsRef: "owner-license", volumePercent: 35 };
const shotA = { sourceName: "motion.mp4", startFrame: 16, frames: 64, caption: "Moving subject",
                rightsRef: "shoot-log-001", fadeInFrames: 8, fadeOutFrames: 0 };
const shotB = { sourceName: "dark.mp4", startFrame: 0, frames: 96, caption: "Evening shot",
                rightsRef: "shoot-log-002", fadeInFrames: 0, fadeOutFrames: 8 };

function build(override = {}) {
  return buildLocalVideoBoard({ sources: [sourceA, sourceB], shots: [shotA, shotB], ...override });
}

test("emits exact Python v2 storyboard keys, source provenance, optional licensed audio and duration", () => {
  const result = build({ soundtrack: audio });
  assert.equal(result.board.version, 2);
  assert.equal(result.totalFrames, 160);
  assert.equal(result.seconds, 10);
  assert.deepEqual(Object.keys(result.board), ["version", "shots", "soundtrack"]);
  assert.deepEqual(result.board.shots[0], {
    file: "motion.mp4", source_sha256: "a".repeat(64),
    start_frame: 16, frames: 64, caption: "Moving subject", rights_ref: "shoot-log-001",
    fade_in_frames: 8, fade_out_frames: 0,
  });
  assert.deepEqual(result.board.soundtrack, {
    file: "music.wav", source_sha256: "c".repeat(64),
    rights_ref: "owner-license", volume_percent: 35,
  });
  assert.deepEqual(JSON.parse(result.json), result.board);
  assert.ok(result.json.endsWith("\n"));
  assert.equal(new TextEncoder().encode(result.json).length < 32768, true);
});

test("exports accurate 16fps SRT sidecar and supports Unicode", () => {
  const output = build({shots: [{...shotA, frames: 8, caption: "<start> مرحبًا"},
                                {...shotB, frames: 16, caption: "Second & final"}]});
  const srt = localVideoSrt(output.board);
  assert.match(srt, /00:00:00,000 --> 00:00:00,500/);
  assert.match(srt, /00:00:00,500 --> 00:00:01,500/);
  assert.match(srt, /<start> مرحبًا/);
  assert.match(srt, /Second & final/);
  assert.equal(srt.split("-->").length - 1, 2);
  assert.throws(() => localVideoSrt(null), /valid/);
});

test("supports repeated cuts of one source and exactly thirty seconds", () => {
  const board = build({sources: [sourceA], shots: [
    {...shotA, startFrame: 0, frames: 240, fadeInFrames: 0},
    {...shotA, startFrame: 240, frames: 240, fadeInFrames: 0},
  ]});
  assert.equal(board.totalFrames, LOCAL_VIDEO_LIMITS.maxFrames);
  assert.equal(board.seconds, 30);
  assert.equal(board.board.shots[1].start_frame, 240);
  assert.equal(board.board.shots[0].source_sha256, board.board.shots[1].source_sha256);
});

test("rejects invalid files, paths, SHA-256 and case-insensitive filename collisions", () => {
  for (const name of ("../clip.mp4", "/tmp/clip.mp4", "clip\\bad.mp4", "https://clip.mp4",
                      "clip.mp4\n", "clip.mov", "", "~hidden.mp4", "a:b.mp4")) {
    assert.throws(() => checkLocalMediaName(name), {name: "Error"});
  }
  for (const name of ("song.exe", "../music.wav", "x\\music.m4a")) {
    assert.throws(() => checkLocalMediaName(name, "audio"), {name: "Error"});
  }
  for (const sources of (
    [], [sourceA, {...sourceA, name: "MOTION.MP4"}],
    [{...sourceA, sha256: "A".repeat(64)}],
    [{...sourceA, size: true}],
    [{...sourceA, size: 64 * 1024 * 1024 + 1}],
    Array.from({length: 9}, (_, i) => ({...sourceA, name: "shot" + i + ".mp4"}))
  )) {
    assert.throws(() => build({sources}));
  }
});

test("rejects unsafe shot fields, missing source, incomplete rights and invalid offsets/fades", () => {
  const variants = [
    {...shotA, sourceName: "missing.mp4"},
    {...shotA, startFrame: -1}, {...shotA, startFrame: true},
    {...shotA, startFrame: 960, frames: 2}, {...shotA, frames: 0},
    {...shotA, frames: 1.5}, {...shotA, frames: true},
    {...shotA, fadeInFrames: 17}, {...shotA, fadeOutFrames: true},
    {...shotA, frames: 8, fadeInFrames: 5},
    {...shotA, caption: ""}, {...shotA, caption: "bad\ncaption"},
    {...shotA, rightsRef: ""}, {...shotA, rightsRef: "record".repeat(40)},
  ];
  for (const shot of variants) {
    assert.throws(() => build({shots: [shot]}));
  }
  assert.throws(() => build({shots: []}), /1 and 8/);
  assert.throws(() => build({shots: Array.from({length: 9}, () => shotA)}), /1 and 8/);
  assert.throws(() => build({shots: [{...shotA, frames: 400, fadeInFrames: 0}, {...shotB, frames: 100}]}), /30 seconds/);
});

test("soundtrack requires a local verified file, permission reference, and bounded volume", () => {
  for (const candidate of (
    {...audio, source_sha256: "not_a_field", sha256: "0"},
    {...audio, name: "bad.mp4"},
    {...audio, size: 16 * 1024 * 1024 + 1},
    {...audio, rightsRef: ""},
    {...audio, rightsRef: "not\nokay"},
    {...audio, volumePercent: 101},
    {...audio, volumePercent: -1},
    {...audio, volumePercent: true},
    {...audio, volumePercent: 5.5},
  )) {
    assert.throws(() => build({soundtrack: candidate}));
  }
  const withoutAudio = build();
  assert.deepEqual(Object.keys(withoutAudio.board), ["version", "shots"]);
  assert.equal(withoutAudio.board.soundtrack, undefined);
  assert.equal(build({soundtrack: {...audio, volumePercent: 0}}).board.soundtrack.volume_percent, 0);
});

test("CLI handoff only uses supported static presets and exact arguments", () => {
  const command = localVideoCommand("portrait", "high");
  assert.equal(command, "python gpu-worker/render_video_timeline.py --storyboard ./eternyx-video-v2.json --media ./local-video-media --output ./eternyx-video-output --profile portrait --quality high");
  for (const profile of ("landscape; echo hacked", "wide", "")) {
    assert.throws(() => localVideoCommand(profile, "standard"), /supported/);
  }
  for (const quality of ("special", "high && whoami")) assert.throws(() => localVideoCommand("square", quality));
});

test("AI Video Studio visibly links to actual local editor without pretending browser rendering", () => {
  const page = readFileSync(new URL("../src/pages/AIVideoStudio.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../src/components/LocalVideoEditor.tsx", import.meta.url), "utf8");
  assert.match(page, /<LocalVideoEditor \/>/);
  assert.match(component, /buildLocalVideoBoard/);
  assert.match(component, /fingerprint\(/);
  assert.match(component, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(component, /Download FFmpeg storyboard/);
  assert.match(component, /localVideoSrt/);
  assert.match(component, /does not execute Python/);
  assert.match(component, /URL\.revokeObjectURL/);
  assert.doesNotMatch(component, /fetch\(|supabase\.functions\.invoke|enqueueAIJob|requestAIJobEnqueue/);
});
