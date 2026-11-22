import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  V2_LIMITS,spatiotemporalTrainCommand,spatiotemporalGenerateCommand,
  spatiotemporalOutputPaths,readSpatiotemporalTrainingReport,
  matchSpatiotemporalCheckpoint,readSpatiotemporalGenerationReport,
  matchSpatiotemporalVideo,
} from "../src/lib/ai/spatiotemporalNeuralVideo.mjs";

const hash="a".repeat(64), hash2="b".repeat(64);
const metrics={
  training_examples:520,holdout_examples:200,training_mse_before:0.15,
  training_mse_after:0.12,one_step_holdout_mse:0.13,
  one_step_persistence_mse:0.04,four_step_rollout_mse:0.2,
  four_step_static_baseline_mse:0.05,rollout_evaluated_pixels:5376,
  interpretation:"Observed pixel MSE, not photorealism.",
};
const training={
  version:2,kind:"cpu_neural_spatiotemporal_training",
  neural_network:true,text_to_video:false,model_sha256:hash,
  architecture:{type:"two_frame_neighborhood_mlp",
    inputs:24,hidden:16,outputs:3,activations:["tanh","sigmoid"]},
  width:48,height:28,fps:16,seed:42,epochs:2,
  training_source_count:1,training_sources:[{
    file:"owner-video.mp4",sha256:hash2,rights_ref:"reviewed-original",
    decoded_frames:20,used_frames:20,train_frames:15,holdout_frames:5,
  }],metrics,
};
const generation={
  version:2,kind:"cpu_neural_spatiotemporal_sample",
  neural_network:true,text_to_video:false,model_generation:true,
  model_sha256:hash,fps:16,width:48,height:28,seconds:2,
  sample_seed:42,profile:"landscape",quality:"standard",
  stability_percent:45,variation_percent:6,
  raw_frames_sha256:hash,sample_clip_sha256:hash2,
  final_mp4_sha256:hash2,storyboard_sha256:hash,
  temporal_metrics:{frame_count:32,mean_adjacent_rgb_delta:0.16,
    max_adjacent_rgb_delta:0.35,identical_adjacent_pairs:0,
    interpretation:"Raw frame differences only."},
  holdout_evaluation:metrics,training_source_sha256:[hash2],
};

test("real CPU v2 train/generate commands use bounded shell-safe arguments",()=>{
  assert.equal(spatiotemporalTrainCommand(),
    "python gpu-worker/train_spatiotemporal_neural_video.py train --input ./local-video-media --output ./eternyx-neural-v2-model --rights-ref owner-reviewed-video --seed 42 --epochs 2");
  assert.equal(spatiotemporalGenerateCommand({seconds:3,seed:7,profile:"portrait",
    quality:"high",stability:70,variation:2}),
    "python gpu-worker/train_spatiotemporal_neural_video.py generate --model ./eternyx-neural-v2-model/model.json --output ./eternyx-neural-v2-video --seconds 3 --seed 7 --profile portrait --quality high --stability 70 --variation 2");
  for(const rightsRef of ["","x;curl","unsafe space","$(cat /etc/passwd)","x\n",true]){
    assert.throws(()=>spatiotemporalTrainCommand({rightsRef}),/rights reference/);
  }
  for(const epochs of [0,5,true,1.2,"3",null]){
    assert.throws(()=>spatiotemporalTrainCommand({epochs}),/epochs/);
  }
  for(const seconds of [0,9,1.2,true,"2"]){
    assert.throws(()=>spatiotemporalGenerateCommand({seconds}),/seconds/);
  }
  for(const stability of [-1,86,1.4,true,"12"]){
    assert.throws(()=>spatiotemporalGenerateCommand({stability}),/stability/);
  }
  for(const variation of [-1,21,1.4,true,"2"]){
    assert.throws(()=>spatiotemporalGenerateCommand({variation}),/variation/);
  }
  for(const profile of ["wide;ls","diffusion",null]){
    assert.throws(()=>spatiotemporalGenerateCommand({profile}),/preset/);
  }
  assert.doesNotMatch(spatiotemporalGenerateCommand(),/https?:\/\/|curl|API_KEY|cuda/);
});

test("parse v2 genuine 48x28 two-frame neural architecture and measured rollout report",()=>{
  const parsed=readSpatiotemporalTrainingReport(JSON.stringify(training));
  assert.deepEqual(parsed,training);
  const checked=matchSpatiotemporalCheckpoint(parsed,{
    name:"model.json",size:8192,sha256:hash});
  assert.equal(checked.matched,true);
  assert.equal(checked.oneStep,0.13);
  assert.equal(checked.oneStepBaseline,0.04);
  assert.equal(checked.rollout,0.2);
  assert.equal(checked.rolloutBaseline,0.05);
  assert.equal(checked.sources,1);
  assert.equal(V2_LIMITS.learnedWidth*V2_LIMITS.learnedHeight,1344);
  assert.equal(V2_LIMITS.maxFrames,64);
});

test("v2 report rejects invented architectures, provenance and evaluation scores",()=>{
  const mutations=[
    r=>{r.version=1;},
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.architecture.inputs=12;},
    r=>{r.architecture.hidden=20;},
    r=>{r.width=32;},
    r=>{r.height=18;},
    r=>{r.fps=30;},
    r=>{r.model_sha256="invalid";},
    r=>{r.training_source_count=2;},
    r=>{r.training_sources[0].file="../private.mp4";},
    r=>{r.training_sources[0].sha256="invalid";},
    r=>{r.training_sources[0].rights_ref="";},
    r=>{r.training_sources[0].used_frames=100;},
    r=>{r.training_sources[0].holdout_frames=0;},
    r=>{r.training_sources[0].train_frames=1;},
    r=>{r.metrics.four_step_rollout_mse=-1;},
    r=>{r.metrics.one_step_holdout_mse="0.1";},
    r=>{r.metrics.training_examples=0;},
    r=>{r.metrics.rollout_evaluated_pixels=0;},
  ];
  for(const change of mutations){
    const payload=structuredClone(training);
    change(payload);
    assert.throws(()=>readSpatiotemporalTrainingReport(JSON.stringify(payload)));
  }
  for(const bad of [null,"{","[]"," ".repeat(V2_LIMITS.maxReportBytes+1)])
    assert.throws(()=>readSpatiotemporalTrainingReport(bad));
});

test("training model must agree with selected actual local SHA256 bytes",()=>{
  const parsed=readSpatiotemporalTrainingReport(JSON.stringify(training));
  for(const file of [
    {name:"model.json",size:5000,sha256:hash2},
    {name:"model.json",size:0,sha256:hash},
    {name:"other.json",size:5000,sha256:hash},
    {name:"model.json",size:V2_LIMITS.maxModelBytes+1,sha256:hash},
  ])assert.throws(()=>matchSpatiotemporalCheckpoint(parsed,file),/SHA-256/);
});

test("parse real v2 sample receipt with explicit non-photorealistic output provenance",()=>{
  const parsed=readSpatiotemporalGenerationReport(JSON.stringify(generation));
  assert.deepEqual(parsed,generation);
  assert.equal(parsed.temporal_metrics.frame_count,32);
  assert.equal(parsed.holdout_evaluation.four_step_rollout_mse,0.2);
  assert.equal(matchSpatiotemporalVideo(parsed,{
    name:"video.mp4",size:17632,sha256:hash2}).frames,32);
});

test("sample receipt rejects false frame count, fake hashes and claimed text-to-video",()=>{
  const bad=[
    r=>{r.text_to_video=true;},
    r=>{r.neural_network=false;},
    r=>{r.model_generation=false;},
    r=>{r.version=1;},
    r=>{r.kind="fake";},
    r=>{r.raw_frames_sha256="INVALID";},
    r=>{r.width=32;},
    r=>{r.height=18;},
    r=>{r.seconds=9;},
    r=>{r.temporal_metrics.frame_count=31;},
    r=>{r.temporal_metrics.mean_adjacent_rgb_delta=-1;},
    r=>{r.temporal_metrics.max_adjacent_rgb_delta=0.001;},
    r=>{r.temporal_metrics.identical_adjacent_pairs=32;},
    r=>{r.stability_percent=90;},
    r=>{r.variation_percent=21;},
  ];
  for(const change of bad){
    const payload=structuredClone(generation);change(payload);
    assert.throws(()=>readSpatiotemporalGenerationReport(JSON.stringify(payload)));
  }
  for(const file of [
    {name:"video.mp4",size:17632,sha256:hash},
    {name:"other.mp4",size:17632,sha256:hash2},
    {name:"video.mp4",size:0,sha256:hash2},
  ])assert.throws(()=>matchSpatiotemporalVideo(generation,file),/SHA-256/);
});

test("studio mounts real two-frame creator, local file verification and MP4 preview",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/SpatiotemporalNeuralStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<SpatiotemporalNeuralStudio \/>/);
  assert.match(ui,/spatiotemporalTrainCommand/);
  assert.match(ui,/spatiotemporalGenerateCommand/);
  assert.match(ui,/matchSpatiotemporalCheckpoint/);
  assert.match(ui,/matchSpatiotemporalVideo/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video controls playsInline/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/Four-step causal rollout MSE/);
  assert.match(ui,/not.*text-to-video|No text conditioning/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob|paid API/);
});

test("new v2 output paths are explicit, local and distinct from v1",()=>{
  assert.deepEqual(spatiotemporalOutputPaths(),{
    checkpoint:"eternyx-neural-v2-model/model.json",
    trainingReport:"eternyx-neural-v2-model/training-report.json",
    sourceClip:"eternyx-neural-v2-video/clip-01.mp4",
    finishedMp4:"eternyx-neural-v2-video/render/video.mp4",
    renderManifest:"eternyx-neural-v2-video/render/manifest.json",
    generationReport:"eternyx-neural-v2-video/generation-report.json",
  });
});
