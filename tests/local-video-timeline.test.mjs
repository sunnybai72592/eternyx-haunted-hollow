import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  timelineSegments,timelineSeek,timelineTimecode,splitTimelineShot,
  duplicateTimelineShot,moveTimelineShot,removeTimelineShot,
  nudgeTimelineShot,joinTimelineShots,
} from "../src/lib/ai/localVideoTimeline.mjs";
import {buildLocalVideoBoard} from "../src/lib/ai/localVideoEditor.mjs";
import {createLocalVideoDraft,readLocalVideoDraft} from "../src/lib/ai/localVideoDraft.mjs";

const clips=[
  {name:"a.mp4",sha256:"a".repeat(64),size:200},
  {name:"b.mp4",sha256:"b".repeat(64),size:250},
];
const first={sourceName:"a.mp4",startFrame:16,frames:32,
  caption:"Original A",rightsRef:"owned-a",
  fadeInFrames:4,fadeOutFrames:4};
const second={sourceName:"b.mp4",startFrame:8,frames:16,
  caption:"Original B",rightsRef:"owned-b",
  fadeInFrames:0,fadeOutFrames:0};
const initial=()=>[structuredClone(first),structuredClone(second)];

test("frame-accurate proportional visual timeline and exact original source timestamps",()=>{
  const a=timelineSegments(initial());
  assert.equal(a.frames,48);
  assert.equal(a.seconds,3);
  assert.equal(a.fps,16);
  assert.equal(a.segments[0].startFrame,0);
  assert.equal(a.segments[0].endFrame,32);
  assert.equal(a.segments[0].sourceStartFrame,16);
  assert.equal(a.segments[0].sourceEndFrame,48);
  assert.equal(a.segments[1].startFrame,32);
  assert.equal(a.segments[1].endFrame,48);
  assert.equal(a.segments[1].widthPercent,100/3);
  assert.ok(Math.abs(a.segments.reduce((sum,s)=>sum+s.widthPercent,0)-100)<1e-9);
  assert.equal(timelineTimecode(0),"00:00.00");
  assert.equal(timelineTimecode(8),"00:00.50");
  assert.equal(timelineTimecode(16),"00:01.00");
  assert.equal(timelineTimecode(480),"00:30.00");
});

test("seek maps global cut boundaries to ORIGINAL file time without pretending to render",()=>{
  const shots=initial();
  assert.deepEqual(timelineSeek(shots,0),{
    index:0,globalFrame:0,sourceName:"a.mp4",
    sourceFrame:16,sourceSeconds:1,globalSeconds:0,
    cutEndSeconds:3,remainingFrames:32,caption:"Original A",
  });
  assert.equal(timelineSeek(shots,31).sourceFrame,47);
  assert.equal(timelineSeek(shots,32).sourceName,"b.mp4");
  assert.equal(timelineSeek(shots,32).sourceFrame,8);
  assert.equal(timelineSeek(shots,47).sourceFrame,23);
  for(const position of [-1,48,2.5,NaN,true])
    assert.throws(()=>timelineSeek(shots,position));
});

test("split at chosen frame preserves every original source frame, captions, rights and endpoint fades",()=>{
  const shots=initial();
  const result=splitTimelineShot(shots,0,8);
  assert.equal(result.length,3);
  assert.equal(timelineSegments(result).frames,48);
  assert.deepEqual(result[0],{
    ...first,frames:8,fadeInFrames:4,fadeOutFrames:0,
  });
  assert.deepEqual(result[1],{
    ...first,startFrame:24,frames:24,fadeInFrames:0,fadeOutFrames:4,
  });
  assert.deepEqual(result[2],second);
  assert.deepEqual(shots,initial(),"split never mutates existing draft");
  assert.equal(timelineSeek(result,8).sourceFrame,24);
  const edge=splitTimelineShot(initial(),0,1);
  assert.equal(edge[0].fadeInFrames,0);
  assert.equal(edge[1].startFrame,17);
  for(const offset of [0,32,33,-1,true,3.5])
    assert.throws(()=>splitTimelineShot(initial(),0,offset));
});

test("duplication uses a real copied cut and respects eight-cut and 480-frame limits",()=>{
  const original=initial();
  const copy=duplicateTimelineShot(original,1);
  assert.equal(copy.length,3);
  assert.equal(timelineSegments(copy).frames,64);
  assert.deepEqual(copy[1],copy[2]);
  assert.notEqual(copy[1],copy[2]);
  assert.equal(original.length,2);
  assert.throws(()=>duplicateTimelineShot(
    Array.from({length:8},()=>({...first,frames:16,fadeInFrames:0,fadeOutFrames:0})),0),
    /Maximum 8/);
  assert.throws(()=>duplicateTimelineShot([
    {...first,frames:400,fadeInFrames:4,fadeOutFrames:4},
    {...second,frames:80},
  ],0),/30-second/);
});

test("one-frame nudge supports both source in/out, clamps legal fades and rejects invalid limits",()=>{
  const original=initial();
  const short=nudgeTimelineShot(original,0,"in",1);
  assert.equal(short[0].startFrame,17);
  assert.equal(short[0].frames,31);
  assert.equal(timelineSegments(short).frames,47);
  const longer=nudgeTimelineShot(short,0,"in",-1);
  assert.deepEqual(longer,original);
  const extended=nudgeTimelineShot(original,0,"out",1);
  assert.equal(extended[0].startFrame,16);
  assert.equal(extended[0].frames,33);
  assert.equal(timelineSegments(extended).frames,49);
  const trimmed=nudgeTimelineShot(original,0,"out",-1);
  assert.equal(trimmed[0].frames,31);
  const fade=nudgeTimelineShot([{
    ...first,startFrame:0,frames:8,fadeInFrames:4,fadeOutFrames:4,
  }],0,"out",-7);
  assert.equal(fade[0].frames,1);
  assert.equal(fade[0].fadeInFrames,0);
  assert.equal(fade[0].fadeOutFrames,0);
  for(const bad of [
    ()=>nudgeTimelineShot(initial(),0,"bad",1),
    ()=>nudgeTimelineShot(initial(),0,"in",1.5),
    ()=>nudgeTimelineShot(initial(),0,"out",17),
    ()=>nudgeTimelineShot([{...first,startFrame:0,frames:16}],0,"in",-1),
    ()=>nudgeTimelineShot([{...first,startFrame:959,frames:1,fadeInFrames:0,fadeOutFrames:0}],0,"out",1),
    ()=>nudgeTimelineShot([{...first,frames:1,fadeInFrames:0,fadeOutFrames:0}],0,"out",-1),
  ])assert.throws(bad);
});

test("joins only semantically equivalent contiguous cuts without losing effects",()=>{
  const compatible=[
    {...first,startFrame:0,frames:16,fadeInFrames:2,fadeOutFrames:0},
    {...first,startFrame:16,frames:16,fadeInFrames:0,fadeOutFrames:3},
  ];
  const merged=joinTimelineShots(compatible,0);
  assert.deepEqual(merged,[{...first,startFrame:0,frames:32,
    fadeInFrames:2,fadeOutFrames:3}]);
  assert.deepEqual(compatible[0].frames,16);
  for(const change of [
    {sourceName:"b.mp4"},{startFrame:18},{caption:"Different"},
    {rightsRef:"other"},{fadeInFrames:2},
  ]){
    assert.throws(()=>joinTimelineShots([compatible[0],{
      ...compatible[1],...change,
    }],0));
  }
  assert.throws(()=>joinTimelineShots([
    {...compatible[0],fadeOutFrames:2},compatible[1],
  ],0));
});

test("reorder, remove, and draft preservation keep frame provenance consistent",()=>{
  const original=initial();
  const moved=moveTimelineShot(original,1,-1);
  assert.deepEqual(moved,[second,first]);
  assert.equal(timelineSeek(moved,0).sourceName,"b.mp4");
  assert.deepEqual(moveTimelineShot(moved,0,1),original);
  assert.deepEqual(removeTimelineShot(moved,0),[first]);
  assert.equal(timelineSegments(removeTimelineShot(moved,0)).frames,32);
  assert.deepEqual(original,initial());
  assert.throws(()=>removeTimelineShot([first],0),/at least one/);
  assert.throws(()=>moveTimelineShot(original,0,-1));
  assert.throws(()=>moveTimelineShot(original,1,2));
});

test("all timeline operations use unchanged original v2 storyboard and saved local draft schema",()=>{
  let shots=initial();
  shots=splitTimelineShot(shots,0,16);
  shots=moveTimelineShot(shots,1,1);
  shots=nudgeTimelineShot(shots,0,"out",-1);
  const board=buildLocalVideoBoard({sources:clips,shots});
  const saved=createLocalVideoDraft({
    name:"Editable timeline after precision cuts",
    sources:clips,shots,quality:"high",profile:"square",
  });
  const parsed=readLocalVideoDraft(saved.json);
  assert.deepEqual(parsed.shots,shots);
  assert.equal(parsed.profile,"square");
  assert.equal(board.board.shots[0].start_frame,16);
  assert.equal(board.board.shots[0].frames,15);
  assert.equal(board.totalFrames,timelineSegments(shots).frames);
  assert.equal(board.board.shots[1].source_sha256,"b".repeat(64));
  assert.ok(!("base64" in saved.draft));
});

test("rejects unbounded or malformed WIP segments before making edits",()=>{
  for(const shots of [
    [],Array.from({length:9},()=>first),
    [{...first,frames:0}],[{...first,frames:true}],
    [{...first,frames:Infinity}],[{...first,startFrame:960,frames:2}],
    [{...first,fadeInFrames:17}],[(null)],
    [{...first,sourceName:""}],
    [{...first,frames:480},{...second,frames:1}],
  ])assert.throws(()=>timelineSegments(shots));
  assert.throws(()=>splitTimelineShot(initial(),99,1));
  assert.throws(()=>joinTimelineShots(initial(),2));
  assert.throws(()=>timelineTimecode(-1));
});

test("real Studio mounts visual edit operations, accessible keyboard and honest original MP4 preview",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const studio=readFileSync(new URL("../src/components/LocalVideoTimeline.tsx",import.meta.url),"utf8");
  assert.match(parent,/import LocalVideoTimeline/);
  assert.match(parent,/<LocalVideoTimeline shots=\{shots\} sources=\{sources\}/);
  assert.match(parent,/setShots\(next\)/);
  assert.match(studio,/timelineSegments/);
  assert.match(studio,/timelineSeek/);
  assert.match(studio,/splitTimelineShot/);
  assert.match(studio,/duplicateTimelineShot/);
  assert.match(studio,/joinTimelineShots/);
  assert.match(studio,/nudgeTimelineShot/);
  assert.match(studio,/moveTimelineShot/);
  assert.match(studio,/removeTimelineShot/);
  assert.match(studio,/aria-pressed=\{selected===s.index\}/);
  assert.match(studio,/ArrowLeft/);
  assert.match(studio,/onLoadedMetadata/);
  assert.match(studio,/onTimeUpdate/);
  assert.match(studio,/Browser seeks are approximate/);
  assert.doesNotMatch(studio,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
