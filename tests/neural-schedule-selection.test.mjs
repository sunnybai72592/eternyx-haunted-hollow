import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  SCHEDULE_LIMITS,neuralScheduleCommand,neuralSchedulePaths,
  readNeuralScheduleReport,matchNeuralScheduleFile,
} from "../src/lib/ai/neuralScheduleSelection.mjs";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const measured=(n,mse)=>({steps:n,evaluated_pixels:1344*n,
  model_mse:mse,static_baseline_mse:0.11});
const receipt={
  version:1,kind:"cpu_neural_inner_prefix_schedule_selection",
  neural_network:true,text_to_video:false,model_generation:true,
  base_model_sha256:a,selected_model_sha256:b,
  base_weights_sha256:a,selected_weights_sha256:b,weights_changed:true,
  selected_model_file:"selected-model/model.json",
  sources:[{file:"approved.mp4",sha256:c,used_frames:32,
    train_frames:24,holdout_frames:8}],
  outer_holdout_used_for_selection:false,
  strategy:{
    seed:42,epochs:1,candidate_mixes:[0,50,100],
    selected_mix_percent:50,unchanged_base_allowed:true,
    inner_validation_steps:4,
    inner_splits:[{
      source_sha256:c,original_training_prefix_end:24,
      inner_training_end:18,inner_validation_start:18,
      inner_validation_end_exclusive:22,outer_holdout_start:24,
    }],
    candidates:[
      {name:"unchanged_base",mix_percent:null,inner_four_step_mse:0.12,
       inner_static_mse:0.11,evaluated_pixels:5376,
       trained_on_inner_prefix:false,optimizer_examples:0},
      {name:"replay_0",mix_percent:0,inner_four_step_mse:0.13,
       inner_static_mse:0.11,evaluated_pixels:5376,
       trained_on_inner_prefix:true,optimizer_examples:256},
      {name:"replay_50",mix_percent:50,inner_four_step_mse:0.10,
       inner_static_mse:0.11,evaluated_pixels:5376,
       trained_on_inner_prefix:true,optimizer_examples:384},
      {name:"replay_100",mix_percent:100,inner_four_step_mse:0.14,
       inner_static_mse:0.11,evaluated_pixels:5376,
       trained_on_inner_prefix:true,optimizer_examples:512},
    ],
    refit_on_full_original_training_prefix:true,
    refit_examples:384,refit_teacher_examples:128,
    cpu_training_and_selection_seconds:2.5,
  },
  final_outer_audit:{
    steps:[1,4,8],
    before:{"1":measured(1,0.14),"4":measured(4,0.23),"8":measured(8,0.31)},
    after:{"1":measured(1,0.13),"4":measured(4,0.25),"8":measured(8,0.35)},
  },
  sampling:{seconds:1,seed:42,stability_percent:45,variation_percent:6},
  artifacts:{
    base:{file:"base-sample/render/video.mp4",sha256:a,video_bytes:12000,frame_count:16},
    selected:{file:"selected-sample/render/video.mp4",sha256:b,video_bytes:12001,frame_count:16},
    comparison:{file:"comparison.mp4",sha256:c,video_bytes:21000,
      width:512,height:144,frame_count:16},
  },
};

test("safe deterministic local CPU replay sweep command with bounded mix percentages",()=>{
  assert.equal(neuralScheduleCommand(),
    "python gpu-worker/select_neural_schedule.py --model ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-schedule --mix 0 --mix 50 --mix 100 --seed 42 --epochs 1 --seconds 1 --stability 45 --variation 6");
  assert.equal(neuralScheduleCommand({mixes:[100,0],seed:13,epochs:2,
    seconds:2,stability:70,variation:3}).endsWith(
    "--mix 0 --mix 100 --seed 13 --epochs 2 --seconds 2 --stability 70 --variation 3"),true);
  assert.doesNotMatch(neuralScheduleCommand(),/https?:\/\/|curl|api_key|CUDA/);
  for(const mixes of [[],[0,0],[0,25,50,75],[11],[-1],["50"],[true],null]){
    assert.throws(()=>neuralScheduleCommand({mixes}),/replay percentages/);
  }
  for(const [key,values] of Object.entries({
    seed:[-1,2147483648,true,"42"],epochs:[0,3,true,"1"],
    seconds:[0,3,1.2,true],stability:[-1,86,true],
    variation:[-1,21,true],
  })){
    for(const value of values){
      assert.throws(()=>neuralScheduleCommand({[key]:value}),new RegExp(key==="epochs"?"Epochs":
        key==="seconds"?"Seconds":key[0].toUpperCase()+key.slice(1)));
    }
  }
});

test("parse valid inner-only replay sweep and preserve adverse outer holdout regression",()=>{
  const parsed=readNeuralScheduleReport(JSON.stringify(receipt));
  assert.deepEqual(parsed,receipt);
  assert.equal(parsed.strategy.selected_mix_percent,50);
  assert.equal(parsed.outer_holdout_used_for_selection,false);
  assert.ok(parsed.final_outer_audit.after["8"].model_mse>
            parsed.final_outer_audit.before["8"].model_mse);
  assert.equal(parsed.strategy.inner_splits[0].inner_validation_end_exclusive,22);
  assert.equal(parsed.strategy.inner_splits[0].outer_holdout_start,24);
  assert.equal(parsed.strategy.candidates[0].mix_percent,null);
});

test("baseline fallback is accepted only when NO replay candidate passes inner validation",()=>{
  const baseline=structuredClone(receipt);
  baseline.strategy.candidates[2].inner_four_step_mse=0.135;
  baseline.strategy.selected_mix_percent=null;
  baseline.strategy.refit_on_full_original_training_prefix=false;
  baseline.strategy.refit_examples=0;
  baseline.strategy.refit_teacher_examples=0;
  baseline.selected_weights_sha256=baseline.base_weights_sha256;
  baseline.weights_changed=false;
  assert.equal(readNeuralScheduleReport(JSON.stringify(baseline)).
               strategy.selected_mix_percent,null);
  baseline.strategy.selected_mix_percent=0;
  assert.throws(()=>readNeuralScheduleReport(JSON.stringify(baseline)),/chosen strategy/);
});

test("reject fabricated candidate winner and overlapping validation/outer leakage",()=>{
  const mutations=[
    r=>{r.outer_holdout_used_for_selection=true;},
    r=>{r.strategy.selected_mix_percent=100;},
    r=>{r.strategy.candidates[2].inner_four_step_mse=0.17;},
    r=>{r.strategy.candidate_mixes=[0,50,50];},
    r=>{r.strategy.candidate_mixes=[50,0,100];},
    r=>{r.strategy.candidates[0].mix_percent=0;},
    r=>{r.strategy.candidates[1].name="fake";},
    r=>{r.strategy.candidates[1].inner_static_mse=0.4;},
    r=>{r.strategy.candidates[1].optimizer_examples=0;},
    r=>{r.strategy.candidates[2].evaluated_pixels=0;},
    r=>{r.strategy.inner_validation_steps=8;},
    r=>{r.strategy.inner_splits[0].inner_validation_end_exclusive=24;},
    r=>{r.strategy.inner_splits[0].inner_training_end=20;},
    r=>{r.strategy.inner_splits[0].outer_holdout_start=20;},
    r=>{r.strategy.refit_on_full_original_training_prefix=false;},
    r=>{r.strategy.refit_examples=0;},
  ];
  for(const mutate of mutations){
    const edited=structuredClone(receipt);mutate(edited);
    assert.throws(()=>readNeuralScheduleReport(JSON.stringify(edited)));
  }
});

test("strict source provenance, model hashes and outer evaluation evidence cannot be forged",()=>{
  const mutations=[
    r=>{r.kind="fake_video";},
    r=>{r.text_to_video=true;},
    r=>{r.neural_network=false;},
    r=>{r.weights_changed=false;},
    r=>{r.selected_weights_sha256=r.base_weights_sha256;},
    r=>{r.selected_model_sha256="invalid";},
    r=>{r.selected_model_file="../model.json";},
    r=>{r.sources[0].file="../bad.mp4";},
    r=>{r.sources[0].sha256="BAD";},
    r=>{r.sources[0].used_frames=31;},
    r=>{r.sources[0].train_frames=23;},
    r=>{r.sources[0].holdout_frames=7;},
    r=>{r.strategy.cpu_training_and_selection_seconds=-1;},
    r=>{r.final_outer_audit.steps=[1,4];},
    r=>{r.final_outer_audit.after["8"].model_mse=-1;},
    r=>{r.final_outer_audit.after["4"].static_baseline_mse=0.8;},
    r=>{r.final_outer_audit.before["8"].evaluated_pixels=500;},
    r=>{r.sampling.seed=111;},
    r=>{r.sampling.seconds=3;},
  ];
  for(const mutate of mutations){
    const edited=structuredClone(receipt);mutate(edited);
    assert.throws(()=>readNeuralScheduleReport(JSON.stringify(edited)));
  }
  for(const raw of ["{","[]",null," ".repeat(SCHEDULE_LIMITS.maxReportBytes+1)]){
    assert.throws(()=>readNeuralScheduleReport(raw));
  }
});

test("actual local checkpoint and three H264 videos must match SHA-256 and byte size",()=>{
  const parsed=readNeuralScheduleReport(JSON.stringify(receipt));
  assert.equal(matchNeuralScheduleFile(parsed,{
    name:"model.json",size:50000,sha256:b}).kind,"model");
  assert.equal(matchNeuralScheduleFile(parsed,{
    name:"video.mp4",size:12000,sha256:a}).kind,"base");
  assert.equal(matchNeuralScheduleFile(parsed,{
    name:"video.mp4",size:12001,sha256:b}).kind,"selected");
  assert.equal(matchNeuralScheduleFile(parsed,{
    name:"comparison.mp4",size:21000,sha256:c}).kind,"comparison");
  for(const file of [
    {name:"model.json",size:50000,sha256:a},
    {name:"model.json",size:SCHEDULE_LIMITS.maxModelBytes+1,sha256:b},
    {name:"video.mp4",size:12000,sha256:b},
    {name:"comparison.mp4",size:21000,sha256:a},
    {name:"video.mp4",size:0,sha256:b},
    {name:"comparison.mp4",size:21000,sha256:"INVALID"},
  ])assert.throws(()=>matchNeuralScheduleFile(parsed,file));
});

test("Studio mounts real CPU selection, measured inner/outer errors and local video playback",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/NeuralScheduleSelectionStudio.tsx",import.meta.url),"utf8");
  assert.match(parent,/<NeuralScheduleSelectionStudio \/>/);
  assert.match(ui,/neuralScheduleCommand/);
  assert.match(ui,/readNeuralScheduleReport/);
  assert.match(ui,/matchNeuralScheduleFile/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/only after selection/);
  assert.match(ui,/does not guarantee a gain/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("all output paths are bounded create-only local files separate from v1/v2 workspaces",()=>{
  assert.deepEqual(neuralSchedulePaths(),{
    report:"eternyx-neural-schedule/schedule-report.json",
    selectedModel:"eternyx-neural-schedule/selected-model/model.json",
    baseline:"eternyx-neural-schedule/base-sample/render/video.mp4",
    selected:"eternyx-neural-schedule/selected-sample/render/video.mp4",
    comparison:"eternyx-neural-schedule/comparison.mp4",
  });
});
