import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  TAG_VIDEO_LIMITS,trainTaggedVideoCommand,generateTaggedVideoCommand,
  compareTaggedVideoCommand,taggedVideoPaths,readTaggedTrainingReport,
  matchTaggedAdapter,readTaggedComparisonReport,matchTaggedComparisonVideo,
} from "../src/lib/ai/taggedNeuralVideo.mjs";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const sources=[
  {file:"sunrise.mp4",tag:"warm"},{file:"ocean.mp4",tag:"cool"},
];
const metrics=(sourceCount=1)=>({
  train_examples:900,holdout_examples:320,
  train_mse_before:0.15,train_mse_after:0.1,
  holdout_style_mse:0.12,holdout_frozen_base_mse:0.13,
  source_count:sourceCount,
});
const training={
  version:1,kind:"cpu_neural_tag_training",neural_network:true,
  text_to_video:false,frozen_base_weights:true,
  base_model_sha256:a,tag_model_sha256:b,tags:["cool","warm"],
  file_tags:[
    {file:"sunrise.mp4",tag:"warm",sha256:a,rights_ref:"owned-video",used_frames:32,
      train_frames:24,holdout_frames:8},
    {file:"ocean.mp4",tag:"cool",sha256:c,rights_ref:"owned-video",used_frames:32,
      train_frames:24,holdout_frames:8},
  ],
  metrics:{warm:metrics(),cool:metrics()},training_seconds:2.53,
};
const comparison={
  version:1,kind:"cpu_neural_tag_comparison",neural_network:true,
  text_to_video:false,base_model_sha256:a,tag_model_sha256:b,
  tags:["warm","cool"],seed:42,seconds:1,
  candidates:[
    {tag:"warm",file:"candidate-01/render/video.mp4",sha256:a,
      raw_rgb_sha256:b,video_bytes:12001,frame_count:16},
    {tag:"cool",file:"candidate-02/render/video.mp4",sha256:b,
      raw_rgb_sha256:a,video_bytes:12002,frame_count:16},
  ],
  comparison:{file:"comparison.mp4",sha256:c,video_bytes:20000,
    width:512,height:144,frame_count:16},
};

test("two learned tags require safe exact local filenames with no shell injection",()=>{
  assert.equal(trainTaggedVideoCommand(),
    "python gpu-worker/train_tagged_neural_video.py train --base ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-style-tags --file-tag sunrise.mp4:warm --file-tag ocean.mp4:cool --epochs 2 --seed 42");
  assert.equal(generateTaggedVideoCommand({tag:"warm",seconds:1,seed:12}),
    "python gpu-worker/train_tagged_neural_video.py generate --base ./eternyx-neural-v2-model/model.json --adapter ./eternyx-neural-style-tags/tag-model.json --output ./eternyx-neural-tag-video --tag warm --seconds 1 --seed 12 --profile landscape --quality standard --stability 45 --variation 6");
  assert.equal(compareTaggedVideoCommand(),
    "python gpu-worker/train_tagged_neural_video.py compare --base ./eternyx-neural-v2-model/model.json --adapter ./eternyx-neural-style-tags/tag-model.json --output ./eternyx-neural-tag-comparison --first-tag warm --second-tag cool --seconds 1 --seed 42");
  assert.doesNotMatch(trainTaggedVideoCommand(),/https?:\/\/|curl|api_key|CUDA/);
  for(const bad of [
    [{file:"sunrise.mp4",tag:"warm"}],
    [{file:"sunrise.mp4",tag:"warm"},{file:"sunrise.mp4",tag:"cool"}],
    [{file:"sunrise.mp4",tag:"warm"},{file:"ocean.mp4",tag:"warm"}],
    [{file:"sunrise.mp4;rm",tag:"warm"},{file:"ocean.mp4",tag:"cool"}],
    [{file:"../sunrise.mp4",tag:"warm"},{file:"ocean.mp4",tag:"cool"}],
    [{file:"sunrise.mp4",tag:"Warm"},{file:"ocean.mp4",tag:"cool"}],
  ])assert.throws(()=>trainTaggedVideoCommand({sources:bad}));
  assert.throws(()=>compareTaggedVideoCommand({firstTag:"same",secondTag:"same"}),/distinct/);
  for(const [name,inputs] of Object.entries({
    epochs:[0,5,true,"2"],seconds:[0,4,true,"1"],
    seed:[-1,2147483648,true,1.4],stability:[-1,86,true],
    variation:[-1,21,true],
  })){
    for(const value of inputs){
      const fn=["epochs","seed"].includes(name)?trainTaggedVideoCommand:generateTaggedVideoCommand;
      if(name==="seed")assert.throws(()=>fn({seed:value}));
      else assert.throws(()=>fn({[name]:value}));
    }
  }
});

test("real neural adapter SHA256 matches actual model, not an invented label catalog",()=>{
  const parsed=readTaggedTrainingReport(JSON.stringify(training));
  assert.deepEqual(parsed,training);
  assert.equal(matchTaggedAdapter(parsed,{
    name:"tag-model.json",sha256:b,size:34320}).matched,true);
  for(const file of [
    {name:"model.json",sha256:b,size:34320},
    {name:"tag-model.json",sha256:a,size:34320},
    {name:"tag-model.json",sha256:b,size:0},
    {name:"tag-model.json",sha256:b,size:TAG_VIDEO_LIMITS.modelBytes+1},
  ])assert.throws(()=>matchTaggedAdapter(parsed,file));
  assert.equal(parsed.metrics.warm.train_mse_before,0.15);
  assert.equal(parsed.metrics.cool.holdout_frozen_base_mse,0.13);
});

test("tag training evidence rejects false rights, missing sources, malformed errors or fake text-to-video",()=>{
  const edits=[
    r=>{r.kind="fake_t2v";},
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.frozen_base_weights=false;},
    r=>{r.tag_model_sha256="INVALID";},
    r=>{r.tags=["warm","warm"];},
    r=>{r.file_tags[0].file="../private.mp4";},
    r=>{r.file_tags[0].rights_ref="";},
    r=>{r.file_tags[0].sha256="bad";},
    r=>{r.file_tags[0].holdout_frames=0;},
    r=>{r.file_tags[0].used_frames=100;},
    r=>{r.metrics.warm.train_examples=0;},
    r=>{r.metrics.warm.holdout_examples=0;},
    r=>{r.metrics.warm.holdout_style_mse=-1;},
    r=>{r.metrics.cool.source_count=2;},
    r=>{r.training_seconds=-1;},
  ];
  for(const mutate of edits){
    const changed=structuredClone(training);mutate(changed);
    assert.throws(()=>readTaggedTrainingReport(JSON.stringify(changed)));
  }
  for(const raw of ["{",null,"[]"," ".repeat(TAG_VIDEO_LIMITS.reportBytes+1)]){
    assert.throws(()=>readTaggedTrainingReport(raw));
  }
});

test("parse actual same-seed two-tag comparison without assigning unreal semantic rankings",()=>{
  const parsed=readTaggedComparisonReport(JSON.stringify(comparison));
  assert.deepEqual(parsed,comparison);
  assert.equal(parsed.tags.join(","),"warm,cool");
  assert.equal(parsed.candidates[0].frame_count,16);
  assert.ok(!("photorealism_score" in parsed));
  assert.ok(!("prompt_alignment" in parsed));
  assert.deepEqual(taggedVideoPaths(),{
    model:"eternyx-neural-style-tags/tag-model.json",
    training:"eternyx-neural-style-tags/training-report.json",
    rendered:"eternyx-neural-tag-video/render/video.mp4",
    generation:"eternyx-neural-tag-video/generation-report.json",
    comparison:"eternyx-neural-tag-comparison/comparison.mp4",
    comparisonReport:"eternyx-neural-tag-comparison/comparison-report.json",
  });
});

test("real tag MP4s matched by local SHA256, correct tag and file bytes",()=>{
  const parsed=readTaggedComparisonReport(JSON.stringify(comparison));
  assert.equal(matchTaggedComparisonVideo(parsed,{
    name:"video.mp4",sha256:a,size:12001}).kind,"warm");
  assert.equal(matchTaggedComparisonVideo(parsed,{
    name:"video.mp4",sha256:b,size:12002}).kind,"cool");
  assert.equal(matchTaggedComparisonVideo(parsed,{
    name:"comparison.mp4",sha256:c,size:20000}).kind,"comparison");
  for(const file of [
    {name:"video.mp4",sha256:b,size:12001},
    {name:"comparison.mp4",sha256:a,size:20000},
    {name:"video.mp4",sha256:"BAD",size:12001},
    {name:"video.mp4",sha256:a,size:0},
    {name:"video.mp4",sha256:a,size:TAG_VIDEO_LIMITS.videoBytes+1},
  ])assert.throws(()=>matchTaggedComparisonVideo(parsed,file));
});

test("comparison receipt rejects untrained or duplicated tags and forged media details",()=>{
  const mutations=[
    r=>{r.kind="fake";},
    r=>{r.text_to_video=true;},
    r=>{r.neural_network=false;},
    r=>{r.tags=["warm","warm"];},
    r=>{r.tags=["WARM","cool"];},
    r=>{r.seconds=4;},
    r=>{r.seed=-1;},
    r=>{r.candidates[0].tag="other";},
    r=>{r.candidates[0].file="../video.mp4";},
    r=>{r.candidates[0].sha256="INVALID";},
    r=>{r.candidates[0].raw_rgb_sha256="INVALID";},
    r=>{r.candidates[0].frame_count=15;},
    r=>{r.candidates[0].video_bytes=0;},
    r=>{r.comparison.width=1024;},
    r=>{r.comparison.height=288;},
    r=>{r.comparison.video_bytes=0;},
  ];
  for(const mutate of mutations){
    const changed=structuredClone(comparison);mutate(changed);
    assert.throws(()=>readTaggedComparisonReport(JSON.stringify(changed)));
  }
});

test("Studio actually mounts tag learning, real MP4 hash verification and local media preview",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/TaggedNeuralVideoStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<TaggedNeuralVideoStudio \/>/);
  assert.match(ui,/trainTaggedVideoCommand/);
  assert.match(ui,/generateTaggedVideoCommand/);
  assert.match(ui,/compareTaggedVideoCommand/);
  assert.match(ui,/readTaggedTrainingReport/);
  assert.match(ui,/matchTaggedComparisonVideo/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/not natural-language prompts/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
