import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  tinyNeuralGenerateCommand,tinyNeuralAuditionCommand,
  readTinyNeuralAudition,matchTinyNeuralCandidate,
} from "../src/lib/ai/tinyNeuralVideo.mjs";

const a="a".repeat(64), b="b".repeat(64), c="c".repeat(64);
const metrics={
  measured_frame_count:16,
  mean_temporal_absolute_delta:0.12345678,
  max_temporal_absolute_delta:0.4567891,
  identical_adjacent_frame_pairs:0,
  first_frame_mean_brightness:0.3,
  last_frame_mean_brightness:0.5,
  interpretation:"Raw RGB diagnostics only; lower flicker is not automatically higher visual quality.",
};
const receipt={
  version:1,kind:"cpu_tiny_neural_video_audition",
  neural_network:true,text_to_video:false,model_sha256:a,candidate_count:2,
  seconds:1,fps:16,profile:"landscape",quality:"standard",
  stability_percent:45,variation_percent:6,
  candidates:[
    {candidate:"candidate-01",sample_seed:42,file:"candidate-01/render/video.mp4",
     video_sha256:b,video_bytes:12034,model_sha256:a,
     renderer_manifest_sha256:c,actual_decoded_frames:16,
     width:256,height:144,raw_frames_sha256:a,temporal_frame_metrics:metrics},
    {candidate:"candidate-02",sample_seed:43,file:"candidate-02/render/video.mp4",
     video_sha256:c,video_bytes:12035,model_sha256:a,
     renderer_manifest_sha256:b,actual_decoded_frames:16,
     width:256,height:144,raw_frames_sha256:b,temporal_frame_metrics:metrics},
  ],
  interpretation:"Actual decoded videos and raw RGB temporal deltas. No quality ranking.",
};

test("temporal stability and correlated innovation are strictly bounded literal CLI args",()=>{
  assert.equal(tinyNeuralGenerateCommand({seconds:1,seed:7,stability:80,variation:3}),
    "python gpu-worker/train_tiny_neural_video.py generate --model ./eternyx-tiny-neural-model/model.json --output ./eternyx-tiny-neural-sample --seconds 1 --seed 7 --profile landscape --quality standard --stability 80 --variation 3");
  for(const stability of [-1,86,2.5,true,"80",null]){
    assert.throws(()=>tinyNeuralGenerateCommand({stability}),/Temporal stability/);
  }
  for(const variation of [-1,21,2.5,true,"6",null]){
    assert.throws(()=>tinyNeuralGenerateCommand({variation}),/Seeded variation/);
  }
});

test("audition builds safe, finite one to three seed CPU commands without user shell injection",()=>{
  const command=tinyNeuralAuditionCommand({seeds:[12,13,14],seconds:4,
    stability:60,variation:8,profile:"square",quality:"high"});
  assert.equal(command,
    "python gpu-worker/audit_neural_video_variants.py --model ./eternyx-tiny-neural-model/model.json --output ./eternyx-tiny-neural-audition --seeds 12 13 14 --seconds 4 --profile square --quality high --stability 60 --variation 8");
  assert.equal(tinyNeuralAuditionCommand({seeds:[17],seconds:1}).includes("--seeds 17 --seconds 1"),true);
  assert.doesNotMatch(command,/curl|fetch|https?:\/\/|api_key/);
  for(const seeds of [[],[1,1],[1,2,3,4],[-1],[true],["10"],[2147483648],
                      ["1;rm -rf /"],null]){
    assert.throws(()=>tinyNeuralAuditionCommand({seeds}),/distinct/);
  }
  for(const seconds of [0,5,NaN,2.4,true]){
    assert.throws(()=>tinyNeuralAuditionCommand({seconds}),/Audition duration/);
  }
});

test("parse genuine local neural audition shape and candidate observations",()=>{
  const parsed=readTinyNeuralAudition(JSON.stringify(receipt));
  assert.deepEqual(parsed,receipt);
  assert.equal(parsed.candidates[0].temporal_frame_metrics.mean_temporal_absolute_delta,
               0.12345678);
  assert.equal(parsed.neural_network,true);
  assert.equal(parsed.text_to_video,false);
  assert.equal("realism_score" in parsed,false);
});

test("actual candidate MP4 size and SHA-256 match a specific seed and exact receipt",()=>{
  const parsed=readTinyNeuralAudition(JSON.stringify(receipt));
  const verified=matchTinyNeuralCandidate(parsed,{name:"video.mp4",size:12035,sha256:c});
  assert.equal(verified.matched,true);
  assert.equal(verified.candidate,"candidate-02");
  assert.equal(verified.seed,43);
  assert.equal(verified.frameCount,16);
  assert.equal(verified.temporalMetrics,metrics);
  for(const bad of [
    {name:"video.mp4",size:12035,sha256:a},
    {name:"video.mp4",size:12034,sha256:c},
    {name:"other.mp4",size:12035,sha256:c},
    {name:"video.mp4",size:0,sha256:c},
  ])assert.throws(()=>matchTinyNeuralCandidate(parsed,bad));
});

test("reject fake audition receipts and corrupted candidate source provenance",()=>{
  const mutations=[
    r=>{r.version=2;},
    r=>{r.neural_network=false;},
    r=>{r.text_to_video=true;},
    r=>{r.model_sha256="FAKE";},
    r=>{r.fps=30;},
    r=>{r.stability_percent=86;},
    r=>{r.variation_percent=-1;},
    r=>{r.seconds=5;},
    r=>{r.candidate_count=3;},
    r=>{r.candidates[0].file="../video.mp4";},
    r=>{r.candidates[0].candidate="candidate-99";},
    r=>{r.candidates[0].video_sha256="NOPE";},
    r=>{r.candidates[0].video_bytes=0;},
    r=>{r.candidates[0].width=0;},
    r=>{r.candidates[0].actual_decoded_frames=17;},
    r=>{r.candidates[0].temporal_frame_metrics.mean_temporal_absolute_delta=NaN;},
    r=>{r.candidates[0].temporal_frame_metrics.max_temporal_absolute_delta=0;},
    r=>{r.candidates[0].temporal_frame_metrics.identical_adjacent_frame_pairs=16;},
    r=>{r.candidates[1].sample_seed=42;},
  ];
  for(const change of mutations){
    const wrong=structuredClone(receipt);
    change(wrong);
    assert.throws(()=>readTinyNeuralAudition(JSON.stringify(wrong)));
  }
  for(const bad of [null,"{","[]"," ".repeat(32769)]){
    assert.throws(()=>readTinyNeuralAudition(bad));
  }
});

test("portrait high quality output dimensions validated against renderer contract",()=>{
  const high=structuredClone(receipt);
  high.profile="portrait";high.quality="high";
  for(const row of high.candidates){row.width=288;row.height=512;}
  assert.equal(readTinyNeuralAudition(JSON.stringify(high)).profile,"portrait");
  high.candidates[0].width=144;
  assert.throws(()=>readTinyNeuralAudition(JSON.stringify(high)),/candidate/);
});

test("UI exposes adjustable temporal controls and offline verified side-by-side MP4 playback",()=>{
  const studio=readFileSync(new URL("../src/components/TinyNeuralVideoStudio.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/NeuralVideoAudition.tsx",import.meta.url),"utf8");
  assert.match(studio,/<NeuralVideoAudition/);
  assert.match(studio,/Neural temporal stability/);
  assert.match(studio,/Neural frame variation/);
  assert.match(studio,/stability,variation/);
  assert.match(ui,/tinyNeuralAuditionCommand/);
  assert.match(ui,/readTinyNeuralAudition/);
  assert.match(ui,/matchTinyNeuralCandidate/);
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/<video controls playsInline/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/no.*quality|not automatically|quality/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob|requestAIJobEnqueue/);
});
