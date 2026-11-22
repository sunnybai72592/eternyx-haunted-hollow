/** Browser-only commands and receipt checks for an ACTUAL trained tiny CPU neural video MLP.
 * No browser inference or uploads. Files are model JSON from local Python.
 */
export const TINY_NEURAL_LIMITS = Object.freeze({
  maxSources:8, maxSeconds:8, maxSeed:2147483647, maxEpochs:4,
  maxReportBytes:65536, maxModelBytes:128*1024,
});
export const TINY_NEURAL_PROFILES = Object.freeze(["landscape","portrait","square"]);
export const TINY_NEURAL_QUALITIES = Object.freeze(["standard","high"]);
const RIGHTS = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const NO_PATHS = /^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
function integer(value,low,high,name) {
  if(!Number.isSafeInteger(value) || value<low || value>high)
    throw new Error(name+" must be an integer "+low+"–"+high+".");
  return value;
}
export function tinyNeuralTrainingCommand({rightsRef="owner-reviewed-local-video",seed=42,epochs=3}={}) {
  if(typeof rightsRef!=="string" || !RIGHTS.test(rightsRef)) {
    throw new Error("Use a shell-safe rights reference of 1–80 letters, digits, hyphens or underscores.");
  }
  integer(seed,0,TINY_NEURAL_LIMITS.maxSeed,"Training seed");
  integer(epochs,1,TINY_NEURAL_LIMITS.maxEpochs,"Training epochs");
  return "python gpu-worker/train_tiny_neural_video.py train --input ./local-video-media --output ./eternyx-tiny-neural-model --rights-ref "+
    rightsRef+" --seed "+seed+" --epochs "+epochs;
}
export function tinyNeuralGenerateCommand({seconds=2,seed=42,profile="landscape",quality="standard"}={}) {
  integer(seconds,1,TINY_NEURAL_LIMITS.maxSeconds,"Sample duration");
  integer(seed,0,TINY_NEURAL_LIMITS.maxSeed,"Sample seed");
  if(!TINY_NEURAL_PROFILES.includes(profile)||!TINY_NEURAL_QUALITIES.includes(quality))
    throw new Error("Choose a supported output profile and quality.");
  return "python gpu-worker/train_tiny_neural_video.py generate --model ./eternyx-tiny-neural-model/model.json --output ./eternyx-tiny-neural-sample --seconds "+
    seconds+" --seed "+seed+" --profile "+profile+" --quality "+quality;
}
export function tinyNeuralOutputPaths(){
  return Object.freeze({
    model:"eternyx-tiny-neural-model/model.json",
    training:"eternyx-tiny-neural-model/training-report.json",
    sample:"eternyx-tiny-neural-sample/clip-01.mp4",
    video:"eternyx-tiny-neural-sample/render/video.mp4",
    manifest:"eternyx-tiny-neural-sample/render/manifest.json",
    report:"eternyx-tiny-neural-sample/generation-report.json",
  });
}
const measured=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
export function readTinyNeuralReport(raw) {
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>TINY_NEURAL_LIMITS.maxReportBytes)
    throw new Error("Training receipt must be UTF-8 JSON up to 64 KiB.");
  let result;
  try {result=JSON.parse(raw);}catch{throw new Error("Choose a valid neural training-report.json.");}
  const a=result?.architecture;
  if(!result||typeof result!=="object"||Array.isArray(result)||
     result.kind!=="cpu_tiny_neural_video_training"||result.version!==1||
     result.neural_network!==true||result.text_to_video!==false||
     !SHA256.test(result.model_sha256)||
     !a||a.type!=="one_hidden_layer_autoregressive_pixel_mlp"||
     a.inputs!==12||a.hidden!==12||a.outputs!==3||
     !Array.isArray(a.activations)||a.activations.join(",")!=="tanh,sigmoid"||
     !Array.isArray(result.training_sources)||
     result.training_source_count!==result.training_sources.length||
     result.training_source_count<1||result.training_source_count>TINY_NEURAL_LIMITS.maxSources||
     !Number.isSafeInteger(result.seed)||result.seed<0||result.seed>TINY_NEURAL_LIMITS.maxSeed||
     !Number.isSafeInteger(result.epochs)||result.epochs<1||result.epochs>TINY_NEURAL_LIMITS.maxEpochs){
    throw new Error("Unsupported genuine tiny CPU neural training receipt.");
  }
  const names=new Set();
  for(const row of result.training_sources){
    if(!row||typeof row!=="object"||
       typeof row.file!=="string"||!NO_PATHS.test(row.file)||
       row.file.startsWith(".")||row.file.startsWith("~")||
       !SHA256.test(row.sha256)||
       typeof row.rights_ref!=="string"||!row.rights_ref.trim()||row.rights_ref.length>180||
       !Number.isSafeInteger(row.decoded_frames)||row.decoded_frames<8||
       !Number.isSafeInteger(row.used_frames)||row.used_frames<8||row.used_frames>64||
       !Number.isSafeInteger(row.train_frames)||row.train_frames<6||
       !Number.isSafeInteger(row.holdout_frames)||row.holdout_frames<1||
       row.train_frames+row.holdout_frames!==row.used_frames){
       throw new Error("Invalid source provenance or temporal train/holdout split.");
    }
    const key=row.file.toLowerCase();
    if(names.has(key))throw new Error("Duplicate training input file.");
    names.add(key);
  }
  const m=result.metrics;
  if(!m||typeof m!=="object"||
     !Number.isSafeInteger(m.train_examples)||m.train_examples<1||
     !Number.isSafeInteger(m.holdout_examples)||m.holdout_examples<1||
     !["training_mse_before","training_mse_after","holdout_neural_mse","holdout_persistence_baseline_mse"].every(key=>measured(m[key])))
    throw new Error("Missing measured neural training/holdout MSE metrics.");
  return result;
}
export function verifyTinyNeuralCheckpoint(report,file) {
  if(!report||!file||file.name!=="model.json"||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>TINY_NEURAL_LIMITS.maxModelBytes||
     typeof file.sha256!=="string"||!SHA256.test(file.sha256)||
     file.sha256!==report.model_sha256)
    throw new Error("Neural model SHA-256 or size does not match its local training receipt.");
  return {
    checksumMatched:true,modelSha256:file.sha256,
    sourceCount:report.training_source_count,
    trainMseBefore:report.metrics.training_mse_before,
    trainMseAfter:report.metrics.training_mse_after,
    holdoutNeuralMse:report.metrics.holdout_neural_mse,
    holdoutBaselineMse:report.metrics.holdout_persistence_baseline_mse,
    interpretation:"Small neural next-frame pixel predictor. These are empirical errors, not realism or authenticity scores.",
  };
}
