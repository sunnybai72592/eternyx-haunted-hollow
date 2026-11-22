import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildLocalVideoBoard, localVideoSrt } from "../src/lib/ai/localVideoEditor.mjs";
import {
  readLocalRenderReceipt, verifyLocalRenderReceipt, checkRenderedSubtitles,
  exportLocalVideoReview, MAX_RENDER_BYTES, MAX_RECEIPT_BYTES,
} from "../src/lib/ai/localRenderReview.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const fileHash = sha("ACTUAL_MP4_BYTES_FICTITIOUS_TEST_ONLY");
const video = { name: "video.mp4", size: 512, sha256: fileHash };
const sourceA = { name: "first.mp4", size: 100, sha256: "a".repeat(64) };
const sourceB = { name: "second.mp4", size: 128, sha256: "b".repeat(64) };
const shots = [
  {sourceName:"first.mp4",startFrame:4,frames:16,caption:"Workshop opening",
   rightsRef:"original-workshop",fadeInFrames:4,fadeOutFrames:0},
  {sourceName:"second.mp4",startFrame:0,frames:16,caption:"Second shot",
   rightsRef:"original-take-2",fadeInFrames:0,fadeOutFrames:4},
];
const project = buildLocalVideoBoard({sources:[sourceA, sourceB],shots});
const context = {board:project.board, storyboardSha256:sha(project.json),
                 profile:"landscape",quality:"standard"};

function makeReceipt() {
  let total = 0;
  const rows = project.board.shots.map((shot, index) => {
    const value = {index, file:shot.file,source_sha256:shot.source_sha256,
      start_frame:shot.start_frame,frames:shot.frames,fade_in_frames:shot.fade_in_frames,
      fade_out_frames:shot.fade_out_frames,timeline_start_frame:total,
      caption:shot.caption,rights_ref:shot.rights_ref};
    total += shot.frames;
    return value;
  });
  return {
    version:2,type:"local CPU video editing",storyboard_sha256:context.storyboardSha256,
    video:{sha256:fileHash,width:256,height:144,frame_count:32,fps:"16/1",
           duration_seconds:2,audio:false,file_bytes:512},
    profile:"landscape",quality:"standard",total_frames:32,
    shots:rows,soundtrack:null,captions:"captions.srt",model_generation:false,
  };
}

test("verify local renderer receipt, source shot order and actual imported video digest", () => {
  const receipt = readLocalRenderReceipt(JSON.stringify(makeReceipt()));
  const verified = verifyLocalRenderReceipt(receipt, video, context);
  assert.equal(verified.projectMatch, true);
  assert.equal(verified.videoSha256, fileHash);
  assert.equal(verified.storyboardSha256, sha(project.json));
  assert.equal(verified.frameCount, 32);
  assert.equal(verified.durationSeconds, 2);
  assert.equal(verified.width, 256);
  assert.equal(verified.height, 144);
  assert.equal(verified.withAudio, false);
  assert.equal(verifyLocalRenderReceipt(receipt, video).projectMatch, null);
});

test("check real renderer-style exact SRT timing and captions", () => {
  const receipt = makeReceipt();
  const original = localVideoSrt({version:2,shots:receipt.shots});
  assert.deepEqual(checkRenderedSubtitles(original, receipt), {cues:2,matchesRenderer:true});
  assert.deepEqual(checkRenderedSubtitles(original.replace(/\n/g,"\r\n"),receipt),
                   {cues:2,matchesRenderer:true});
  for (const wrong of [original.replace("Workshop opening","Different text"),
                       original.replace("00:00:01,000","00:00:00,000"), "1\nunexpected\n"]) {
    assert.throws(() => checkRenderedSubtitles(wrong,receipt), /differs/);
  }
  assert.throws(() => checkRenderedSubtitles("x".repeat(32769),receipt),/32 KiB/);
});

test("16fps subtitle rounding exactly matches Python half-even millisecond semantics", () => {
  const tiny = buildLocalVideoBoard({
    sources:[sourceA],
    shots:[
      {...shots[0],frames:1,fadeInFrames:0,fadeOutFrames:0},
      {...shots[0],frames:4,fadeInFrames:0,fadeOutFrames:0},
    ],
  });
  const srt = localVideoSrt(tiny.board);
  assert.match(srt,/00:00:00,000 --> 00:00:00,062/);
  assert.match(srt,/00:00:00,062 --> 00:00:00,312/);
});

test("reject mismatched, corrupt, tampered, renamed or overlarge rendered MP4", () => {
  const receipt = makeReceipt();
  for (const changed of [
    {...video,name:"wrong.mp4"},
    {...video,sha256:"0".repeat(64)},
    {...video,sha256:"Z".repeat(64)},
    {...video,size:video.size-1},
    {...video,size:MAX_RENDER_BYTES+1},
    {...video,size:0},
  ]) assert.throws(() => verifyLocalRenderReceipt(receipt,changed),/SHA-256|match|video.mp4|bytes/);
});

test("reject malformed schema, generation claims, invalid receipt bytes and output identity", () => {
  for(const bad of [
    null, "{}", "{",
    JSON.stringify({...makeReceipt(),model_generation:true}),
    JSON.stringify({...makeReceipt(),type:"AI video generation"}),
    JSON.stringify({...makeReceipt(),version:1}),
    " ".repeat(MAX_RECEIPT_BYTES+1),
  ]) assert.throws(() => readLocalRenderReceipt(bad));
  const unsupported = makeReceipt();
  unsupported.video.sha256 = "invalid";
  assert.throws(() => readLocalRenderReceipt(JSON.stringify(unsupported)),/SHA-256/);
});

test("reject incompatible frame count, dimensions, FPS, audio state and duration", () => {
  const bad = [
    receipt => {receipt.video.width=257;},
    receipt => {receipt.video.height=288;},
    receipt => {receipt.video.fps="30/1";},
    receipt => {receipt.video.frame_count=33;},
    receipt => {receipt.total_frames=33;},
    receipt => {receipt.video.duration_seconds=3;},
    receipt => {receipt.video.file_bytes=0;},
    receipt => {receipt.video.audio=true;},
    receipt => {receipt.quality="ultra";},
    receipt => {receipt.profile="unknown";},
    receipt => {receipt.captions="other.srt";},
  ];
  for (const edit of bad) {
    const receipt = makeReceipt();
    edit(receipt);
    assert.throws(() => readLocalRenderReceipt(JSON.stringify(receipt)));
  }
});

test("reject missing/reordered/tampered shot frames and incomplete source rights", () => {
  const bad = [
    receipt => {receipt.shots[0].index=1;},
    receipt => {receipt.shots[1].timeline_start_frame=0;},
    receipt => {receipt.shots[0].source_sha256="not-hash";},
    receipt => {receipt.shots[0].file="../first.mp4";},
    receipt => {receipt.shots[0].start_frame=960;},
    receipt => {receipt.shots[0].fade_in_frames=9;},
    receipt => {receipt.shots[1].caption="";},
    receipt => {receipt.shots[0].rights_ref="nonprint\n";},
    receipt => {receipt.shots.pop();},
    receipt => {receipt.shots[0].frames=0;},
  ];
  for (const edit of bad) {
    const receipt = makeReceipt();
    edit(receipt);
    assert.throws(() => readLocalRenderReceipt(JSON.stringify(receipt)));
  }
});

test("reject changed project even with self-consistent video digest", () => {
  const receipt = makeReceipt();
  const corrupted = [
    { ...context, storyboardSha256: "f".repeat(64) },
    { ...context, profile: "portrait" },
    { ...context, quality: "high" },
    { ...context, board: {...project.board,shots:project.board.shots.slice(0,1)} },
    { ...context, board: {...project.board,shots:[
      {...project.board.shots[0],caption:"Altered caption"},
      project.board.shots[1],
    ]}},
    { ...context, board: {...project.board,soundtrack:{
      file:"audio.wav",source_sha256:"c".repeat(64),rights_ref:"owned",volume_percent:35,
    }} },
  ];
  for (const modified of corrupted) {
    assert.throws(() => verifyLocalRenderReceipt(receipt,video,modified), /digest|shape|number|differs|soundtrack/);
  }
});

test("soundtrack receipts reject inconsistent audio and invalid rights", () => {
  const receipt = makeReceipt();
  receipt.video.audio=true;
  receipt.soundtrack = {
    file:"music.wav",source_sha256:"c".repeat(64),rights_ref:"owned locally",volume_percent:20,
  };
  assert.equal(readLocalRenderReceipt(JSON.stringify(receipt)).video.audio,true);
  for(const edit of [
    r => {r.soundtrack.rights_ref="";},
    r => {r.soundtrack.volume_percent=101;},
    r => {r.soundtrack.source_sha256="invalid";},
    r => {r.soundtrack.file="../music.wav";},
    r => {r.soundtrack=null;},
  ]) {
    const changed = structuredClone(receipt);
    edit(changed);
    assert.throws(() => readLocalRenderReceipt(JSON.stringify(changed)));
  }
});

test("export a clearly labelled human observation, never an invented AI quality score", () => {
  const verified=verifyLocalRenderReceipt(makeReceipt(),video,context);
  const now="2026-11-22T12:00:00.000Z";
  const result=exportLocalVideoReview(verified,"needs_revision","Cut at frame 16 is abrupt.",now);
  assert.equal(result.kind,"local_video_human_review");
  assert.equal(result.review_type,"human_observation");
  assert.equal(result.verdict,"needs_revision");
  assert.equal(result.editor_project_matched,true);
  assert.equal(result.rendered_video_sha256,video.sha256);
  assert.equal(result.reviewed_at,now);
  assert.ok(!("score" in result));
  for(const invalid of ["green","generated","approved",null]) {
    assert.throws(() => exportLocalVideoReview(verified,invalid,"",now));
  }
  assert.throws(() => exportLocalVideoReview(verified,"undecided","x".repeat(1001),now));
  assert.throws(() => exportLocalVideoReview(verified,"undecided","hello\n\u0000",now));
  assert.throws(() => exportLocalVideoReview(verified,"undecided","","yesterday"));
  assert.equal(exportLocalVideoReview(verified,"undecided","",now).verdict,"undecided");
});

test("AI Video Studio review UI uses real browser file hashes, local playback and no uploads", () => {
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/LocalRenderReview.tsx",import.meta.url),"utf8");
  assert.match(parent, /<LocalRenderReview project=\{ready\}/);
  assert.match(ui, /readLocalRenderReceipt/);
  assert.match(ui, /verifyLocalRenderReceipt/);
  assert.match(ui, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui, /captions\.srt/);
  assert.match(ui, /Download human-review JSON/);
  assert.match(ui, /<video controls playsInline/);
  assert.match(ui, /URL\.revokeObjectURL/);
  assert.doesNotMatch(ui, /fetch\(|supabase\.functions\.invoke|enqueueAIJob|requestAIJobEnqueue/);
});
