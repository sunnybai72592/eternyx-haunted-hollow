import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  VIDEO_DRAFT_LIMITS,createLocalVideoDraft,readLocalVideoDraft,
  verifyLocalVideoDraftMedia,
} from "../src/lib/ai/localVideoDraft.mjs";
import {buildLocalVideoBoard} from "../src/lib/ai/localVideoEditor.mjs";

const hash=data=>createHash("sha256").update(data).digest("hex");
const mk=(name,txt)=>{
  const data=Buffer.from(txt);
  const file=Object.assign(new Blob([data]),{name});
  return {name,size:file.size,sha256:hash(data),file};
};
const clipA=mk("a.mp4","private original clip A: never put bytes in draft");
const clipB=mk("b.mp4","private original clip B: not saved in draft");
const music=mk("music.wav","original private soundtrack: not saved in draft");
const shots=[
  {sourceName:"b.mp4",startFrame:7,frames:16,caption:"",
    rightsRef:"",fadeInFrames:2,fadeOutFrames:1},
  {sourceName:"a.mp4",startFrame:0,frames:32,
    caption:"Edited caption with علامات & < >",
    rightsRef:"filmed by owner, ref 2026",
    fadeInFrames:0,fadeOutFrames:3},
];
const audio={...music,rightsRef:"original music license",volumePercent:28};
const state=()=>({name:"My local video 2026",sources:[clipA,clipB],shots,
  soundtrack:audio,profile:"portrait",quality:"high"});

test("unfinished editable draft roundtrips with exact cuts, order, captions, license, audio and profile",()=>{
  const made=createLocalVideoDraft(state());
  assert.equal(made.filename,"eternyx-video-edit-draft.json");
  assert.equal(made.frames,48);
  assert.equal(made.sourceCount,3);
  assert.equal(made.draft.contains_private_media,false);
  const restored=readLocalVideoDraft(made.json);
  assert.deepEqual(restored,made.draft);
  assert.deepEqual(restored.shots,shots);
  assert.equal(restored.name,"My local video 2026");
  assert.equal(restored.soundtrack.volumePercent,28);
  assert.equal(restored.shots[0].caption,"");
  assert.equal(restored.shots[0].rightsRef,"");
  assert.equal(restored.profile,"portrait");
  assert.equal(restored.quality,"high");
  assert.throws(()=>buildLocalVideoBoard({sources:[clipA,clipB],
    shots:restored.shots,soundtrack:restored.soundtrack}),/caption|rights/);
});

test("draft includes no original bytes, blob, object URL, executable paths, or media data",()=>{
  const made=createLocalVideoDraft(state());
  assert.ok(!made.json.includes("private original clip A"));
  assert.ok(!made.json.includes("private original clip B"));
  assert.ok(!made.json.includes("original private soundtrack"));
  assert.doesNotMatch(made.json,/blob:|data:video|data:audio|file:\/\/|https?:\/\//);
  assert.equal(made.draft.sources.length,2);
  assert.deepEqual(Object.keys(made.draft.sources[0]),["name","size","sha256"]);
  assert.deepEqual(Object.keys(made.draft.soundtrack),[
    "name","size","sha256","rightsRef","volumePercent"]);
  assert.equal(made.json.length<VIDEO_DRAFT_LIMITS.maxBytes,true);
});

test("verified exact original private bytes restore every editable cut and soundtrack",async()=>{
  const draft=readLocalVideoDraft(createLocalVideoDraft(state()).json);
  const steps=[];
  const resolved=await verifyLocalVideoDraftMedia(draft,
    [music.file,clipB.file,clipA.file],step=>steps.push(step));
  assert.equal(resolved.privateMediaUploaded,false);
  assert.equal(resolved.verifiedCount,3);
  assert.deepEqual(resolved.shots,shots);
  assert.equal(resolved.profile,"portrait");
  assert.equal(resolved.quality,"high");
  assert.equal(resolved.name,"My local video 2026");
  assert.equal(resolved.sources[0].file,clipA.file);
  assert.equal(resolved.sources[1].file,clipB.file);
  assert.equal(resolved.soundtrack.file,music.file);
  assert.equal(resolved.soundtrack.rightsRef,"original music license");
  assert.equal(resolved.soundtrack.volumePercent,28);
  assert.deepEqual(steps.map(s=>s.checked),[1,2,3]);
  assert.equal(steps[2].total,3);
});

test("fail closed on tampered, renamed, missing, extra and duplicate actual files",async()=>{
  const draft=readLocalVideoDraft(createLocalVideoDraft(state()).json);
  const corrupt=mk("a.mp4","bad original bytes same length? not same file");
  const sameSizeWrong=mk("a.mp4","X".repeat(clipA.size));
  for(const files of [
    [clipA.file,clipB.file],
    [clipA.file,clipB.file,music.file,clipA.file],
    [clipA.file,clipA.file,music.file],
    [sameSizeWrong.file,clipB.file,music.file],
    [corrupt.file,clipB.file,music.file],
    [Object.assign(new Blob([Buffer.from("x")]),{name:"extra.mp4"}),clipB.file,music.file],
    [Object.assign(new Blob([await clipA.file.arrayBuffer()]),{name:"A.mp4"}),clipB.file,music.file],
  ]){
    await assert.rejects(()=>verifyLocalVideoDraftMedia(draft,files));
  }
  const good=await verifyLocalVideoDraftMedia(draft,[clipA.file,clipB.file,music.file]);
  assert.equal(good.verifiedCount,3);
});

test("draft schema rejects embedded media, unknown fields, cross-source injection and wrong limits",()=>{
  const base=readLocalVideoDraft(createLocalVideoDraft(state()).json);
  const edits=[
    r=>{r.contains_private_media=true;},
    r=>{r.version=2;},
    r=>{r.format="fake-genai-t2v";},
    r=>{r.base64_video="privatebytes";},
    r=>{r.sources[0].file="secret upload";},
    r=>{r.sources[0].name="../bad.mp4";},
    r=>{r.sources[0].sha256="bad";},
    r=>{r.sources[0].size=0;},
    r=>{r.sources[1].name="A.mp4";},
    r=>{r.soundtrack.rightsRef="bad\u0000data";},
    r=>{r.soundtrack.volumePercent=105;},
    r=>{r.shots[0].sourceName="../secret.mp4";},
    r=>{r.shots[0].startFrame=-1;},
    r=>{r.shots[0].frames=481;},
    r=>{r.shots[0].frames=500;},
    r=>{r.shots[0].caption="\nmalicious";},
    r=>{r.shots[0].fadeInFrames=9;},
    r=>{r.shots[0].untrusted="bad";},
    r=>{r.name="";},
    r=>{r.quality="gpu";},
    r=>{r.profile="untrusted";},
    r=>{r.shots.push(...Array(7).fill(r.shots[0]));},
  ];
  for(const mutate of edits){
    const changed=structuredClone(base);mutate(changed);
    assert.throws(()=>readLocalVideoDraft(JSON.stringify(changed)));
  }
  for(const malformed of ["{",null,"[]"," ".repeat(32769)]){
    assert.throws(()=>readLocalVideoDraft(malformed));
  }
});

test("draft without soundtrack restores original clips and remains editable",async()=>{
  const plain={name:"Plain footage",sources:[clipA],shots:[{
    sourceName:"a.mp4",startFrame:0,frames:8,
    caption:"",rightsRef:"",fadeInFrames:0,fadeOutFrames:0,
  }],soundtrack:null,profile:"square",quality:"standard"};
  const draft=readLocalVideoDraft(createLocalVideoDraft(plain).json);
  const opened=await verifyLocalVideoDraftMedia(draft,[clipA.file]);
  assert.equal(opened.verifiedCount,1);
  assert.equal(opened.soundtrack,null);
  assert.equal(opened.shots[0].caption,"");
  assert.equal(opened.profile,"square");
  assert.equal(opened.privateMediaUploaded,false);
});

test("live Studio has explicit save/reopen/reattach UX and transactional object URL lifecycle",()=>{
  const ui=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  assert.match(ui,/createLocalVideoDraft/);
  assert.match(ui,/readLocalVideoDraft/);
  assert.match(ui,/verifyLocalVideoDraftMedia/);
  assert.match(ui,/Save editable project draft/);
  assert.match(ui,/Reattach all original MP4/);
  assert.match(ui,/setSources\(prepared\)/);
  assert.match(ui,/setTimelineHistory\(resetTimelineHistory\(verified\.shots\)\)/);
  assert.match(ui,/if\(!committed\)/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/Your current timeline remains untouched until verification succeeds/);
  assert.doesNotMatch(ui,/localStorage\.setItem|indexedDB\.open|fetch\(.*draft|supabase.*draft/);
});

test("local drafts roundtrip color grade and crop without changing old draft schema",()=>{
  const source={name:"camera.mp4",size:20,sha256:"a".repeat(64)};
  const shot={sourceName:source.name,startFrame:0,frames:24,caption:"",rightsRef:"",fadeInFrames:0,fadeOutFrames:0};
  const input={sources:[source],shots:[shot],quality:"cinematic"};
  const draft=createLocalVideoDraft({...input,grade:"warm",framing:"cover"});
  assert.equal(readLocalVideoDraft(draft.json).grade,"warm");
  assert.equal(readLocalVideoDraft(draft.json).framing,"cover");
  assert.equal(Object.hasOwn(createLocalVideoDraft(input).draft,"grade"),false);
  assert.throws(()=>createLocalVideoDraft({...input,grade:"unsafe"}));
});

test("soundtrack placement and fades roundtrip through metadata-only saved drafts",()=>{
  const source={name:"camera.mp4",size:20,sha256:"a".repeat(64)};
  const shot={sourceName:source.name,startFrame:0,frames:24,caption:"",rightsRef:"",fadeInFrames:0,fadeOutFrames:0};
  const soundtrack={name:"music.wav",size:20,sha256:"b".repeat(64),rightsRef:"owned",volumePercent:60,sourceStartMs:500,timelineStartMs:100,durationMs:700,fadeInMs:100,fadeOutMs:200,loop:false};
  const input={sources:[source],shots:[shot],soundtrack,quality:"cinematic"};
  const made=createLocalVideoDraft(input);
  assert.deepEqual(readLocalVideoDraft(made.json).soundtrack,soundtrack);
  assert.throws(()=>createLocalVideoDraft({...input,soundtrack:{...soundtrack,fadeOutMs:700}}),/Soundtrack/);
});
