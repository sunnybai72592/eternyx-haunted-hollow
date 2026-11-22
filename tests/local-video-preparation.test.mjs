import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  phonePreparationCommand, readPhonePreparationReport,
  checkPreparedVideoSelection, MAX_PREP_REPORT_BYTES,
} from "../src/lib/ai/localVideoPrep.mjs";

const sample = {
  version:1, kind:"local_cpu_video_import", model_generation:false, source_count:2,
  clips:[
    {source_filename:"phone clip.mov", source_sha256:"a".repeat(64),
     prepared_filename:"clip-01.mp4", prepared_sha256:"b".repeat(64),
     prepared_bytes:150, prepared_fps:"16/1", prepared_frames:32,
     prepared_width:64, prepared_height:36, prepared_duration_seconds:2,
     reported_fps:"30/1", reported_duration_seconds:3,
     start_seconds:0,seconds_limit:2},
    {source_filename:"vertical.MP4", source_sha256:"c".repeat(64),
     prepared_filename:"clip-02.mp4", prepared_sha256:"d".repeat(64),
     prepared_bytes:200, prepared_fps:"16/1", prepared_frames:16,
     prepared_width:36, prepared_height:64, prepared_duration_seconds:1,
     reported_fps:"24/1", reported_duration_seconds:3,
     start_seconds:1,seconds_limit:1},
  ],
  note:"Prepared clips were transcoded from local footage, not AI-generated.",
};
const selected=[{name:"clip-01.mp4",sha256:"b".repeat(64),size:150},
                {name:"clip-02.mp4",sha256:"d".repeat(64),size:200}];

test("local phone-footage conversion command uses only fixed safe paths and bounded numbers", () => {
  assert.equal(phonePreparationCommand(),
    "python gpu-worker/prepare_video_sources.py --input ./phone-clips --output ./local-video-media --start-seconds 0 --seconds 30");
  assert.match(phonePreparationCommand(15,40),/--start-seconds 15 --seconds 40$/);
  for (const args of [[-1,10],[300,10],[0,0],[0,61],[1.5,10],["0;evil",10],[true,30],[0,NaN]]) {
    assert.throws(() => phonePreparationCommand(...args), /whole-number/);
  }
});

test("parse real shape of CPU preparation report with portrait, MOV, MP4 and 16fps metadata", () => {
  const copy=readPhonePreparationReport(JSON.stringify(sample));
  assert.deepEqual(copy,sample);
  assert.equal(copy.clips[0].reported_fps,"30/1");
  assert.equal(copy.clips[1].reported_fps,"24/1");
  assert.equal(copy.clips[1].prepared_width,36);
  assert.equal(copy.model_generation,false);
});

test("verify exact selected converted MP4 SHA-256 and byte sizes; partial sets are explicit", () => {
  const report=readPhonePreparationReport(JSON.stringify(sample));
  assert.deepEqual(checkPreparedVideoSelection(report,selected),
    {verifiedSelectedClips:2,receiptClips:2,complete:true,
     interpretation:"Byte hashes match this local self-reported transcode manifest; not signed provenance."});
  const partial=checkPreparedVideoSelection(report,[selected[0]]);
  assert.equal(partial.verifiedSelectedClips,1);
  assert.equal(partial.complete,false);
  for(const files of [
    [{...selected[0],sha256:"0".repeat(64)}],
    [{...selected[0],size:149}],
    [{...selected[0],name:"other.mp4"}],
  ]) assert.throws(()=>checkPreparedVideoSelection(report,files),/not listed|do not match/);
  assert.throws(()=>checkPreparedVideoSelection(report,[]),/Select converted/);
});

test("reject corrupted, oversized, unknown, or AI-generation-labelled reports", () => {
  for(const invalid of [
    "{", null, JSON.stringify({}),
    JSON.stringify({...sample,model_generation:true}),
    JSON.stringify({...sample,source_count:3}),
    JSON.stringify({...sample,clips:[]}),
    JSON.stringify({...sample,version:2}),
    JSON.stringify({...sample,kind:"AI text-to-video"}),
    " ".repeat(MAX_PREP_REPORT_BYTES+1),
  ]) assert.throws(()=>readPhonePreparationReport(invalid));
});

test("reject forged conversion paths, hashes, frame rates, durations and dimensions", () => {
  const tests=[
    r=>{r.clips[0].source_filename="../phone.mov";},
    r=>{r.clips[0].source_filename="https://file.mov";},
    r=>{r.clips[0].prepared_filename="something.mp4";},
    r=>{r.clips[0].prepared_sha256="not-a-digest";},
    r=>{r.clips[0].source_sha256="A".repeat(64);},
    r=>{r.clips[0].prepared_fps="30/1";},
    r=>{r.clips[0].prepared_frames=961;},
    r=>{r.clips[0].prepared_frames=45;},
    r=>{r.clips[0].prepared_duration_seconds=2.1;},
    r=>{r.clips[0].prepared_width=63;},
    r=>{r.clips[0].prepared_width=1024;},
    r=>{r.clips[0].prepared_height=0;},
    r=>{r.clips[0].prepared_bytes=-1;},
    r=>{r.clips[0].seconds_limit=61;},
    r=>{r.clips[0].start_seconds=300;},
    r=>{r.clips[1].source_filename=r.clips[0].source_filename;},
  ];
  for (const change of tests) {
    const report=structuredClone(sample);
    change(report);
    assert.throws(()=>readPhonePreparationReport(JSON.stringify(report)));
  }
});

test("AI Video Studio actually mounts local normalizer without remote requests or fake AI output", () => {
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const component=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  assert.match(parent,/<LocalVideoImportPrep sources=\{sources\}/);
  assert.match(component,/phonePreparationCommand/);
  assert.match(component,/readPhonePreparationReport/);
  assert.match(component,/checkPreparedVideoSelection/);
  assert.match(component,/Copy CPU preparation command/);
  assert.match(component,/local-video-media/);
  assert.match(component,/No cloud uploads or paid GPU/);
  assert.doesNotMatch(component,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
