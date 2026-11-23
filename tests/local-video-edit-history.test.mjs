import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  TIMELINE_HISTORY_LIMIT,newTimelineHistory,commitTimelineHistory,
  undoTimelineHistory,redoTimelineHistory,resetTimelineHistory,
  timelineHistoryStatus,
} from "../src/lib/ai/localVideoEditHistory.mjs";
import {
  timelineSegments,splitTimelineShot,duplicateTimelineShot,
  nudgeTimelineShot,removeTimelineShot,moveTimelineShot,
  repositionTimelineShot,
} from "../src/lib/ai/localVideoTimeline.mjs";
import {buildLocalVideoBoard} from "../src/lib/ai/localVideoEditor.mjs";
import {createLocalVideoDraft,readLocalVideoDraft} from "../src/lib/ai/localVideoDraft.mjs";
const source={name:"owned.mp4",sha256:"a".repeat(64),size:250};
const a={sourceName:"owned.mp4",startFrame:0,frames:32,
  caption:"Owner footage",rightsRef:"camera-log",fadeInFrames:4,fadeOutFrames:2};
const b={sourceName:"owned.mp4",startFrame:32,frames:16,
  caption:"Owner second cut",rightsRef:"camera-log",fadeInFrames:0,fadeOutFrames:0};
const c={sourceName:"owned.mp4",startFrame:48,frames:16,
  caption:"Owner third cut",rightsRef:"camera-log",fadeInFrames:0,fadeOutFrames:0};
const start=()=>[structuredClone(a),structuredClone(b)];

test("one actual bounded journal records split, trim, duplication and undo/redo in exact order",()=>{
  let history=newTimelineHistory(start());
  assert.deepEqual(timelineHistoryStatus(history),{
    undo:false,redo:false,previousSteps:0,nextSteps:0,maxSteps:40});
  const initial=history.present;
  history=commitTimelineHistory(history,splitTimelineShot(history.present,0,16));
  history=commitTimelineHistory(history,nudgeTimelineShot(history.present,2,"out",2));
  history=commitTimelineHistory(history,duplicateTimelineShot(history.present,1));
  assert.equal(history.past.length,3);
  assert.equal(history.present.length,4);
  assert.equal(timelineSegments(history.present).frames,66);
  history=undoTimelineHistory(history);
  assert.equal(history.present.length,3);
  assert.equal(timelineSegments(history.present).frames,50);
  history=undoTimelineHistory(history);
  assert.equal(timelineSegments(history.present).frames,48);
  history=undoTimelineHistory(history);
  assert.deepEqual(history.present,initial);
  assert.deepEqual(undoTimelineHistory(history),history);
  history=redoTimelineHistory(history);
  history=redoTimelineHistory(history);
  history=redoTimelineHistory(history);
  assert.equal(history.present.length,4);
  assert.equal(timelineSegments(history.present).frames,66);
  assert.deepEqual(redoTimelineHistory(history),history);
});

test("manual caption and rights edits are undoable without storing private media bytes",()=>{
  const startShot={...a};
  const input=[{...startShot,file:new Blob(["secret unpublished movie"]),url:"blob:private"}];
  let history=newTimelineHistory(input);
  assert.deepEqual(Object.keys(history.present[0]),[
    "sourceName","startFrame","frames","caption","rightsRef",
    "fadeInFrames","fadeOutFrames"]);
  assert.ok(!("file" in history.present[0]));
  assert.ok(!("url" in history.present[0]));
  history=commitTimelineHistory(history,[{...startShot,caption:"First draft"}]);
  history=commitTimelineHistory(history,[{...startShot,caption:"First draft",rightsRef:"verified release"}]);
  assert.equal(history.present[0].rightsRef,"verified release");
  history=undoTimelineHistory(history);
  assert.equal(history.present[0].caption,"First draft");
  assert.equal(history.present[0].rightsRef,"camera-log");
  history=undoTimelineHistory(history);
  assert.equal(history.present[0].caption,"Owner footage");
  history=redoTimelineHistory(history);
  assert.equal(history.present[0].caption,"First draft");
});

test("redo chain must be invalidated by new edits after undo, but no-op edits keep chain",()=>{
  let history=newTimelineHistory(start());
  history=commitTimelineHistory(history,[{...a,caption:"A"},b]);
  history=commitTimelineHistory(history,[{...a,caption:"B"},b]);
  history=undoTimelineHistory(history);
  assert.equal(history.future.length,1);
  const unchanged=commitTimelineHistory(history,structuredClone(history.present));
  assert.strictEqual(unchanged,history);
  history=commitTimelineHistory(history,[{...a,caption:"C"},b]);
  assert.equal(history.present[0].caption,"C");
  assert.equal(history.future.length,0);
  assert.equal(timelineHistoryStatus(history).redo,false);
});

test("history is truly bounded to 40 steps and preserves undo at its boundary",()=>{
  let history=newTimelineHistory([a]);
  for(let n=1;n<=70;n++)
    history=commitTimelineHistory(history,[{...a,caption:"Edit "+n}]);
  assert.equal(history.past.length,TIMELINE_HISTORY_LIMIT);
  assert.equal(history.present[0].caption,"Edit 70");
  for(let n=0;n<40;n++)history=undoTimelineHistory(history);
  assert.equal(history.present[0].caption,"Edit 30");
  assert.equal(history.past.length,0);
  assert.equal(history.future.length,40);
  for(let n=0;n<40;n++)history=redoTimelineHistory(history);
  assert.equal(history.present[0].caption,"Edit 70");
  assert.equal(history.future.length,0);
});

test("reopening project or replacing local MP4s clears all stale undo/redo states",()=>{
  let history=newTimelineHistory(start());
  history=commitTimelineHistory(history,splitTimelineShot(history.present,0,16));
  history=undoTimelineHistory(history);
  assert.equal(history.future.length,1);
  const reopened=[{...a,sourceName:"new-source.mp4"}];
  const reset=resetTimelineHistory(reopened);
  assert.equal(reset.past.length,0);
  assert.equal(reset.future.length,0);
  assert.equal(reset.present[0].sourceName,"new-source.mp4");
  assert.equal(timelineHistoryStatus(reset).undo,false);
  assert.equal(undoTimelineHistory(reset).present[0].sourceName,"new-source.mp4");
  assert.ok(!JSON.stringify(reset).includes("owned.mp4"));
});

test("drag-and-drop moves actual local shots to any destination without losing rights or trim metadata",()=>{
  const original=[a,b,c];
  const moved=repositionTimelineShot(original,0,2);
  assert.deepEqual(moved,[b,c,a]);
  assert.deepEqual(repositionTimelineShot(moved,2,0),original);
  assert.equal(timelineSegments(moved).frames,64);
  assert.deepEqual(original,[a,b,c]);
  assert.deepEqual(repositionTimelineShot(original,1,1),original);
  assert.notEqual(repositionTimelineShot(original,1,1),original);
  for(const [from,to] of [[-1,0],[0,3],[null,1],[1,1.4],[true,0]])
    assert.throws(()=>repositionTimelineShot(original,from,to));
});

test("drag reorder and undo/redo leave render storyboard and local draft compatible",()=>{
  let history=newTimelineHistory(start());
  history=commitTimelineHistory(history,
    repositionTimelineShot(history.present,0,1));
  history=commitTimelineHistory(history,
    nudgeTimelineShot(history.present,1,"out",-1));
  history=undoTimelineHistory(history);
  history=redoTimelineHistory(history);
  const rendered=buildLocalVideoBoard({sources:[source],shots:history.present});
  assert.equal(rendered.board.version,2);
  const saved=createLocalVideoDraft({
    name:"The same project",sources:[source],shots:history.present,
    soundtrack:null,profile:"landscape",quality:"standard",
  });
  assert.deepEqual(readLocalVideoDraft(saved.json).shots,history.present);
  assert.deepEqual(rendered.board.shots.map(x=>x.file),["owned.mp4","owned.mp4"]);
  assert.equal(rendered.totalFrames,47);
});

test("history rejects malformed records and cannot copy arbitrary object URLs or blobs",()=>{
  for(const invalid of [
    [null],[{}],[{...a,caption:"bad"},null],
    Array.from({length:9},()=>a),
  ])assert.throws(()=>newTimelineHistory(invalid));
  let state=newTimelineHistory(start());
  assert.throws(()=>commitTimelineHistory(null,start()));
  assert.throws(()=>commitTimelineHistory(state,[null]));
  assert.throws(()=>commitTimelineHistory(state,Array.from({length:9},()=>a)));
  assert.throws(()=>timelineHistoryStatus({past:Array(41).fill([]),present:[],future:[]}));
});

test("manual form and visual timeline edits share one history with no data sent to any backend",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  assert.match(parent,/commitTimelineHistory/);
  assert.match(parent,/const setShots = \(update:SetStateAction<LocalShot\[\]>\)/);
  assert.match(parent,/resetTimelineHistory\(verified\.shots\)/);
  assert.match(parent,/resetTimelineHistory\(prepared\.map/);
  assert.match(parent,/canUndo=\{historyStatus.undo\}/);
  assert.match(parent,/onUndo=\{undoShotEdit\}/);
  assert.match(parent,/const changeShot/);
  assert.match(parent,/onChange=\{next=>\{/);
  const ui=readFileSync(new URL("../src/components/LocalVideoTimeline.tsx",import.meta.url),"utf8");
  assert.match(ui,/Undo cut edit/);
  assert.match(ui,/Redo cut edit/);
  assert.match(ui,/event\.ctrlKey\|\|event\.metaKey/);
  assert.match(ui,/target\.closest\("input,textarea,select/);
  assert.match(ui,/repositionTimelineShot/);
  assert.match(ui,/onDragStart/);
  assert.match(ui,/onDrop/);
  assert.match(ui,/Play selected cut/);
  assert.match(ui,/previewPlaying\.current/);
  assert.match(ui,/onTimeUpdate/);
  assert.match(ui,/Browser seeks are approximate/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("history excludes project source files and cannot undo back into previous imported media",()=>{
  let history=newTimelineHistory(start());
  history=commitTimelineHistory(history,removeTimelineShot(history.present,1));
  history=commitTimelineHistory(history,moveTimelineShot(
    [...history.present,b],1,-1));
  assert.equal(history.past.length,2);
  const futureSource={...a,sourceName:"different-owned.mp4"};
  history=resetTimelineHistory([futureSource]);
  history=redoTimelineHistory(undoTimelineHistory(history));
  assert.deepEqual(history.present,[futureSource]);
  assert.equal(timelineSegments(history.present).frames,32);
});
