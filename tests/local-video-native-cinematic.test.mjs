import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildLocalVideoBoard,localVideoSrt,localVideoFps,localVideoMaxFrames,
} from "../src/lib/ai/localVideoEditor.mjs";
import {createLocalVideoDraft,readLocalVideoDraft} from "../src/lib/ai/localVideoDraft.mjs";
import {
  timelineSegments,timelineSeek,timelineTimecode,splitTimelineShot,
  duplicateTimelineShot,joinTimelineShots,moveTimelineShot,
  nudgeTimelineShot,
} from "../src/lib/ai/localVideoTimeline.mjs";
import {auditLocalVideoExport,localSequencePlan,sequenceFrame} from "../src/lib/ai/localVideoSequenceReview.mjs";

const a={name:"owned-a.mp4",size:1000,sha256:"a".repeat(64),url:"blob:original-a"};
const b={name:"owned-b.mp4",size:2000,sha256:"b".repeat(64),url:"blob:original-b"};
const first={sourceName:a.name,startFrame:24,frames:48,
  caption:"Real 24fps original",rightsRef:"owner permission",
  fadeInFrames:6,fadeOutFrames:0};
const second={sourceName:b.name,startFrame:0,frames:24,
  caption:"True portrait footage",rightsRef:"recorded with permission",
  fadeInFrames:0,fadeOutFrames:6};
const state=()=>[structuredClone(first),structuredClone(second)];

test("native 24fps main editing project emits source-derived v2 FPS and exact captions",()=>{
  const project=buildLocalVideoBoard({sources:[a,b],shots:state(),quality:"cinematic"});
  assert.equal(project.fps,24);
  assert.equal(project.seconds,3);
  assert.equal(project.totalFrames,72);
  assert.deepEqual(Object.keys(project.board),["version","shots","fps"]);
  assert.equal(project.board.fps,24);
  assert.equal(project.board.shots[0].start_frame,24);
  assert.equal(project.board.shots[0].fade_in_frames,6);
  const srt=localVideoSrt(project.board);
  assert.match(srt,/00:00:00,000 --> 00:00:02,000/);
  assert.match(srt,/00:00:02,000 --> 00:00:03,000/);
  assert.equal(localVideoFps("cinematic"),24);
  assert.equal(localVideoFps("high"),16);
  assert.equal(localVideoMaxFrames(24),720);
});

test("16fps projects and legacy draft bytes keep the original FPS contract",()=>{
  const project=buildLocalVideoBoard({sources:[a],shots:[{
    ...first,startFrame:16,frames:32,fadeInFrames:4,
  }],quality:"high"});
  assert.equal(project.fps,16);
  assert.equal(project.seconds,2);
  assert.deepEqual(Object.keys(project.board),["version","shots"]);
  assert.equal(project.board.fps,undefined);
  assert.match(localVideoSrt(project.board),/00:00:00,000 --> 00:00:02,000/);
  assert.throws(()=>buildLocalVideoBoard({sources:[a],shots:[{
    ...first,frames:500,fadeInFrames:0,
  }],quality:"high"}),/30 seconds|480/);
});

test("24fps editor precision operations preserve original frames, real seconds and fades",()=>{
  const shots=state(),timeline=timelineSegments(shots,24);
  assert.equal(timeline.fps,24);
  assert.equal(timeline.frames,72);
  assert.equal(timeline.seconds,3);
  assert.equal(timeline.segments[1].startSeconds,2);
  assert.equal(timelineSeek(shots,48,24).sourceName,b.name);
  assert.equal(timelineSeek(shots,48,24).sourceSeconds,0);
  assert.equal(timelineSeek(shots,1,24).sourceSeconds,25/24);
  assert.equal(timelineTimecode(720,24),"00:30.00");
  const split=splitTimelineShot(shots,0,24,24);
  assert.equal(split.length,3);
  assert.equal(split[0].frames,24);
  assert.equal(split[1].startFrame,48);
  assert.equal(timelineSegments(split,24).frames,72);
  const joined=joinTimelineShots(split,0,24);
  assert.deepEqual(joined,shots);
  const shifted=nudgeTimelineShot(shots,1,"out",1,24);
  assert.equal(shifted[1].frames,25);
  assert.equal(timelineSegments(shifted,24).frames,73);
  assert.deepEqual(moveTimelineShot(shots,1,-1,24),[second,first]);
  assert.equal(duplicateTimelineShot(shots,1,24).length,3);
  for(const bad of [0,16,25,NaN])assert.throws(()=>timelineSegments(shots,bad));
  assert.throws(()=>timelineSeek(shots,72,24),/Timeline seek/);
  assert.deepEqual(shots,state(),"frame operations do not mutate original edit state");
});

test("24fps timeline enforces true 720 frame total and 1440 source ceiling",()=>{
  const long={...first,startFrame:0,frames:720,fadeInFrames:0};
  assert.equal(timelineSegments([long],24).seconds,30);
  assert.throws(()=>timelineSegments([long,second],24),/720/);
  assert.throws(()=>timelineSegments([{...first,startFrame:1430,frames:24}],24),/1440/);
  assert.throws(()=>buildLocalVideoBoard({sources:[a],shots:[{
    ...long,frames:721,
  }],quality:"cinematic"}),/720|30 seconds/);
  const reachable={...first,startFrame:1392,frames:24};
  assert.equal(timelineSeek([reachable],0,24).sourceSeconds,58);
});

test("24fps drafts save and restore exact frame positions without media or timebase downgrade",()=>{
  const made=createLocalVideoDraft({
    name:"Cinematic edit take two",sources:[a,b],shots:state(),
    quality:"cinematic",profile:"portrait",
  });
  const reopened=readLocalVideoDraft(made.json);
  assert.equal(reopened.quality,"cinematic");
  assert.equal(reopened.shots[0].startFrame,24);
  assert.equal(reopened.shots[1].frames,24);
  assert.equal(reopened.sources[0].sha256,a.sha256);
  assert.equal(reopened.contains_private_media,false);
  assert.deepEqual(reopened.shots,state());
  assert.equal(buildLocalVideoBoard({
    sources:[a,b],shots:reopened.shots,quality:reopened.quality,
  }).fps,24);
  const edited=structuredClone(reopened);
  edited.quality="high";
  edited.shots[0].startFrame=950;
  edited.shots[0].frames=48;
  assert.throws(()=>readLocalVideoDraft(JSON.stringify(edited)));
});

test("24fps visual sequence and export audit use same actual timebase",()=>{
  const input={sources:[a,b],shots:state(),profile:"landscape",quality:"cinematic"};
  const reviewed=auditLocalVideoExport(input);
  assert.equal(reviewed.canExport,true);
  assert.equal(reviewed.fps,24);
  assert.equal(reviewed.frameCount,72);
  assert.equal(reviewed.seconds,3);
  const plan=localSequencePlan(input.shots,input.sources,24);
  assert.equal(plan.fps,24);
  assert.equal(plan.totalSeconds,3);
  assert.equal(sequenceFrame(plan,48).sourceFrame,0);
  assert.equal(sequenceFrame(plan,47).sourceFrame,71);
  assert.equal(auditLocalVideoExport({...input,shots:[{
    ...first,startFrame:1420,frames:48,
  }]}).canExport,false);
});

test("main Studio and launcher are wired to native cinematic without fake browser rendering",()=>{
  const studio=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const timeline=readFileSync(new URL("../src/components/LocalVideoTimeline.tsx",import.meta.url),"utf8");
  const launcher=readFileSync(new URL("../gpu-worker/launch_portable_video.py",import.meta.url),"utf8");
  const bundle=readFileSync(new URL("../src/lib/ai/portableVideoBundle.mjs",import.meta.url),"utf8");
  for(const token of ["fps={fps}","switchQuality","resetTimelineHistory(mapped)",
                      'buildLocalVideoBoard({ sources, shots, soundtrack, quality })',
                      "native 24 FPS"])assert.ok(studio.includes(token),token);
  assert.match(timeline,/fps=16/);
  assert.match(timeline,/timelineSegments\(shots,fps\)/);
  assert.match(launcher,/manifest\.get\("fps"\) not in \(16, 24\)/);
  assert.match(launcher,/renderer\.check_shots\(board, media, manifest\["fps"\]\)/);
  assert.match(bundle,/fps:project\.fps/);
  assert.doesNotMatch(studio,/supabase\.functions\.invoke|enqueueAIJob/);
});
