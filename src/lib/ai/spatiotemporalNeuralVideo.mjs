/** Offline 48x28 two-frame neural video v2: bounded local CLI and report checks.
 * No trained model or source media is uploaded or run in the browser.
 */
export const V2_LIMITS=Object.freeze({
  fps:16,learnedWidth:48,learnedHeight:28,maxSources:8,maxFrames:64,
  maxEpochs:4,maxSeconds:8,maxSeed:2147483647,maxReportBytes:65536,
  maxModelBytes:131072,maxVideoBytes:64*1024*1024,
});
const HASH=/^[a-f0-9]{64}$/;
const RIGHTS=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const FILE=/^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
const PROFILE=["landscape","portrait","square"];
const QUALITY=["standard","high"];
function whole(value,low,high,label) {
  if(!Number.isSafeInteger(value)||value<low||value>high)
    throw new Error(label+" must be a whole number from "+low+" to "+high+".");
}
function preset(profile,quality) {
  if(!PROFILE.includes(profile)||!QUALITY.includes(quality))
    throw new Error("Unsupported output preset.");
}
export function spatiotemporalTrainCommand({rightsRef="owner-reviewed-video",seed=42,epochs=2}={}){
  if(typeof rightsRef!=="string"||!RIGHTS.test(rightsRef))
    throw new Error("Enter a shell-safe footage rights reference (1–80 characters).");
  whole(seed,0,V2_LIMITS.maxSeed,"Training seed");
  whole(epochs,1,V2_LIMITS.maxEpochs,"Training epochs");
  return "python gpu-worker/train_spatiotemporal_neural_video.py train --input ./local-video-media --output ./eternyx-neural-v2-model --rights-ref "+
    rightsRef+" --seed "+seed+" --epochs "+epochs;
}
export function spatiotemporalGenerateCommand({
  seconds=2,seed=42,profile="landscape",quality="standard",stability=45,variation=6,
}={}){
  whole(seconds,1,V2_LIMITS.maxSeconds,"Sample seconds");
  whole(seed,0,V2_LIMITS.maxSeed,"Sample seed");
  whole(stability,0,85,"Temporal stability");
  whole(variation,0,20,"Temporal variation");
  preset(profile,quality);
  return "python gpu-worker/train_spatiotemporal_neural_video.py generate --model ./eternyx-neural-v2-model/model.json --output ./eternyx-neural-v2-video --seconds "+
    seconds+" --seed "+seed+" --profile "+profile+" --quality "+quality+
    " --stability "+stability+" --variation "+variation;
}
export function spatiotemporalOutputPaths(){
  return Object.freeze({
    checkpoint:"eternyx-neural-v2-model/model.json",
    trainingReport:"eternyx-neural-v2-model/training-report.json",
    sourceClip:"eternyx-neural-v2-video/clip-01.mp4",
    finishedMp4:"eternyx-neural-v2-video/render/video.mp4",
    renderManifest:"eternyx-neural-v2-video/render/manifest.json",
    generationReport:"eternyx-neural-v2-video/generation-report.json",
  });
}
const mse=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
function parse(raw){
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>V2_LIMITS.maxReportBytes)
    throw new Error("V2 local receipt must be UTF-8 JSON under 64 KiB.");
  try{return JSON.parse(raw);}
  catch{throw new Error("Choose a valid neural v2 JSON receipt.");}
}
export function readSpatiotemporalTrainingReport(raw){
  const r=parse(raw),a=r?.architecture,m=r?.metrics;
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.kind!=="cpu_neural_spatiotemporal_training"||r.version!==2||
     r.neural_network!==true||r.text_to_video!==false||
     !HASH.test(r.model_sha256)||
     r.width!==48||r.height!==28||r.fps!==16||
     !a||a.type!=="two_frame_neighborhood_mlp"||a.inputs!==24||
     a.hidden!==16||a.outputs!==3||
     !Array.isArray(a.activations)||a.activations.join(",")!=="tanh,sigmoid"||
     !Number.isSafeInteger(r.seed)||r.seed<0||r.seed>V2_LIMITS.maxSeed||
     !Number.isSafeInteger(r.epochs)||r.epochs<1||r.epochs>4||
     !Array.isArray(r.training_sources)||r.training_sources.length<1||
     r.training_sources.length>8||r.training_source_count!==r.training_sources.length)
    throw new Error("Unsupported genuine two-frame CPU neural training receipt.");
  const names=new Set();
  for(const source of r.training_sources){
    if(!source||typeof source!=="object"||typeof source.file!=="string"||
       !FILE.test(source.file)||source.file.startsWith(".")||source.file.startsWith("~")||
       !HASH.test(source.sha256)||
       typeof source.rights_ref!=="string"||!source.rights_ref.trim()||source.rights_ref.length>180||
       !Number.isSafeInteger(source.decoded_frames)||source.decoded_frames<9||
       !Number.isSafeInteger(source.used_frames)||source.used_frames<9||source.used_frames>64||
       !Number.isSafeInteger(source.train_frames)||source.train_frames<7||
       !Number.isSafeInteger(source.holdout_frames)||source.holdout_frames<1||
       source.train_frames+source.holdout_frames!==source.used_frames||
       names.has(source.file.toLowerCase()))
      throw new Error("Invalid training footage provenance or temporal holdout split.");
    names.add(source.file.toLowerCase());
  }
  if(!m||typeof m!=="object"||
     !Number.isSafeInteger(m.training_examples)||m.training_examples<1||
     !Number.isSafeInteger(m.holdout_examples)||m.holdout_examples<1||
     !Number.isSafeInteger(m.rollout_evaluated_pixels)||m.rollout_evaluated_pixels<1||
     !["training_mse_before","training_mse_after","one_step_holdout_mse",
        "one_step_persistence_mse","four_step_rollout_mse",
        "four_step_static_baseline_mse"].every(key=>mse(m[key])))
    throw new Error("Missing measured one-step and causal multi-step evaluation metrics.");
  return r;
}
export function matchSpatiotemporalCheckpoint(report,file){
  if(!report||!file||file.name!=="model.json"||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>V2_LIMITS.maxModelBytes||
     typeof file.sha256!=="string"||file.sha256!==report.model_sha256)
    throw new Error("Actual v2 model bytes do not match local training report SHA-256.");
  return {
    matched:true,sources:report.training_source_count,modelSha256:file.sha256,
    before:report.metrics.training_mse_before,
    after:report.metrics.training_mse_after,
    oneStep:report.metrics.one_step_holdout_mse,
    oneStepBaseline:report.metrics.one_step_persistence_mse,
    rollout:report.metrics.four_step_rollout_mse,
    rolloutBaseline:report.metrics.four_step_static_baseline_mse,
    interpretation:"Observed predictive errors; lower values are not guaranteed perceived video quality.",
  };
}
export function readSpatiotemporalGenerationReport(raw){
  const r=parse(raw),m=r?.temporal_metrics;
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.kind!=="cpu_neural_spatiotemporal_sample"||r.version!==2||
     r.neural_network!==true||r.text_to_video!==false||
     r.model_generation!==true||r.fps!==16||
     r.width!==48||r.height!==28||
     !HASH.test(r.model_sha256)||!HASH.test(r.raw_frames_sha256)||
     !HASH.test(r.final_mp4_sha256)||!HASH.test(r.sample_clip_sha256)||
     !HASH.test(r.storyboard_sha256)||
     !Number.isSafeInteger(r.seconds)||r.seconds<1||r.seconds>8||
     !Number.isSafeInteger(r.sample_seed)||r.sample_seed<0||
     r.sample_seed>V2_LIMITS.maxSeed||
     !Number.isSafeInteger(r.stability_percent)||r.stability_percent<0||
     r.stability_percent>85||
     !Number.isSafeInteger(r.variation_percent)||r.variation_percent<0||
     r.variation_percent>20||!PROFILE.includes(r.profile)||!QUALITY.includes(r.quality)||
     !m||m.frame_count!==r.seconds*16||
     !mse(m.mean_adjacent_rgb_delta)||m.mean_adjacent_rgb_delta>1||
     !mse(m.max_adjacent_rgb_delta)||m.max_adjacent_rgb_delta>1||
     m.max_adjacent_rgb_delta<m.mean_adjacent_rgb_delta||
     !Number.isSafeInteger(m.identical_adjacent_pairs)||
     m.identical_adjacent_pairs<0||m.identical_adjacent_pairs>=m.frame_count)
    throw new Error("Unsupported or malformed real neural v2 generated-video receipt.");
  return r;
}
export function matchSpatiotemporalVideo(report,file){
  if(!report||!file||file.name!=="video.mp4"||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>V2_LIMITS.maxVideoBytes||
     typeof file.sha256!=="string"||file.sha256!==report.final_mp4_sha256)
    throw new Error("Actual finished MP4 SHA-256 does not match v2 report.");
  return {matched:true,sha256:file.sha256,frames:report.seconds*16,
    meanAdjacentRgbDelta:report.temporal_metrics.mean_adjacent_rgb_delta,
    interpretation:"Matching locally self-reported MP4 bytes; not signed provenance or quality certification."};
}
