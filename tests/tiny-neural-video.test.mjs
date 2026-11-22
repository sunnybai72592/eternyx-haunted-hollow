import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  tinyNeuralTrainingCommand,tinyNeuralGenerateCommand,tinyNeuralOutputPaths,
  readTinyNeuralReport,verifyTinyNeuralCheckpoint,TINY_NEURAL_LIMITS,
} from "../src/lib/ai/tinyNeuralVideo.mjs";

const digest="a".repeat(64);
const report={
  version:1,kind:"cpu_tiny_neural_video_training",
  model_sha256:digest,neural_network:true,text_to_video:false,
  architecture:{type:"one_hidden_layer_autoregressive_pixel_mlp",
    inputs:12,hidden:12,outputs:3,activations:["tanh","sigmoid"]},
  training_source_count:1,seed:42,epochs:3,
  training_sources:[{
    file:"original.mp4",sha256:"b".repeat(64),rights_ref:"operator-reviewed-original",
    decoded_frames:32,used_frames:32,train_frames:24,holdout_frames:8,
  }],
  metrics:{
    train_examples:1104,holdout_examples:432,
    training_mse_before:0.12,training_mse_after:0.07,
    holdout_neural_mse:0.09,holdout_persistence_baseline_mse:0.11,
    interpretation:"Actual held-out pixel MSE.",
  },
};
const checkpoint={name:"model.json",size:11390,sha256:digest};

test("train command requires only safe shell literals and correctly bounded CPU epochs",()=>{
  assert.equal(tinyNeuralTrainingCommand(),
    "python gpu-worker/train_tiny_neural_video.py train --input ./local-video-media --output ./eternyx-tiny-neural-model --rights-ref owner-reviewed-local-video --seed 42 --epochs 3");
  assert.equal(tinyNeuralTrainingCommand({rightsRef:"owned-01",seed:17,epochs:4}).endsWith(
    "--rights-ref owned-01 --seed 17 --epochs 4"),true);
  for (const rightsRef of ["", "-bad", "abc def", "unsafe;rm", "$(echo nope)","x\n",42]) {
    assert.throws(()=>tinyNeuralTrainingCommand({rightsRef}),/rights reference/);
  }
  for(const epochs of [0,5,-1,NaN,true,"3"])assert.throws(()=>tinyNeuralTrainingCommand({epochs}),/epochs/);
  for(const seed of [-1,2147483648,true,1.1,NaN])assert.throws(()=>tinyNeuralTrainingCommand({seed}),/seed/);
});

test("generation command builds only the actual local CPU H264 pipeline",()=>{
  assert.equal(tinyNeuralGenerateCommand({seconds:3,seed:10,profile:"portrait",quality:"high"}),
    "python gpu-worker/train_tiny_neural_video.py generate --model ./eternyx-tiny-neural-model/model.json --output ./eternyx-tiny-neural-sample --seconds 3 --seed 10 --profile portrait --quality high --stability 45 --variation 6");
  for(const seconds of [0,9,-1,1.2,true,"5"])assert.throws(()=>tinyNeuralGenerateCommand({seconds}),/duration/);
  for(const seed of [-1,2147483648,true,1.2])assert.throws(()=>tinyNeuralGenerateCommand({seed}),/seed/);
  for(const profile of ["large;rm","wide",null])assert.throws(()=>tinyNeuralGenerateCommand({profile}),/profile/);
  for(const quality of ["4k","ultra"])assert.throws(()=>tinyNeuralGenerateCommand({quality}),/quality/);
  assert.doesNotMatch(tinyNeuralGenerateCommand(),/https?:\/\/|curl|api_key|token|cuda/);
});

test("read genuine tiny MLP model receipt and measured training/holdout values",()=>{
  const parsed=readTinyNeuralReport(JSON.stringify(report));
  assert.deepEqual(parsed,report);
  assert.deepEqual(verifyTinyNeuralCheckpoint(parsed,checkpoint),{
    checksumMatched:true,modelSha256:digest,sourceCount:1,
    trainMseBefore:0.12,trainMseAfter:0.07,
    holdoutNeuralMse:0.09,holdoutBaselineMse:0.11,
    interpretation:"Small neural next-frame pixel predictor. These are empirical errors, not realism or authenticity scores.",
  });
  assert.equal(parsed.neural_network,true);
  assert.equal(parsed.text_to_video,false);
});

test("reject fake neural claims, malformed architectures, missing rights, duplicate sources",()=>{
  const bad=[
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.architecture.hidden=999;},
    r=>{r.architecture.type="diffusion";},
    r=>{r.architecture.activations=["relu"];},
    r=>{r.training_source_count=2;},
    r=>{r.training_sources[0].file="../original.mp4";},
    r=>{r.training_sources[0].sha256="bad";},
    r=>{r.training_sources[0].rights_ref="";},
    r=>{r.training_sources[0].train_frames=0;},
    r=>{r.training_sources[0].holdout_frames=0;},
    r=>{r.training_sources[0].used_frames=1000;},
    r=>{r.epochs=6;},
    r=>{r.seed=true;},
  ];
  for(const mutate of bad){
    const candidate=structuredClone(report);
    mutate(candidate);
    assert.throws(()=>readTinyNeuralReport(JSON.stringify(candidate)));
  }
  for(const raw of ["{",null,"[]",JSON.stringify({...report,kind:"fake_diffusion"}),
                     " ".repeat(TINY_NEURAL_LIMITS.maxReportBytes+1)]){
    assert.throws(()=>readTinyNeuralReport(raw));
  }
});

test("training MSE is measured, finite and not replaced with synthetic engagement ratings",()=>{
  const edits=[
    r=>{r.metrics.train_examples=0;},
    r=>{r.metrics.holdout_examples=-1;},
    r=>{r.metrics.training_mse_before=null;},
    r=>{r.metrics.training_mse_after=-1;},
    r=>{r.metrics.holdout_neural_mse="0.3";},
    r=>{r.metrics.holdout_persistence_baseline_mse=Infinity;},
  ];
  for(const mutate of edits){
    const candidate=structuredClone(report);
    mutate(candidate);
    assert.throws(()=>readTinyNeuralReport(JSON.stringify(candidate)));
  }
});

test("selected actual local checkpoint bytes must match the self-reported SHA256",()=>{
  const parsed=readTinyNeuralReport(JSON.stringify(report));
  for(const file of [
    {...checkpoint,sha256:"0".repeat(64)},
    {...checkpoint,sha256:"A".repeat(64)},
    {...checkpoint,size:0},
    {...checkpoint,size:TINY_NEURAL_LIMITS.maxModelBytes+1},
    {...checkpoint,name:"other.json"},
  ])assert.throws(()=>verifyTinyNeuralCheckpoint(parsed,file),/SHA-256/);
  assert.deepEqual(tinyNeuralOutputPaths(),{
    model:"eternyx-tiny-neural-model/model.json",
    training:"eternyx-tiny-neural-model/training-report.json",
    sample:"eternyx-tiny-neural-sample/clip-01.mp4",
    video:"eternyx-tiny-neural-sample/render/video.mp4",
    manifest:"eternyx-tiny-neural-sample/render/manifest.json",
    report:"eternyx-tiny-neural-sample/generation-report.json",
    audition:"eternyx-tiny-neural-audition/audition-report.json",
  });
});

test("Studio actually mounts a local-only tiny neural train/sample workflow with honest limitations",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/TinyNeuralVideoStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<TinyNeuralVideoStudio \/>/);
  assert.match(ui,/tinyNeuralTrainingCommand/);
  assert.match(ui,/tinyNeuralGenerateCommand/);
  assert.match(ui,/readTinyNeuralReport/);
  assert.match(ui,/verifyTinyNeuralCheckpoint/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/not diffusion/);
  assert.match(ui,/training-report\.json/);
  assert.match(ui,/rendered MP4|paths\.video/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob|paid API/);
});
