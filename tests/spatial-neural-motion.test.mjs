import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  SPATIAL_MOTION_LIMITS,spatialMotionTrainCommand,spatialMotionGenerateCommand,
  spatialMotionCompareCommand,spatialMotionPaths,readSpatialMotionTraining,
  matchSpatialMotionModel,readSpatialMotionComparison,matchSpatialMotionVideo,
} from "../src/lib/ai/spatialMotionVideo.mjs";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const metric=()=>({
  train_cross_entropy_before:2.4,train_cross_entropy_after:1.95,
  training_tiles:300,source_count:1,
  heldout:{
    evaluated_tiles:96,cross_entropy:1.75,
    classifier_accuracy:.4,stationary_baseline_accuracy:.5,
    training_majority_baseline_accuracy:.51,
  },
});
const training={
  version:1,kind:"cpu_neural_tag_motion_training",
  neural_network:true,text_to_video:false,
  base_model_sha256:a,tag_model_sha256:b,motion_model_sha256:c,
  labels:["cool","warm"],epochs:2,seed:42,training_seconds:3.3,
  metrics:{cool:metric(),warm:metric()},
  source_sha256_by_tag:{cool:[a],warm:[b]},
};
const comparison={
  version:1,kind:"cpu_neural_spatial_motion_comparison",
  neural_network:true,text_to_video:false,
  tag:"cool",base_model_sha256:a,tag_model_sha256:b,
  motion_model_sha256:c,seconds:1,seed:42,strength:85,
  artifacts:{
    global:{file:"global-motion/render/video.mp4",sha256:a,
      video_bytes:14000,frame_count:16},
    spatial:{file:"spatial-motion/render/video.mp4",sha256:b,
      video_bytes:15000,frame_count:16},
    comparison:{file:"comparison.mp4",sha256:c,video_bytes:29000,
      width:512,height:144,frame_count:16},
  },
};

test("local learned spatial motion CLI commands are bounded, shell safe and CPU-only",()=>{
  assert.equal(spatialMotionTrainCommand(),
    "python gpu-worker/train_spatial_motion_video.py train --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --input ./local-video-media --output ./eternyx-neural-spatial-motion --epochs 2 --seed 42");
  assert.equal(spatialMotionGenerateCommand({tag:"river",seconds:2,seed:5,
    strength:100,stability:65,variation:3}),
    "python gpu-worker/train_spatial_motion_video.py generate --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --motion ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-neural-spatial-video --tag river --seconds 2 --seed 5 --strength 100 --stability 65 --variation 3");
  assert.equal(spatialMotionCompareCommand({tag:"river",seconds:1,seed:13,strength:70}),
    "python gpu-worker/train_spatial_motion_video.py compare --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --motion ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-neural-spatial-comparison --tag river --seconds 1 --seed 13 --strength 70");
  for(const tag of ["../home","river;ls","Cold","",true]){
    assert.throws(()=>spatialMotionGenerateCommand({tag}),/trained lowercase/);
    assert.throws(()=>spatialMotionCompareCommand({tag}),/trained lowercase/);
  }
  for(const [key,vals] of Object.entries({
    epochs:[0,5,true,"2"],seed:[-1,2147483648,true,"12"],
    seconds:[0,3,true,"1"],strength:[-1,101,true,"85"],
    stability:[-1,86],variation:[-1,21],
  })){
    for(const v of vals){
      const fn=key==="epochs"?spatialMotionTrainCommand:spatialMotionGenerateCommand;
      assert.throws(()=>fn({[key]:v}));
    }
  }
  assert.doesNotMatch(spatialMotionTrainCommand(),/curl|https?:\/\/|CUDA|api_key/);
});

test("read real local motion training metrics, including bad neural results vs baselines",()=>{
  const parsed=readSpatialMotionTraining(JSON.stringify(training));
  assert.deepEqual(parsed,training);
  assert.equal(parsed.metrics.cool.heldout.classifier_accuracy,0.4);
  assert.ok(parsed.metrics.cool.heldout.classifier_accuracy<
             parsed.metrics.cool.heldout.stationary_baseline_accuracy);
  assert.equal(matchSpatialMotionModel(parsed,{
    name:"motion-model.json",size:20000,sha256:c}).matched,true);
  for(const file of [
    {name:"model.json",size:20000,sha256:c},
    {name:"motion-model.json",size:0,sha256:c},
    {name:"motion-model.json",size:20000,sha256:a},
    {name:"motion-model.json",size:SPATIAL_MOTION_LIMITS.modelBytes+1,sha256:c},
  ])assert.throws(()=>matchSpatialMotionModel(parsed,file),/SHA-256/);
});

test("motion-training report rejects fake tags, missing source hashes and invented proxy scores",()=>{
  const mutations=[
    r=>{r.version=2;},r=>{r.kind="fake";},
    r=>{r.neural_network=false;},r=>{r.text_to_video=true;},
    r=>{r.motion_model_sha256="INVALID";},
    r=>{r.labels=["warm","warm"];},
    r=>{r.labels=["Warm","cool"];},
    r=>{r.source_sha256_by_tag.warm=["bad"];},
    r=>{r.source_sha256_by_tag.cool=[];},
    r=>{r.metrics.cool.heldout={evaluated_tiles:0};},
    r=>{r.metrics.cool.heldout={cross_entropy:-1};},
    r=>{r.metrics.cool.heldout={classifier_accuracy:1.5};},
    r=>{r.metrics.cool.heldout={stationary_baseline_accuracy:-1};},
    r=>{r.metrics.cool.heldout={training_majority_baseline_accuracy:"0.5"};},
    r=>{r.metrics.cool.training_tiles=0;},
    r=>{r.metrics.cool.source_count=2;},
    r=>{r.epochs=5;},r=>{r.seed=-1;},r=>{r.training_seconds=-1;},
  ];
  for(const [index,edit] of mutations.entries()){
    const bad=structuredClone(training);edit(bad);
    assert.throws(()=>readSpatialMotionTraining(JSON.stringify(bad)),
      undefined,"Invalid motion training fixture #"+index+" must be rejected");
  }
  for(const raw of ["{","[]",null," ".repeat(SPATIAL_MOTION_LIMITS.reportBytes+1)]){
    assert.throws(()=>readSpatialMotionTraining(raw));
  }
});

test("true original global versus learned spatial motion report keeps verified independent models",()=>{
  const r=readSpatialMotionComparison(JSON.stringify(comparison));
  assert.deepEqual(r,comparison);
  assert.equal(r.tag,"cool");
  assert.equal(r.strength,85);
  assert.equal(r.artifacts.comparison.width,512);
  assert.equal(r.artifacts.comparison.frame_count,16);
  assert.equal(matchSpatialMotionVideo(r,{
    name:"video.mp4",size:14000,sha256:a}).kind,"global");
  assert.equal(matchSpatialMotionVideo(r,{
    name:"video.mp4",size:15000,sha256:b}).kind,"spatial");
  assert.equal(matchSpatialMotionVideo(r,{
    name:"comparison.mp4",size:29000,sha256:c}).kind,"comparison");
});

test("reject fictional learned motion comparisons or forged MP4 frames and dimensions",()=>{
  const edits=[
    r=>{r.kind="fake";},r=>{r.neural_network=false;},r=>{r.text_to_video=true;},
    r=>{r.base_model_sha256="bad";},r=>{r.motion_model_sha256="bad";},
    r=>{r.tag="BAD";},r=>{r.seconds=3;},r=>{r.seed=-1;},r=>{r.strength=101;},
    r=>{r.artifacts.global.file="../video.mp4";},
    r=>{r.artifacts.global.sha256="bad";},
    r=>{r.artifacts.global.video_bytes=0;},
    r=>{r.artifacts.spatial.frame_count=32;},
    r=>{r.artifacts.comparison.width=256;},
    r=>{r.artifacts.comparison.height=288;},
    r=>{r.artifacts.comparison.frame_count=20;},
    r=>{r.artifacts.comparison.video_bytes=0;},
  ];
  for(const edit of edits){
    const bad=structuredClone(comparison);edit(bad);
    assert.throws(()=>readSpatialMotionComparison(JSON.stringify(bad)));
  }
  for(const file of [
    {name:"video.mp4",size:14000,sha256:b},
    {name:"comparison.mp4",size:14000,sha256:c},
    {name:"other.mp4",size:15000,sha256:b},
    {name:"video.mp4",size:0,sha256:a},
    {name:"comparison.mp4",size:29000,sha256:"INVALID"},
  ])assert.throws(()=>matchSpatialMotionVideo(comparison,file));
});

test("existing AI Video Studio includes local learned spatial motion controls and no uploads",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/SpatialNeuralMotionStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<SpatialNeuralMotionStudio \/>/);
  assert.match(ui,/spatialMotionTrainCommand/);
  assert.match(ui,/spatialMotionGenerateCommand/);
  assert.match(ui,/spatialMotionCompareCommand/);
  assert.match(ui,/readSpatialMotionTraining/);
  assert.match(ui,/matchSpatialMotionVideo/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/Global majority baseline/);
  assert.match(ui,/not pixel-accurate|not a photorealism|not a diffusion/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("handoff paths stay distinct from previously trained neural base and tag files",()=>{
  assert.deepEqual(spatialMotionPaths(),{
    model:"eternyx-neural-spatial-motion/motion-model.json",
    training:"eternyx-neural-spatial-motion/training-report.json",
    generated:"eternyx-neural-spatial-video/render/video.mp4",
    comparison:"eternyx-neural-spatial-comparison/comparison.mp4",
    comparisonReport:"eternyx-neural-spatial-comparison/comparison-report.json",
  });
});
