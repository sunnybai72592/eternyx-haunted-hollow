import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  ROLLOUT_LIMITS,rolloutAdaptCommand,rolloutAdaptPaths,
  readRolloutAdaptReport,matchRolloutAdaptFile,
} from "../src/lib/ai/causalRolloutAdapt.mjs";

const hash="a".repeat(64),hash2="b".repeat(64),hash3="c".repeat(64);
const row=(n,mse)=>({steps:n,evaluated_pixels:n*48*28,
  model_mse:mse,static_baseline_mse:0.05});
const receipt={
  version:1,kind:"cpu_neural_causal_rollout_adaptation",
  neural_network:true,text_to_video:false,model_generation:true,
  base_model_sha256:hash,adapted_model_sha256:hash2,
  adapted_model_file:"adapted-model/model.json",
  training_source_count:1,
  sources:[{
    file:"original.mp4",sha256:hash3,decoded_frames:32,used_frames:32,
    training_prefix_frames:24,holdout_frames:8,
  }],
  training:{
    epochs:1,seed:42,teacher_replay_percent:50,
    free_running_depth:3,total_examples:432,teacher_examples:144,
    causal_anchors:[{source_sha256:hash3,anchor:2,depth:3}],
    training_seconds:2.351,learning_rate:0.055,no_holdout_training:true,
  },
  evaluation:{
    resolution:"48x28",steps:[1,4,8],
    baseline:{"1":row(1,0.12),"4":row(4,0.2),"8":row(8,0.3)},
    adapted:{"1":row(1,0.11),"4":row(4,0.24),"8":row(8,0.35)},
    one_step_teacher_forced_baseline_mse:0.12,
    one_step_teacher_forced_adapted_mse:0.11,
    static_one_step_mse:0.05,
    interpretation:"Error may worsen; model can regress.",
  },
  sampling:{seconds:1,seed:42,stability_percent:45,variation_percent:6},
  artifacts:{
    baseline:{file:"baseline/render/video.mp4",sha256:hash,
      video_bytes:10000,frame_count:16},
    adapted:{file:"adapted/render/video.mp4",sha256:hash2,
      video_bytes:11000,frame_count:16},
    comparison:{file:"comparison.mp4",sha256:hash3,
      video_bytes:16000,width:512,height:144,frame_count:16},
  },
};

test("safe CPU adaptation CLI has strictly bounded integer-only arguments",()=>{
  assert.equal(rolloutAdaptCommand(),
    "python gpu-worker/adapt_neural_rollout.py --model ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-causal-adaptation --epochs 1 --mix-percent 50 --seed 42 --seconds 1 --stability 45 --variation 6");
  assert.equal(rolloutAdaptCommand({epochs:3,mixPercent:25,seed:12,
     seconds:2,stability:80,variation:3}).endsWith(
     "--epochs 3 --mix-percent 25 --seed 12 --seconds 2 --stability 80 --variation 3"),true);
  for(const x of [0,4,1.4,true,"2",null])
    assert.throws(()=>rolloutAdaptCommand({epochs:x}),/epochs/);
  for(const x of [-1,101,2.2,true,"50",null])
    assert.throws(()=>rolloutAdaptCommand({mixPercent:x}),/replay/);
  for(const x of [-1,2147483648,true,1.2,"13"])
    assert.throws(()=>rolloutAdaptCommand({seed:x}),/seed/);
  for(const x of [0,3,true,"2"])
    assert.throws(()=>rolloutAdaptCommand({seconds:x}),/seconds/);
  for(const x of [-1,86,true,"45"])
    assert.throws(()=>rolloutAdaptCommand({stability:x}),/stability/);
  for(const x of [-1,21,true,"6"])
    assert.throws(()=>rolloutAdaptCommand({variation:x}),/variation/);
  assert.doesNotMatch(rolloutAdaptCommand(),/https?:\/\/|curl|api_key|cuda/);
});

test("real causal prefix and honest eight-step regression report parses unchanged",()=>{
  const parsed=readRolloutAdaptReport(JSON.stringify(receipt));
  assert.deepEqual(parsed,receipt);
  assert.equal(parsed.training.no_holdout_training,true);
  assert.equal(parsed.evaluation.adapted["8"].model_mse,0.35);
  assert.equal(parsed.evaluation.baseline["8"].model_mse,0.3);
  assert.ok(parsed.evaluation.adapted["8"].model_mse>
            parsed.evaluation.baseline["8"].model_mse,
            "Actual post-adaptation regression must remain visible rather than claiming an improvement");
});

test("actual model and all three generated H264 videos can be hash verified",()=>{
  const parsed=readRolloutAdaptReport(JSON.stringify(receipt));
  assert.equal(matchRolloutAdaptFile(parsed,{name:"model.json",sha256:hash2,size:45000}).kind,"model");
  assert.equal(matchRolloutAdaptFile(parsed,{name:"video.mp4",sha256:hash,size:10000}).kind,"baseline");
  assert.equal(matchRolloutAdaptFile(parsed,{name:"video.mp4",sha256:hash2,size:11000}).kind,"adapted");
  assert.equal(matchRolloutAdaptFile(parsed,{name:"comparison.mp4",sha256:hash3,size:16000}).kind,"comparison");
  for(const file of [
    {name:"model.json",sha256:hash,size:45000},
    {name:"model.json",sha256:hash2,size:0},
    {name:"model.json",sha256:hash2,size:ROLLOUT_LIMITS.maxModelBytes+1},
    {name:"video.mp4",sha256:hash2,size:10000},
    {name:"comparison.mp4",sha256:hash3,size:14000},
    {name:"video.mp4",sha256:"INVALID",size:10000},
  ])assert.throws(()=>matchRolloutAdaptFile(parsed,file));
});

test("fail closed on counterfeit model origin and unexpected training/holdout boundaries",()=>{
  const mutations=[
    r=>{r.kind="fake_diffusion";},
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.model_generation=false;},
    r=>{r.base_model_sha256=r.adapted_model_sha256;},
    r=>{r.base_model_sha256="BAD";},
    r=>{r.training_source_count=2;},
    r=>{r.sources[0].file="../private.mp4";},
    r=>{r.sources[0].file=".secret.mp4";},
    r=>{r.sources[0].sha256="bad";},
    r=>{r.sources[0].used_frames=24;},
    r=>{r.sources[0].training_prefix_frames=23;},
    r=>{r.sources[0].holdout_frames=7;},
    r=>{r.sources[0].decoded_frames=10;},
    r=>{r.adapted_model_file="../model.json";},
  ];
  for(const mutation of mutations){
    const copied=structuredClone(receipt);mutation(copied);
    assert.throws(()=>readRolloutAdaptReport(JSON.stringify(copied)));
  }
});

test("reject invented casual-training provenance and altered measured errors",()=>{
  const mutations=[
    r=>{r.training.epochs=4;},
    r=>{r.training.seed=-1;},
    r=>{r.training.teacher_replay_percent=101;},
    r=>{r.training.teacher_examples=100000;},
    r=>{r.training.no_holdout_training=false;},
    r=>{r.training.free_running_depth=8;},
    r=>{r.training.total_examples=0;},
    r=>{r.training.training_seconds=-1;},
    r=>{r.training.causal_anchors[0].source_sha256=hash;},
    r=>{r.training.causal_anchors[0].anchor=1;},
    r=>{r.training.causal_anchors[0].depth=9;},
    r=>{r.evaluation.steps=[1,4];},
    r=>{r.evaluation.resolution="32x18";},
    r=>{r.evaluation.baseline["8"].model_mse=-1;},
    r=>{r.evaluation.adapted["4"].static_baseline_mse=0.3;},
    r=>{r.evaluation.adapted["8"].evaluated_pixels=20;},
    r=>{r.evaluation.static_one_step_mse="zero";},
  ];
  for(const mutation of mutations){
    const copied=structuredClone(receipt);mutation(copied);
    assert.throws(()=>readRolloutAdaptReport(JSON.stringify(copied)));
  }
});

test("reject fake rendered video sizes, sample controls and invalid JSON",()=>{
  const mutations=[
    r=>{r.sampling.seed=21;},
    r=>{r.sampling.seconds=3;},
    r=>{r.sampling.stability_percent=90;},
    r=>{r.sampling.variation_percent=-1;},
    r=>{r.artifacts.baseline.file="../test.mp4";},
    r=>{r.artifacts.adapted.frame_count=31;},
    r=>{r.artifacts.baseline.video_bytes=0;},
    r=>{r.artifacts.adapted.sha256="bad";},
    r=>{r.artifacts.comparison.width=256;},
    r=>{r.artifacts.comparison.height=288;},
    r=>{r.artifacts.comparison.frame_count=10;},
    r=>{r.artifacts.comparison.video_bytes=0;},
  ];
  for(const mutation of mutations){
    const copied=structuredClone(receipt);mutation(copied);
    assert.throws(()=>readRolloutAdaptReport(JSON.stringify(copied)));
  }
  for(const raw of ["{",null,"[]"," ".repeat(ROLLOUT_LIMITS.maxReportBytes+1)])
    assert.throws(()=>readRolloutAdaptReport(raw));
});

test("actual Studio mounts learned v2 adaptation and has no remote API/media upload",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const component=readFileSync(new URL("../src/components/CausalRolloutAdaptStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<CausalRolloutAdaptStudio \/>/);
  assert.match(component,/rolloutAdaptCommand/);
  assert.match(component,/readRolloutAdaptReport/);
  assert.match(component,/matchRolloutAdaptFile/);
  assert.match(component,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(component,/<video src=/);
  assert.match(component,/URL\.revokeObjectURL/);
  assert.match(component,/No held-out frames enter training/);
  assert.match(component,/results may get worse/);
  assert.doesNotMatch(component,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("outputs are private local paths distinct from any original model data",()=>{
  assert.deepEqual(rolloutAdaptPaths(),{
    report:"eternyx-neural-causal-adaptation/adaptation-report.json",
    adaptedModel:"eternyx-neural-causal-adaptation/adapted-model/model.json",
    baseline:"eternyx-neural-causal-adaptation/baseline/render/video.mp4",
    adapted:"eternyx-neural-causal-adaptation/adapted/render/video.mp4",
    comparison:"eternyx-neural-causal-adaptation/comparison.mp4",
  });
});
