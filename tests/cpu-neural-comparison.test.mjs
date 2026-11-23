import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  NEURAL_COMPARISON_LIMITS,neuralComparisonCommand,
  neuralComparisonOutputPaths,readNeuralComparisonReport,
  matchNeuralComparisonVideo,
} from "../src/lib/ai/cpuNeuralComparison.mjs";

const sha="a".repeat(64),sha2="b".repeat(64),sha3="c".repeat(64);
const steps=Array.from({length:8},(_,i)=>({
  step:i+1,source_count:1,v1_mse:0.17,v2_mse:0.12,static_baseline_mse:0.09,
}));
const report={
  version:1,kind:"cpu_neural_v1_v2_comparison",
  neural_network:true,text_to_video:false,model_generation:true,
  seed:42,epochs:1,seconds:1,fps:16,
  sources:[{file:"owned-source.mp4",sha256:sha,actual_frames:32}],
  same_training_sources:true,
  evaluation:{
    version:1,resolution:"48x28",
    target:"4-level/channel quantized original 48x28 heldout RGB",
    v1_evaluation:"32x18 v1 samples nearest-neighbor upscaled to 48x28",
    v2_evaluation:"Native 48x28 v2 samples",
    teacher_forcing:false,same_sources:true,
    temporal_split:"identical first 75% train / last 25% heldout",
    steps,windows:{
      "1":{steps:1,v1_mse:0.17,v2_mse:0.12,static_baseline_mse:0.09},
      "4":{steps:4,v1_mse:0.17,v2_mse:0.12,static_baseline_mse:0.09},
      "8":{steps:8,v1_mse:0.17,v2_mse:0.12,static_baseline_mse:0.09},
    },
    interpretation:"Matched causal predictive MSE.",
  },
  cpu_elapsed_seconds:{
    v1_training:0.52,v2_training:1.31,matched_evaluation:2.52,
    v1_sample_and_render:0.32,v2_sample_and_render:0.59,
    side_by_side_encoding:0.18,
    interpretation:"Hardware-dependent one-off wall clock, not controlled performance.",
  },
  artifacts:{
    v1:{model_file:"model-v1/model.json",model_sha256:sha,model_bytes:14321,
      training_report_file:"model-v1/training-report.json",
      sample_file:"sample-v1/render/video.mp4",sample_sha256:sha2,
      sample_bytes:9021,sample_origin_receipt_sha256:sha3,
      learned_resolution:"32x18",sample_frames:16,training_source_count:1},
    v2:{model_file:"model-v2/model.json",model_sha256:sha2,model_bytes:18422,
      training_report_file:"model-v2/training-report.json",
      sample_file:"sample-v2/render/video.mp4",sample_sha256:sha3,
      sample_bytes:17050,sample_origin_receipt_sha256:sha,
      learned_resolution:"48x28",sample_frames:16,training_source_count:1},
    comparison:{file:"comparison.mp4",sha256:sha,video_bytes:26080,
      width:512,height:144,frame_count:16},
  },
};

test("comparison CLI uses only shell-safe review, seed, epoch and sample arguments",()=>{
  assert.equal(neuralComparisonCommand(),
    "python gpu-worker/compare_cpu_neural_video.py --input ./local-video-media --output ./eternyx-neural-comparison --rights-ref owner-reviewed-video --seed 42 --epochs 1 --seconds 1");
  assert.equal(neuralComparisonCommand({rightsRef:"owned_01",seed:31,epochs:2,seconds:2}),
    "python gpu-worker/compare_cpu_neural_video.py --input ./local-video-media --output ./eternyx-neural-comparison --rights-ref owned_01 --seed 31 --epochs 2 --seconds 2");
  for(const rightsRef of ["","a;rm","unsafe space","$(whoami)","-danger","foo\n",true])
    assert.throws(()=>neuralComparisonCommand({rightsRef}),/Rights reference/);
  for(const seed of [-1,2147483648,2.3,true,"31",null])
    assert.throws(()=>neuralComparisonCommand({seed}),/Comparison seed/);
  for(const epochs of [0,3,1.5,true,"2"])
    assert.throws(()=>neuralComparisonCommand({epochs}),/Training epochs/);
  for(const seconds of [0,3,1.5,true,"1"])
    assert.throws(()=>neuralComparisonCommand({seconds}),/Sample duration/);
  assert.doesNotMatch(neuralComparisonCommand(),/curl|https?:\/\/|API_KEY|cuda/);
});

test("real same-source 8-step report is parsed without declaring which model wins",()=>{
  const parsed=readNeuralComparisonReport(JSON.stringify(report));
  assert.deepEqual(parsed,report);
  assert.equal(parsed.evaluation.steps.length,8);
  assert.equal(parsed.evaluation.resolution,"48x28");
  assert.equal(parsed.same_training_sources,true);
  assert.equal(parsed.evaluation.teacher_forcing,false);
  assert.equal(parsed.evaluation.windows["8"].v1_mse,0.17);
  assert.equal(parsed.evaluation.windows["8"].v2_mse,0.12);
  assert.ok(!("best_model" in parsed));
  assert.ok(!("realism_score" in parsed));
  assert.equal(NEURAL_COMPARISON_LIMITS.minFrames,32);
});

test("real v1 and v2 MP4s and side-by-side video are matched by actual bytes",()=>{
  const parsed=readNeuralComparisonReport(JSON.stringify(report));
  assert.deepEqual(matchNeuralComparisonVideo(parsed,{
    name:"video.mp4",size:9021,sha256:sha2
  }),{matched:true,kind:"v1",sha256:sha2,width:256,height:144,frames:16,
      interpretation:"A local, self-attested file match—not a quality ranking or signed authenticity."});
  assert.equal(matchNeuralComparisonVideo(parsed,{
    name:"video.mp4",size:17050,sha256:sha3}).kind,"v2");
  assert.equal(matchNeuralComparisonVideo(parsed,{
    name:"comparison.mp4",size:26080,sha256:sha}).kind,"comparison");
  for(const file of [
    {name:"video.mp4",size:9021,sha256:sha3},
    {name:"video.mp4",size:0,sha256:sha2},
    {name:"video.mp4",size:9021,sha256:"NOTHASH"},
    {name:"comparison.mp4",size:9021,sha256:sha2},
    {name:"comparison.mp4",size:27080,sha256:sha},
  ])assert.throws(()=>matchNeuralComparisonVideo(parsed,file));
});

test("refuse forged source provenance and non-matching training splits",()=>{
  const edits=[
    r=>{r.same_training_sources=false;},
    r=>{r.sources[0].file="../secret.mp4";},
    r=>{r.sources[0].file=".hidden.mp4";},
    r=>{r.sources[0].sha256="bad";},
    r=>{r.sources[0].actual_frames=31;},
    r=>{r.sources=[];},
    r=>{r.epochs=3;},
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.model_generation=false;},
    r=>{r.seed=-1;},
    r=>{r.fps=30;},
  ];
  for(const change of edits){
    const copy=structuredClone(report);
    change(copy);
    assert.throws(()=>readNeuralComparisonReport(JSON.stringify(copy)));
  }
});

test("reject fabricated 8-step metrics and manipulated window summaries",()=>{
  const changes=[
    r=>{r.evaluation.steps.pop();},
    r=>{r.evaluation.steps[1].step=100;},
    r=>{r.evaluation.steps[1].v1_mse=-1;},
    r=>{r.evaluation.steps[1].v2_mse=Infinity;},
    r=>{r.evaluation.steps[1].source_count=2;},
    r=>{r.evaluation.windows["8"].v1_mse=0;},
    r=>{r.evaluation.windows["4"].steps=3;},
    r=>{r.evaluation.teacher_forcing=true;},
    r=>{r.evaluation.resolution="32x18";},
    r=>{r.evaluation.same_sources=false;},
    r=>{r.cpu_elapsed_seconds.v1_training=-1;},
    r=>{r.cpu_elapsed_seconds.v2_training="fast";},
  ];
  for(const change of changes){
    const copy=structuredClone(report);
    change(copy);
    assert.throws(()=>readNeuralComparisonReport(JSON.stringify(copy)));
  }
});

test("reject made-up H264 provenance and wrong frame/dimension claims",()=>{
  const changes=[
    r=>{r.artifacts.v1.model_file="../model.json";},
    r=>{r.artifacts.v1.sample_file="not-a-video";},
    r=>{r.artifacts.v1.sample_sha256="bad";},
    r=>{r.artifacts.v1.model_bytes=0;},
    r=>{r.artifacts.v1.sample_bytes=0;},
    r=>{r.artifacts.v2.sample_frames=15;},
    r=>{r.artifacts.v2.learned_resolution="32x18";},
    r=>{r.artifacts.v1.training_source_count=0;},
    r=>{r.artifacts.comparison.file="other.mp4";},
    r=>{r.artifacts.comparison.width=1024;},
    r=>{r.artifacts.comparison.height=288;},
    r=>{r.artifacts.comparison.frame_count=8;},
    r=>{r.artifacts.comparison.video_bytes=0;},
  ];
  for(const change of changes){
    const copy=structuredClone(report);
    change(copy);
    assert.throws(()=>readNeuralComparisonReport(JSON.stringify(copy)));
  }
  for(const raw of [null,"{","[]"," ".repeat(NEURAL_COMPARISON_LIMITS.maxReportBytes+1)]){
    assert.throws(()=>readNeuralComparisonReport(raw));
  }
});

test("Studio actually mounts CPU comparison and offers hashed local three-player review",()=>{
  const parent=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/CpuNeuralModelComparison.tsx",import.meta.url),"utf8");
  assert.match(parent,/<CpuNeuralModelComparison \/>/);
  assert.match(ui,/neuralComparisonCommand/);
  assert.match(ui,/readNeuralComparisonReport/);
  assert.match(ui,/matchNeuralComparisonVideo/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video src=/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/eight-step/);
  assert.match(ui,/comparison.mp4/);
  assert.match(ui,/does not prove better visual quality/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob|requestAIJobEnqueue/);
});

test("four explicit artifact handoff paths remain local and distinct from existing v1/v2 workspaces",()=>{
  assert.deepEqual(neuralComparisonOutputPaths(),{
    report:"eternyx-neural-comparison/comparison-report.json",
    v1:"eternyx-neural-comparison/sample-v1/render/video.mp4",
    v2:"eternyx-neural-comparison/sample-v2/render/video.mp4",
    comparison:"eternyx-neural-comparison/comparison.mp4",
  });
});
