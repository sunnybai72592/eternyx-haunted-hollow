import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  cpuModelTrainCommand,cpuModelGenerateCommand,cpuLearnedOutputPaths,
  readCpuTrainingReport,checkCpuTrainedModel,LEARNED_CPU_LIMITS,
} from "../src/lib/ai/cpuLearnedVideo.mjs";

const digest="a".repeat(64);
const report={
  version:1,kind:"cpu_learned_motion_training",
  model_sha256:digest,training_source_count:1,neural_network:false,
  training_sources:[{
    file:"clip-01.mp4",sha256:"b".repeat(64),
    rights_ref:"original-recording",decoded_frames:32,
    used_frames:32,train_frames:24,holdout_frames:8,
  }],
  metrics:{
    training_pairs:13248,holdout_pairs:4608,
    holdout_transition_nll:2.102301,
    holdout_color_baseline_nll:2.889173,
    interpretation:"Held-out categorical NLL only.",
  },
};
const good={name:"model.json",size:83123,sha256:digest};

test("literal CPU model training/generation commands never interpolate unsafe shell input",()=>{
  assert.equal(cpuModelTrainCommand(),
    "python gpu-worker/learn_cpu_video_texture.py train --input ./local-video-media --output ./eternyx-learned-cpu-model --rights-ref operator-reviewed-original-footage");
  assert.equal(cpuModelTrainCommand("legal_footage-2").endsWith("rights-ref legal_footage-2"),true);
  assert.equal(cpuModelGenerateCommand({seconds:5,seed:41,profile:"portrait",quality:"high"}),
    "python gpu-worker/learn_cpu_video_texture.py generate --model ./eternyx-learned-cpu-model/model.json --output ./eternyx-learned-cpu-video --seconds 5 --seed 41 --profile portrait --quality high");
  for(const label of ["", "unsafe space", "a;rm", "$(whoami)","x\n", "-dangerous"]) {
    assert.throws(()=>cpuModelTrainCommand(label),/rights reference/);
  }
  for(const value of [0,9,1.5,NaN,true,"2"]) {
    assert.throws(()=>cpuModelGenerateCommand({seconds:value}),/1–8 seconds/);
  }
  for(const seed of [-1,2147483648,NaN,true,"42"]) {
    assert.throws(()=>cpuModelGenerateCommand({seed}),/31-bit/);
  }
  for(const profile of ["AI","wide;curl",null]) {
    assert.throws(()=>cpuModelGenerateCommand({profile}),/preset/);
  }
  assert.throws(()=>cpuModelGenerateCommand({quality:"ultra"}),/preset/);
  assert.doesNotMatch(cpuModelTrainCommand(),/https?:\/\/|api[_-]?key|cuda/);
});

test("real trained model receipt holds actual train/holdout counts and checksum",()=>{
  const parsed=readCpuTrainingReport(JSON.stringify(report));
  assert.deepEqual(parsed,report);
  assert.deepEqual(checkCpuTrainedModel(parsed,good),{
    matched:true,modelSha256:digest,trainingSources:1,
    holdoutTransitionNll:2.102301,holdoutBaselineNll:2.889173,
    interpretation:"Local checksum and held-out categorical prediction results, not a photo-realism score or digital signature.",
  });
  assert.equal(parsed.neural_network,false);
});

test("trained model report rejects malformed, oversized, fake or unverifiable data",()=>{
  for(const source of [
    null,"{","{}",JSON.stringify({...report,neural_network:true}),
    JSON.stringify({...report,kind:"neural_video_diffusion"}),
    JSON.stringify({...report,training_source_count:2}),
    JSON.stringify({...report,model_sha256:"0"}),
    JSON.stringify({...report,training_sources:[]}),
    " ".repeat(LEARNED_CPU_LIMITS.maxTrainingReportBytes+1),
  ]) assert.throws(()=>readCpuTrainingReport(source));
});

test("source provenance and honest heldout NLL must be valid, never invented ratings",()=>{
  const edits=[
    value=>{value.training_sources[0].rights_ref="";},
    value=>{value.training_sources[0].sha256="A".repeat(64);},
    value=>{value.training_sources[0].file="../hidden.mp4";},
    value=>{value.training_sources[0].used_frames=100;},
    value=>{value.training_sources[0].train_frames=3;},
    value=>{value.training_sources[0].holdout_frames=0;},
    value=>{value.training_sources[0].decoded_frames=7;},
    value=>{value.metrics.training_pairs=0;},
    value=>{value.metrics.holdout_pairs=-1;},
    value=>{value.metrics.holdout_transition_nll=NaN;},
    value=>{value.metrics.holdout_color_baseline_nll=-1;},
  ];
  for(const edit of edits) {
    const candidate=structuredClone(report);
    edit(candidate);
    assert.throws(()=>readCpuTrainingReport(JSON.stringify(candidate)));
  }
});

test("actual selected model bytes must agree with local training report",()=>{
  const parsed=readCpuTrainingReport(JSON.stringify(report));
  for(const candidate of [
    {...good,sha256:"c".repeat(64)},
    {...good,sha256:"Z".repeat(64)},
    {...good,name:"other.json"},
    {...good,size:0},
    {...good,size:LEARNED_CPU_LIMITS.maxModelBytes+1},
  ]) assert.throws(()=>checkCpuTrainedModel(parsed,candidate),/SHA-256/);
});

test("finished learned video paths point to real offline renderer artifacts",()=>{
  assert.deepEqual(cpuLearnedOutputPaths(),{
    model:"eternyx-learned-cpu-model/model.json",
    trainingReport:"eternyx-learned-cpu-model/training-report.json",
    sample:"eternyx-learned-cpu-video/clip-01.mp4",
    finished:"eternyx-learned-cpu-video/render/video.mp4",
    sampleReport:"eternyx-learned-cpu-video/generation-report.json",
    renderManifest:"eternyx-learned-cpu-video/render/manifest.json",
  });
});

test("AI Video Studio exposes authentic CPU train/sample evidence without network calls",()=>{
  const app=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/LocalLearnedVideoStudio.tsx",import.meta.url),"utf8");
  assert.match(app,/<LocalLearnedVideoStudio \/>/);
  assert.match(ui,/cpuModelTrainCommand/);
  assert.match(ui,/cpuModelGenerateCommand/);
  assert.match(ui,/readCpuTrainingReport/);
  assert.match(ui,/checkCpuTrainedModel/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/held-out/);
  assert.match(ui,/not a neural diffusion model/);
  assert.match(ui,/sampleReport/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
