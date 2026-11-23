import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditLocalVideoExport,localSequencePlan,sequenceFrame,sequenceAtTime}
  from "../src/lib/ai/localVideoSequenceReview.mjs";
import {buildLocalVideoBoard} from "../src/lib/ai/localVideoEditor.mjs";
import {createLocalVideoDraft,readLocalVideoDraft}
  from "../src/lib/ai/localVideoDraft.mjs";

const a={name:"shoot-a.mp4",size:15700,sha256:"a".repeat(64),url:"blob:original-a"};
const b={name:"shoot-b.mp4",size:16700,sha256:"b".repeat(64),url:"blob:original-b"};
const audio={name:"soundtrack.wav",size:850,sha256:"c".repeat(64),
  rightsRef:"original music rights",volumePercent:35};
const first={sourceName:"shoot-a.mp4",startFrame:16,frames:24,
  caption:"A real original recording",rightsRef:"owned camera log",
  fadeInFrames:3,fadeOutFrames:2};
const second={sourceName:"shoot-b.mp4",startFrame:8,frames:16,
  caption:"Another licensed scene",rightsRef:"shot on property",
  fadeInFrames:0,fadeOutFrames:0};
const third={sourceName:"shoot-a.mp4",startFrame:64,frames:8,
  caption:"Return to first source",rightsRef:"owned camera log",
  fadeInFrames:0,fadeOutFrames:0};
const state=()=>({sources:[a,b],shots:[first,second,third],
  soundtrack:audio,profile:"portrait",quality:"high"});
const codes=r=>r.errors.map(e=>e.code);

test("real per-cut readiness agrees with existing strict CPU FFmpeg storyboard, not fake scores",()=>{
  const input=state();
  const audit=auditLocalVideoExport(input);
  const board=buildLocalVideoBoard(input);
  assert.equal(audit.canExport,true);
  assert.equal(audit.frameCount,board.totalFrames);
  assert.equal(audit.frameCount,48);
  assert.equal(audit.seconds,3);
  assert.equal(audit.sourcesUsed,2);
  assert.equal(audit.soundtrackIncluded,true);
  assert.equal(audit.shots.length,3);
  assert.deepEqual(audit.shots.map(s=>s.issues),[[],[],[]]);
  assert.equal(audit.previewIsRenderedVideo,false);
  assert.equal(audit.rendererRequired,true);
  assert.ok(audit.warnings.some(w=>w.code==="DECODE_UNVERIFIED"));
  assert.ok(audit.warnings.some(w=>w.code==="SOUNDTRACK_NOT_PREVIEWED"));
});

test("unfinished edits report specific actionable missing captions, rights and source files",()=>{
  const input=state();
  input.shots[0]={...first,caption:"",rightsRef:""};
  input.shots[2]={...third,sourceName:"missing.mp4"};
  const checked=auditLocalVideoExport(input);
  assert.equal(checked.canExport,false);
  assert.equal(checked.shots.length,3);
  assert.deepEqual(checked.shots[0].issues.map(r=>r.code),["CAPTION","RIGHTS"]);
  assert.ok(checked.shots[2].issues.some(r=>r.code==="SHOT_SOURCE"));
  assert.ok(codes(checked).includes("CAPTION"));
  assert.ok(codes(checked).includes("RIGHTS"));
  assert.ok(codes(checked).includes("SHOT_SOURCE"));
  const draft=createLocalVideoDraft({
    ...state(),shots:[{...first,caption:"",rightsRef:""},second],
  });
  assert.equal(readLocalVideoDraft(draft.json).shots[0].caption,"");
  assert.equal(auditLocalVideoExport({
    ...state(),shots:readLocalVideoDraft(draft.json).shots,
  }).canExport,false);
});

test("source-inventory and soundtrack errors are visible and cannot approve export",()=>{
  const baseline=state();
  const extra={name:"unused.mp4",size:1234,sha256:"d".repeat(64),url:"blob:unused"};
  const unused=auditLocalVideoExport({...baseline,sources:[a,b,extra]});
  assert.equal(unused.canExport,true);
  assert.deepEqual(unused.sourcesUnused,["unused.mp4"]);
  assert.ok(unused.warnings.some(x=>x.code==="UNUSED_SOURCES"));
  for(const [input,expected] of [
    [{...baseline,sources:[a,a]},"DUPLICATE_SOURCE"],
    [{...baseline,sources:[a]},"SHOT_SOURCE"],
    [{...baseline,sources:[a,{...b,sha256:"INVALID"}]},"SOURCE_INVALID"],
    [{...baseline,soundtrack:{...audio,rightsRef:""}},"AUDIO_RIGHTS"],
    [{...baseline,soundtrack:{...audio,volumePercent:101}},"AUDIO_VOLUME"],
    [{...baseline,soundtrack:{...audio,name:"shoot-a.mp4"}},"AUDIO_INVALID"],
    [{...baseline,profile:"remote"},"OUTPUT_PROFILE"],
  ]){
    const report=auditLocalVideoExport(input);
    assert.equal(report.canExport,false);
    assert.ok(codes(report).includes(expected),
      expected+" must be actionable ("+codes(report).join(",")+")");
  }
});

test("out-of-range frames, invalid fades and total-frame ceiling are fail closed",()=>{
  const baseline=state();
  const changes=[
    [{...first,startFrame:-1}, "SHOT_FRAME_RANGE"],
    [{...first,startFrame:955,frames:24}, "SHOT_FRAME_RANGE"],
    [{...first,frames:1,fadeInFrames:3}, "FADE"],
    [{...first,frames:0}, "SHOT_FRAME_RANGE"],
    [{...first,frames:3.2}, "SHOT_FRAME_RANGE"],
    [{...first,caption:"invalid\ncaption"}, "CAPTION"],
    [{...first,rightsRef:"bad\u0000rights"}, "RIGHTS"],
  ];
  for(const [shot,code] of changes){
    const audit=auditLocalVideoExport({...baseline,shots:[shot,second]});
    assert.equal(audit.canExport,false);
    assert.ok(codes(audit).includes(code),code);
  }
  const tooLong=auditLocalVideoExport({
    ...baseline,shots:[{...first,startFrame:0,frames:480},second],
  });
  assert.equal(tooLong.canExport,false);
  assert.ok(codes(tooLong).includes("TOTAL_FRAMES"));
  assert.equal(auditLocalVideoExport({...baseline,shots:[]}).canExport,false);
});

test("real three-cut original sequence plan preserves order, trims and repeated source provenance",()=>{
  const p=localSequencePlan(state().shots,state().sources);
  assert.equal(p.fps,16);
  assert.equal(p.totalFrames,48);
  assert.equal(p.totalSeconds,3);
  assert.deepEqual(p.cuts.map(s=>s.file),[
    "shoot-a.mp4","shoot-b.mp4","shoot-a.mp4"]);
  assert.deepEqual(p.cuts.map(s=>s.url),[
    "blob:original-a","blob:original-b","blob:original-a"]);
  assert.deepEqual(p.cuts.map(s=>[s.startFrame,s.endFrame]),[
    [0,24],[24,40],[40,48]]);
  assert.deepEqual(p.cuts.map(s=>[s.sourceStartFrame,s.sourceEndFrame]),[
    [16,40],[8,24],[64,72]]);
  assert.deepEqual(p.cuts.map(s=>s.sourceStartSeconds),[1,.5,4]);
  assert.equal(p.cuts[2].caption,"Return to first source");
  assert.equal(p.cuts[0].rightsPresent,true);
});

test("whole-sequence 16 FPS seek crosses exact source cut boundaries",()=>{
  const p=localSequencePlan(state().shots,state().sources);
  assert.deepEqual(sequenceFrame(p,0),{
    index:0,globalFrame:0,sourceFrame:16,sourceSeconds:1,
    caption:"A real original recording",
  });
  assert.equal(sequenceFrame(p,23).sourceFrame,39);
  assert.equal(sequenceFrame(p,24).index,1);
  assert.equal(sequenceFrame(p,24).sourceFrame,8);
  assert.equal(sequenceFrame(p,39).sourceFrame,23);
  assert.equal(sequenceFrame(p,40).index,2);
  assert.equal(sequenceFrame(p,40).sourceFrame,64);
  assert.equal(sequenceFrame(p,47).sourceFrame,71);
  for(const target of [-1,48,2.5,NaN,"4",true])
    assert.throws(()=>sequenceFrame(p,target));
});

test("true browser source playback translates cut endpoints into correct next source",()=>{
  const p=localSequencePlan(state().shots,state().sources);
  const inside=sequenceAtTime(p,0,1.5);
  assert.equal(inside.frame,8);
  assert.equal(inside.nextIndex,0);
  assert.equal(inside.reachedEnd,false);
  const endFirst=sequenceAtTime(p,0,40/16);
  assert.equal(endFirst.nextIndex,1);
  assert.equal(endFirst.reachedEnd,false);
  const endSecond=sequenceAtTime(p,1,24/16);
  assert.equal(endSecond.nextIndex,2);
  assert.equal(endSecond.reachedEnd,false);
  const endLast=sequenceAtTime(p,2,72/16);
  assert.equal(endLast.nextIndex,null);
  assert.equal(endLast.reachedEnd,true);
  assert.equal(endLast.frame,47);
  for(const args of [[-1,1],[3,1],[0,NaN],[0,"1"],[0,Infinity]])
    assert.throws(()=>sequenceAtTime(p,...args));
});

test("source browser preview cannot silently switch to wrong/unsafe/duplicate private files",()=>{
  const input=state();
  for(const sources of [
    [a],
    [a,{...b,url:"https://external.example/private.mp4"}],
    [a,{...b,url:""}],
    [a,{...b,sha256:"not-a-real-hash"}],
    [a,b,{...b,url:"blob:duplicate"}],
    [a,{...b,name:"SHOOT-B.MP4"}],
  ])assert.throws(()=>localSequencePlan(input.shots,sources));
  assert.throws(()=>localSequencePlan([{...first,frames:0}],[a]));
  assert.throws(()=>localSequencePlan([{...first,sourceName:"bad.mp4"}],[a,b]));
});

test("the new preview is wired to real local timeline sources and jump-to-edit controls",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const component=readFileSync(new URL("../src/components/LocalVideoSequenceReview.tsx",import.meta.url),"utf8");
  assert.match(parent,/import LocalVideoSequenceReview/);
  assert.match(parent,/<LocalVideoSequenceReview/);
  assert.match(parent,/id=\{"local-video-shot-"\+i\}/);
  assert.match(parent,/scrollIntoView/);
  assert.match(component,/auditLocalVideoExport/);
  assert.match(component,/localSequencePlan/);
  assert.match(component,/sequenceAtTime/);
  assert.match(component,/sequenceFrame/);
  assert.match(component,/onLoadedMetadata/);
  assert.match(component,/onTimeUpdate/);
  assert.match(component,/onEnded/);
  assert.match(component,/Play sequence/);
  assert.match(component,/Edit shot/);
  assert.match(component,/previewIsRenderedVideo/===false? /canExport/:/canExport/);
  assert.match(component,/Browser seeking may not align/);
  assert.doesNotMatch(component,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
