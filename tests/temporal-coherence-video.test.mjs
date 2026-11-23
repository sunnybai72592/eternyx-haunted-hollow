import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  COHERENCE_LIMITS,temporalCoherenceCommand,temporalCoherencePaths,
  readTemporalCoherenceReport,matchTemporalCoherenceFile,
} from "../src/lib/ai/temporalCoherenceVideo.mjs";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const metric=(steps,mae,jitter=0.1,spatial=0.2)=>({
  steps,observations:steps*12,predicted_warp_mae:mae,
  zero_shift_mae:0.14,shift_accuracy:0.5,
  temporal_jitter:jitter,spatial_disagreement:spatial,
  selection_objective:Number((mae+.02*jitter+.01*spatial).toFixed(8)),
});
const receipt={
  version:1,kind:"cpu_neural_tagged_temporal_coherence_audit",
  neural_motion_classifier:true,text_to_video:false,
  tag:"warm",base_model_sha256:a,tag_model_sha256:b,
  motion_model_sha256:c,selection_profile_sha256:b,
  source_sha256:[a],
  selection:{
    tag:"warm",selected_temporal_percent:25,selected_neighbor_percent:25,
    baseline_allowed:true,inner_steps:4,training_only_selection:true,
    split_provenance:[{
      source_sha256:a,inner_training_end:18,
      inner_validation_start:18,inner_validation_end_exclusive:22,
      outer_holdout_start:24,
    }],
    candidates:[
      {temporal_percent:0,neighbor_percent:0,inner:metric(4,.11,.4,.5)},
      {temporal_percent:25,neighbor_percent:25,inner:metric(4,.10,.2,.2)},
      {temporal_percent:50,neighbor_percent:25,inner:metric(4,.114,.10,.10)},
      {temporal_percent:25,neighbor_percent:50,inner:metric(4,.12,.01,.01)},
    ],
    objective:{
      warp_mae_coefficient:1,temporal_jitter_coefficient:.02,
      spatial_disagreement_coefficient:.01,
      constraint:"Inner warp MAE must not exceed unchanged baseline by more than 1e-8.",
    },
  },
  final_outer_audit:{
    steps:[1,4,8],no_outer_selection:true,
    baseline:{"1":metric(1,.13,.2,.3),
              "4":metric(4,.16,.3,.3),
              "8":metric(8,.17,.4,.4)},
    selected:{"1":metric(1,.13,.1,.2),
              "4":metric(4,.165,.1,.2),
              "8":metric(8,.18,.12,.2)},
  },
  cpu_selection_seconds:1.2,cpu_render_seconds:2.5,
  sampling:{seconds:1,seed:42,strength:75,stability:45,variation:6},
  artifacts:{
    baseline:{file:"baseline/render/video.mp4",sha256:a,
      video_bytes:10001,frame_count:16,raw_rgb_sha256:b},
    coherent:{file:"coherent/render/video.mp4",sha256:b,
      video_bytes:10002,frame_count:16,raw_rgb_sha256:c},
    comparison:{file:"comparison.mp4",sha256:c,video_bytes:20003,
      width:512,height:144,frame_count:16},
  },
};

test("CPU coherence command is bounded, inert and reproducible",()=>{
  assert.equal(temporalCoherenceCommand(),
    "python gpu-worker/select_temporal_coherence.py --base ./eternyx-neural-v2-model/model.json --tag-model ./eternyx-neural-style-tags/tag-model.json --motion-model ./eternyx-neural-spatial-motion/motion-model.json --input ./local-video-media --output ./eternyx-neural-temporal-coherence --tag warm --seconds 1 --seed 42 --strength 75 --stability 45 --variation 6");
  assert.match(temporalCoherenceCommand({tag:"cool",seed:31,seconds:2,
    strength:25,stability:70,variation:10}),
    /--tag cool --seconds 2 --seed 31 --strength 25 --stability 70 --variation 10$/);
  for(const options of [{tag:"bad tag"},{tag:"hi;cat"},{tag:"Upper"},
    {tag:"../unsafe"},{seconds:0},{seconds:4},{seconds:true},
    {seed:-1},{seed:2147483648},{seed:true},
    {strength:-1},{strength:101},{stability:86},{variation:21}]){
    assert.throws(()=>temporalCoherenceCommand(options));
  }
  assert.doesNotMatch(temporalCoherenceCommand(),/https?:\/\/|curl|api_key|cuda/);
});

test("real four-candidate training-prefix selector and adverse final holdout report are unchanged",()=>{
  const parsed=readTemporalCoherenceReport(JSON.stringify(receipt));
  assert.deepEqual(parsed,receipt);
  assert.equal(parsed.selection.selected_temporal_percent,25);
  assert.equal(parsed.selection.selected_neighbor_percent,25);
  assert.equal(parsed.selection.split_provenance[0].inner_validation_end_exclusive,22);
  assert.equal(parsed.selection.split_provenance[0].outer_holdout_start,24);
  assert.equal(parsed.final_outer_audit.no_outer_selection,true);
  assert.ok(parsed.final_outer_audit.selected["8"].predicted_warp_mae>
            parsed.final_outer_audit.baseline["8"].predicted_warp_mae,
            "Regression on unseen footage must remain visible.");
  assert.equal(COHERENCE_LIMITS.options.length,4);
});

test("allow honest unchanged baseline fallback when candidates cannot beat inner objective",()=>{
  const data=structuredClone(receipt);
  data.selection.candidates[1].inner=metric(4,.115,.2,.2);
  data.selection.selected_temporal_percent=0;
  data.selection.selected_neighbor_percent=0;
  assert.equal(readTemporalCoherenceReport(JSON.stringify(data)).
               selection.selected_temporal_percent,0);
  data.selection.selected_temporal_percent=25;
  assert.throws(()=>readTemporalCoherenceReport(JSON.stringify(data)));
});

test("reject any fabricated winner or inner validation boundary overlapping the outer holdout",()=>{
  const changes=[
    r=>{r.selection.training_only_selection=false;},
    r=>{r.selection.tag="unknown";},
    r=>{r.selection.selected_temporal_percent=50;},
    r=>{r.selection.selected_neighbor_percent=0;},
    r=>{r.selection.candidates[1].inner.predicted_warp_mae=.17;},
    r=>{r.selection.candidates[1].inner.selection_objective=.01;},
    r=>{r.selection.candidates[1].temporal_percent=90;},
    r=>{r.selection.candidates.pop();},
    r=>{r.selection.candidates[2].inner.zero_shift_mae=.22;},
    r=>{r.selection.split_provenance[0].inner_training_end=22;},
    r=>{r.selection.split_provenance[0].outer_holdout_start=20;},
    r=>{r.selection.inner_steps=8;},
    r=>{r.selection.objective.temporal_jitter_coefficient=.9;},
    r=>{r.selection.baseline_allowed=false;},
  ];
  for(const change of changes){
    const edited=structuredClone(receipt);change(edited);
    assert.throws(()=>readTemporalCoherenceReport(JSON.stringify(edited)));
  }
});

test("final unseen-frame metrics, source identity, model origins and timing cannot be falsified",()=>{
  const changes=[
    r=>{r.kind="diffusion";},
    r=>{r.text_to_video=true;},
    r=>{r.neural_motion_classifier=false;},
    r=>{r.source_sha256=["bad"];},
    r=>{r.source_sha256=[];},
    r=>{r.source_sha256=[a,a];},
    r=>{r.base_model_sha256="INVALID";},
    r=>{r.motion_model_sha256="INVALID";},
    r=>{r.selection_profile_sha256="INVALID";},
    r=>{r.final_outer_audit.no_outer_selection=false;},
    r=>{r.final_outer_audit.steps=[1,8];},
    r=>{r.final_outer_audit.baseline["8"].shift_accuracy=2;},
    r=>{r.final_outer_audit.selected["8"].observations=60;},
    r=>{r.final_outer_audit.selected["8"].zero_shift_mae=.20;},
    r=>{r.final_outer_audit.selected["4"].temporal_jitter=-1;},
    r=>{r.cpu_render_seconds=-1;},
    r=>{r.sampling.seconds=4;},
  ];
  for(const change of changes){
    const edited=structuredClone(receipt);change(edited);
    assert.throws(()=>readTemporalCoherenceReport(JSON.stringify(edited)));
  }
  for(const raw of [null,"{","[]"," ".repeat(COHERENCE_LIMITS.maxReportBytes+1)])
    assert.throws(()=>readTemporalCoherenceReport(raw));
});

test("selected temporal profile and actual two MP4s plus split-screen must match local SHA-256",()=>{
  const data=readTemporalCoherenceReport(JSON.stringify(receipt));
  assert.equal(matchTemporalCoherenceFile(data,{
    name:"selection-profile.json",size:12004,sha256:b}).kind,"profile");
  assert.equal(matchTemporalCoherenceFile(data,{
    name:"video.mp4",size:10001,sha256:a}).kind,"baseline");
  assert.equal(matchTemporalCoherenceFile(data,{
    name:"video.mp4",size:10002,sha256:b}).kind,"coherent");
  assert.equal(matchTemporalCoherenceFile(data,{
    name:"comparison.mp4",size:20003,sha256:c}).kind,"comparison");
  for(const row of [
    {name:"selection-profile.json",size:12004,sha256:a},
    {name:"selection-profile.json",size:0,sha256:b},
    {name:"video.mp4",size:10001,sha256:b},
    {name:"comparison.mp4",size:20000,sha256:c},
    {name:"video.mp4",size:0,sha256:a},
    {name:"video.mp4",size:COHERENCE_LIMITS.maxVideoBytes+1,sha256:a},
  ])assert.throws(()=>matchTemporalCoherenceFile(data,row));
});

test("Studio mounts executable coherence selector and WebCrypto-verified on-device H264 playback",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/TemporalCoherenceStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<TemporalCoherenceStudio \/>/);
  assert.match(ui,/temporalCoherenceCommand/);
  assert.match(ui,/readTemporalCoherenceReport/);
  assert.match(ui,/matchTemporalCoherenceFile/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/final original held-out quarter|final original held-out/i);
  assert.match(ui,/not guaranteed to look better/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("actual offline output paths remain explicitly private and separate from source media",()=>{
  assert.deepEqual(temporalCoherencePaths(),{
    report:"eternyx-neural-temporal-coherence/selection-report.json",
    profile:"eternyx-neural-temporal-coherence/selection-profile.json",
    base:"eternyx-neural-temporal-coherence/baseline/render/video.mp4",
    selected:"eternyx-neural-temporal-coherence/coherent/render/video.mp4",
    split:"eternyx-neural-temporal-coherence/comparison.mp4",
  });
});
