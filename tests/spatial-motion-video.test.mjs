import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  SPATIAL_MOTION_LIMITS,trainSpatialMotionCommand,
  generateSpatialMotionCommand,compareSpatialMotionCommand,spatialMotionPaths,
  readSpatialMotionTraining,readSpatialMotionGeneration,
  readSpatialMotionComparison,matchSpatialMotionModel,matchSpatialMotionVideo,
} from "../src/lib/ai/spatialMotionVideo.mjs";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const loss=()=>({
  training_observations:264,training_ce_before:2.19722458,
  training_ce_after:1.23456789,
  training_accuracy_before:0.2,training_accuracy_after:0.75,
  source_count:1,
  heldout:{
    observations:96,free_running_motion_cross_entropy:1.5,
    free_running_shift_accuracy:0.55,
    predicted_warp_frame_mae:0.12,zero_shift_frame_mae:0.15,
  },
});
const training={
  version:1,kind:"cpu_tagged_spatial_motion_training",
  neural_motion_classifier:true,text_to_video:false,
  base_model_sha256:a,tag_model_sha256:b,motion_model_sha256:c,
  architecture:"4x3_tiles_9_motion_classes_4_features_softmax",
  tags:["cool","warm"],
  source_files:[
    {file:"sunrise.mp4",tag:"warm",sha256:a,train_frames:24,holdout_frames:8},
    {file:"ocean.mp4",tag:"cool",sha256:b,train_frames:24,holdout_frames:8},
  ],
  metrics:{warm:loss(),cool:loss()},
  training_seconds:2.5,
};
const sample={
  version:1,kind:"cpu_tagged_spatial_motion_sample",
  neural_motion_classifier:true,text_to_video:false,
  base_model_sha256:a,tag_model_sha256:b,motion_model_sha256:c,
  tag:"warm",seconds:2,seed:42,fps:16,width:48,height:28,
  motion_strength_percent:75,motion_sampling:"argmax",
  stability_percent:45,variation_percent:6,
  profile:"landscape",quality:"standard",
  raw_rgb_sha256:a,source_clip_sha256:b,video_sha256:c,
  video_bytes:18941,frame_count:32,
  temporal_diagnostics:{
    frame_count:32,mean_adjacent_rgb_delta:0.1,
    max_adjacent_rgb_delta:0.27,identical_adjacent_pairs:0,
  },
};
const comparison={
  version:1,kind:"cpu_tagged_spatial_motion_comparison",
  neural_motion_classifier:true,text_to_video:false,
  base_model_sha256:a,tag_model_sha256:b,motion_model_sha256:c,
  tags:["warm","cool"],seconds:1,seed:42,motion_strength_percent:75,
  candidates:[
    {tag:"warm",file:"candidate-01/render/video.mp4",
      sha256:a,raw_rgb_sha256:b,video_bytes:14000,frame_count:16},
    {tag:"cool",file:"candidate-02/render/video.mp4",
      sha256:b,raw_rgb_sha256:a,video_bytes:14001,frame_count:16},
  ],
  comparison:{file:"comparison.mp4",sha256:c,
    video_bytes:25000,width:512,height:144,frame_count:16},
};

test("strict shell-safe CPU motion train/generate/compare commands",()=>{
  assert.equal(trainSpatialMotionCommand(),
    "python gpu-worker/learn_tagged_spatial_motion.py train --base ./eternyx-neural-v2-model/model.json --tag-model ./eternyx-neural-style-tags/tag-model.json --input ./local-video-media --output ./eternyx-neural-spatial-motion --epochs 2 --seed 42");
  assert.equal(generateSpatialMotionCommand({tag:"warm",seconds:2,seed:42,strength:75}),
    "python gpu-worker/learn_tagged_spatial_motion.py generate --base ./eternyx-neural-v2-model/model.json --tag-model ./eternyx-neural-style-tags/tag-model.json --motion-model ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-spatial-motion-video --tag warm --seconds 2 --seed 42 --strength 75 --stability 45 --variation 6 --profile landscape --quality standard");
  assert.match(generateSpatialMotionCommand({
    tag:"cool",seededMotion:true,profile:"portrait",quality:"high"}),
    /--seeded-motion --profile portrait --quality high$/);
  assert.equal(compareSpatialMotionCommand(),
    "python gpu-worker/learn_tagged_spatial_motion.py compare --base ./eternyx-neural-v2-model/model.json --tag-model ./eternyx-neural-style-tags/tag-model.json --motion-model ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-spatial-motion-compare --first warm --second cool --seconds 1 --seed 42 --strength 75");
  for(const options of [
    {tag:"Bad Label"},{tag:"warm;whoami"},{seconds:0},{seconds:4},
    {strength:-1},{strength:101},{stability:86},{variation:21},
    {seed:-1},{seed:2147483648},{seededMotion:"yes"},
    {profile:"mp4;curl"},{quality:"unknown"},
  ])assert.throws(()=>generateSpatialMotionCommand(options));
  for(const options of [{first:"same",second:"same"},
                        {first:"xx;echo",second:"cool"},
                        {strength:101},{seconds:4}])
    assert.throws(()=>compareSpatialMotionCommand(options));
  for(const options of [{epochs:0},{epochs:5},{epochs:true},{seed:-1},{seed:true}])
    assert.throws(()=>trainSpatialMotionCommand(options));
  assert.doesNotMatch(trainSpatialMotionCommand(),/curl|https?:\/\/|API_KEY|cuda/);
});

test("genuine locally trained 4x3 motion classifier report with measured unseen motion passes",()=>{
  const parsed=readSpatialMotionTraining(JSON.stringify(training));
  assert.deepEqual(parsed,training);
  assert.equal(parsed.architecture,"4x3_tiles_9_motion_classes_4_features_softmax");
  assert.equal(parsed.metrics.warm.heldout.predicted_warp_frame_mae,0.12);
  assert.equal(parsed.metrics.warm.heldout.zero_shift_frame_mae,0.15);
  assert.equal(matchSpatialMotionModel(parsed,{
    name:"motion-model.json",size:40000,sha256:c}).matched,true);
  for(const file of [
    {name:"model.json",size:40000,sha256:c},
    {name:"motion-model.json",size:40000,sha256:a},
    {name:"motion-model.json",size:0,sha256:c},
    {name:"motion-model.json",size:SPATIAL_MOTION_LIMITS.modelBytes+1,sha256:c},
  ])assert.throws(()=>matchSpatialMotionModel(parsed,file));
});

test("fail closed on changed source rights/splits and fabricated motion metrics",()=>{
  const invalid=[
    r=>{r.kind="fake_text_to_video";},
    r=>{r.neural_motion_classifier=false;},
    r=>{r.text_to_video=true;},
    r=>{r.base_model_sha256="INVALID";},
    r=>{r.tag_model_sha256="INVALID";},
    r=>{r.motion_model_sha256="INVALID";},
    r=>{r.tags=["warm","warm"];},
    r=>{r.architecture="static-preset";},
    r=>{r.source_files[0].file="../private.mp4";},
    r=>{r.source_files[0].sha256="BAD";},
    r=>{r.source_files[0].tag="untrained";},
    r=>{r.source_files[0].train_frames=17;},
    r=>{r.source_files[0].holdout_frames=0;},
    r=>{r.metrics.warm.training_observations=0;},
    r=>{r.metrics.warm.training_ce_before=-1;},
    r=>{r.metrics.warm.training_accuracy_after=2;},
    r=>{r.metrics.warm.heldout.observations=0;},
    r=>{r.metrics.cool.heldout.free_running_shift_accuracy=2;},
    r=>{r.metrics.cool.heldout.predicted_warp_frame_mae=-1;},
    r=>{r.metrics.cool.source_count=2;},
    r=>{r.training_seconds=-1;},
  ];
  for(const change of invalid){
    const data=structuredClone(training);change(data);
    assert.throws(()=>readSpatialMotionTraining(JSON.stringify(data)));
  }
});

test("parse genuine spatial H264 origin and reject misleading neural claims",()=>{
  const parsed=readSpatialMotionGeneration(JSON.stringify(sample));
  assert.deepEqual(parsed,sample);
  assert.equal(parsed.motion_sampling,"argmax");
  assert.equal(parsed.frame_count,32);
  assert.equal(matchSpatialMotionVideo(parsed,{
    name:"video.mp4",size:18941,sha256:c}).kind,"warm");
  const bad=[
    r=>{r.neural_motion_classifier=false;},
    r=>{r.text_to_video=true;},
    r=>{r.fps=30;},
    r=>{r.width=32;},
    r=>{r.height=18;},
    r=>{r.tag="BAD";},
    r=>{r.motion_strength_percent=101;},
    r=>{r.motion_sampling="diffusion";},
    r=>{r.stability_percent=90;},
    r=>{r.variation_percent=-1;},
    r=>{r.raw_rgb_sha256="BAD";},
    r=>{r.video_sha256="BAD";},
    r=>{r.video_bytes=0;},
    r=>{r.temporal_diagnostics.frame_count=10;},
    r=>{r.temporal_diagnostics.mean_adjacent_rgb_delta=-1;},
    r=>{r.temporal_diagnostics.identical_adjacent_pairs=32;},
  ];
  for(const change of bad){
    const item=structuredClone(sample);change(item);
    assert.throws(()=>readSpatialMotionGeneration(JSON.stringify(item)));
  }
});

test("parse real two trained tags and verify actual distinct MP4 bytes",()=>{
  const parsed=readSpatialMotionComparison(JSON.stringify(comparison));
  assert.deepEqual(parsed,comparison);
  assert.equal(matchSpatialMotionVideo(parsed,{
    name:"video.mp4",size:14000,sha256:a}).kind,"warm");
  assert.equal(matchSpatialMotionVideo(parsed,{
    name:"video.mp4",size:14001,sha256:b}).kind,"cool");
  assert.equal(matchSpatialMotionVideo(parsed,{
    name:"comparison.mp4",size:25000,sha256:c}).kind,"comparison");
  for(const file of [
    {name:"comparison.mp4",size:25001,sha256:c},
    {name:"video.mp4",size:14000,sha256:b},
    {name:"video.mp4",size:14000,sha256:"INVALID"},
    {name:"video.mp4",size:0,sha256:a},
  ])assert.throws(()=>matchSpatialMotionVideo(parsed,file));
});

test("reject forged comparison motion labels and malformed H264 provenance",()=>{
  const changes=[
    r=>{r.kind="fake";},
    r=>{r.text_to_video=true;},
    r=>{r.neural_motion_classifier=false;},
    r=>{r.tags=["warm","warm"];},
    r=>{r.tags=["Warm","cool"];},
    r=>{r.seed=-1;},
    r=>{r.seconds=4;},
    r=>{r.motion_strength_percent=110;},
    r=>{r.candidates[0].tag="unknown";},
    r=>{r.candidates[0].file="../video.mp4";},
    r=>{r.candidates[0].raw_rgb_sha256="BAD";},
    r=>{r.candidates[0].frame_count=12;},
    r=>{r.candidates[0].video_bytes=0;},
    r=>{r.comparison.width=256;},
    r=>{r.comparison.height=288;},
    r=>{r.comparison.frame_count=8;},
    r=>{r.comparison.video_bytes=0;},
  ];
  for(const change of changes){
    const item=structuredClone(comparison);change(item);
    assert.throws(()=>readSpatialMotionComparison(JSON.stringify(item)));
  }
  for(const raw of [null,"{","[]"," ".repeat(65537)]){
    assert.throws(()=>readSpatialMotionComparison(raw));
  }
});

test("Studio mounts verified real-motion learning, adjustable strength and local 3-MP4 playback",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/TaggedSpatialMotionStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<TaggedSpatialMotionStudio \/>/);
  assert.match(ui,/trainSpatialMotionCommand/);
  assert.match(ui,/generateSpatialMotionCommand/);
  assert.match(ui,/compareSpatialMotionCommand/);
  assert.match(ui,/readSpatialMotionTraining/);
  assert.match(ui,/matchSpatialMotionVideo/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/zero-shift|zero-motion baseline/i);
  assert.match(ui,/not dense optical flow or realistic text-to-video/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("all motion outputs remain explicit local create-only paths",()=>{
  assert.deepEqual(spatialMotionPaths(),{
    model:"eternyx-neural-spatial-motion/motion-model.json",
    training:"eternyx-neural-spatial-motion/training-report.json",
    video:"eternyx-spatial-motion-video/render/video.mp4",
    generation:"eternyx-spatial-motion-video/generation-report.json",
    comparison:"eternyx-spatial-motion-compare/comparison.mp4",
    comparisonReport:"eternyx-spatial-motion-compare/comparison-report.json",
  });
});
