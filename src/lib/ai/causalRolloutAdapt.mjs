/** Local CPU rollout adaptation and independent before/after evidence; no uploads. */
export const ROLLOUT_LIMITS=Object.freeze({
  maxSources:3,minFrames:32,maxEpochs:3,
  maxSeed:2147483647,maxSeconds:2,maxReportBytes:65536,
  maxVideoBytes:64*1024*1024,maxModelBytes:131072,
});
const SHA=/^[0-9a-f]{64}$/;
const FILE=/^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
const number=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
function whole(value,low,high,name){
  if(!Number.isSafeInteger(value)||value<low||value>high)
    throw new Error(name+" must be an integer "+low+"–"+high+".");
}
export function rolloutAdaptCommand({
  epochs=1,mixPercent=50,seed=42,seconds=1,stability=45,variation=6,
}={}){
  whole(epochs,1,3,"Adaptation epochs");
  whole(mixPercent,0,100,"Teacher replay percent");
  whole(seed,0,ROLLOUT_LIMITS.maxSeed,"Adaptation seed");
  whole(seconds,1,2,"Sample seconds");
  whole(stability,0,85,"Temporal stability");
  whole(variation,0,20,"Temporal variation");
  return "python gpu-worker/adapt_neural_rollout.py --model ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-causal-adaptation"+
    " --epochs "+epochs+" --mix-percent "+mixPercent+
    " --seed "+seed+" --seconds "+seconds+
    " --stability "+stability+" --variation "+variation;
}
export function rolloutAdaptPaths(){
  return Object.freeze({
    report:"eternyx-neural-causal-adaptation/adaptation-report.json",
    adaptedModel:"eternyx-neural-causal-adaptation/adapted-model/model.json",
    baseline:"eternyx-neural-causal-adaptation/baseline/render/video.mp4",
    adapted:"eternyx-neural-causal-adaptation/adapted/render/video.mp4",
    comparison:"eternyx-neural-causal-adaptation/comparison.mp4",
  });
}
export function readRolloutAdaptReport(raw){
  if(typeof raw!=="string"||
     new TextEncoder().encode(raw).length>ROLLOUT_LIMITS.maxReportBytes)
    throw new Error("Choose a local adaptation-report.json no larger than 64 KiB.");
  let r;
  try{r=JSON.parse(raw);}catch{throw new Error("Invalid real neural adaptation JSON.");}
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_neural_causal_rollout_adaptation"||
     r.neural_network!==true||r.text_to_video!==false||
     r.model_generation!==true||
     !SHA.test(r.base_model_sha256)||!SHA.test(r.adapted_model_sha256)||
     r.adapted_model_sha256===r.base_model_sha256||
     r.adapted_model_file!=="adapted-model/model.json"||
     !Array.isArray(r.sources)||r.sources.length<1||
     r.sources.length>3||r.training_source_count!==r.sources.length)
    throw new Error("Unsupported genuine CPU v2 causal rollout report.");
  const sourceNames=new Set();
  for(const source of r.sources){
    if(!source||typeof source!=="object"||
       typeof source.file!=="string"||!FILE.test(source.file)||
       source.file.startsWith(".")||source.file.startsWith("~")||
       !SHA.test(source.sha256)||sourceNames.has(source.file.toLowerCase())||
       !Number.isSafeInteger(source.decoded_frames)||source.decoded_frames<32||
       !Number.isSafeInteger(source.used_frames)||source.used_frames<32||source.used_frames>64||
       !Number.isSafeInteger(source.training_prefix_frames)||
       source.training_prefix_frames!==Math.max(7,Math.floor(source.used_frames*3/4))||
       !Number.isSafeInteger(source.holdout_frames)||source.holdout_frames<8||
       source.holdout_frames+source.training_prefix_frames!==source.used_frames)
      throw new Error("Invalid original training source identity or held-out split.");
    sourceNames.add(source.file.toLowerCase());
  }
  const t=r.training;
  if(!t||typeof t!=="object"||
     !Number.isSafeInteger(t.epochs)||t.epochs<1||t.epochs>3||
     !Number.isSafeInteger(t.seed)||t.seed<0||t.seed>ROLLOUT_LIMITS.maxSeed||
     !Number.isSafeInteger(t.teacher_replay_percent)||
     t.teacher_replay_percent<0||t.teacher_replay_percent>100||
     t.free_running_depth!==3||t.no_holdout_training!==true||
     !Number.isSafeInteger(t.total_examples)||t.total_examples<1||
     !Number.isSafeInteger(t.teacher_examples)||t.teacher_examples<0||
     t.teacher_examples>t.total_examples||
     !Array.isArray(t.causal_anchors)||t.causal_anchors.length<1||
     t.causal_anchors.length>ROLLOUT_LIMITS.maxSources*9||
     !number(t.training_seconds)||t.learning_rate!==0.055)
    throw new Error("Missing bounded causal training-prefix evidence.");
  for(const anchor of t.causal_anchors){
    if(!anchor||typeof anchor!=="object"||!SHA.test(anchor.source_sha256)||
       !r.sources.some(s=>s.sha256===anchor.source_sha256)||
       !Number.isSafeInteger(anchor.anchor)||anchor.anchor<2||anchor.anchor>=64||
       !Number.isSafeInteger(anchor.depth)||anchor.depth<1||anchor.depth>3)
      throw new Error("Invalid causal adaptation anchors.");
  }
  const e=r.evaluation;
  if(!e||typeof e!=="object"||e.resolution!=="48x28"||
     !Array.isArray(e.steps)||e.steps.join(",")!=="1,4,8"||
     !number(e.one_step_teacher_forced_baseline_mse)||
     !number(e.one_step_teacher_forced_adapted_mse)||
     !number(e.static_one_step_mse))
    throw new Error("Causal evaluation must show real one-, four- and eight-step metrics.");
  for(const k of ["baseline","adapted"]){
    if(!e[k]||typeof e[k]!=="object")
      throw new Error("Missing actual baseline or adapted model metrics.");
    for(const step of [1,4,8]){
      const row=e[k][String(step)];
      if(!row||row.steps!==step||
         row.evaluated_pixels!==r.sources.length*48*28*step||
         !number(row.model_mse)||row.model_mse>1||
         !number(row.static_baseline_mse)||row.static_baseline_mse>1)
        throw new Error("Malformed heldout causal rollout error measurements.");
    }
  }
  for(const step of [1,4,8]){
    if(e.baseline[String(step)].static_baseline_mse!==
       e.adapted[String(step)].static_baseline_mse)
      throw new Error("Evaluation baseline differs across identical heldout targets.");
  }
  const sampling=r.sampling;
  if(!sampling||typeof sampling!=="object"||
     !Number.isSafeInteger(sampling.seconds)||
     sampling.seconds<1||sampling.seconds>2||
     sampling.seed!==t.seed||
     !Number.isSafeInteger(sampling.stability_percent)||
     sampling.stability_percent<0||sampling.stability_percent>85||
     !Number.isSafeInteger(sampling.variation_percent)||
     sampling.variation_percent<0||sampling.variation_percent>20)
    throw new Error("Invalid reported real video sampling controls.");
  const a=r.artifacts;
  if(!a||typeof a!=="object")
    throw new Error("No actual adaptation H264 media evidence.");
  for(const name of ["baseline","adapted"]){
    const item=a[name];
    if(!item||typeof item!=="object"||
       item.file!==name+"/render/video.mp4"||
       !SHA.test(item.sha256)||
       !Number.isSafeInteger(item.video_bytes)||item.video_bytes<1||
       item.video_bytes>ROLLOUT_LIMITS.maxVideoBytes||
       item.frame_count!==sampling.seconds*16)
      throw new Error("Invalid base/adapted H264 media receipt.");
  }
  if(!a.comparison||a.comparison.file!=="comparison.mp4"||
     !SHA.test(a.comparison.sha256)||
     !Number.isSafeInteger(a.comparison.video_bytes)||
     a.comparison.video_bytes<1||
     a.comparison.video_bytes>ROLLOUT_LIMITS.maxVideoBytes||
     a.comparison.width!==512||a.comparison.height!==144||
     a.comparison.frame_count!==sampling.seconds*16)
    throw new Error("Invalid actual side-by-side comparison MP4 receipt.");
  return r;
}
export function matchRolloutAdaptFile(report,file){
  if(!report||!file||
     !Number.isSafeInteger(file.size)||file.size<1||
     typeof file.sha256!=="string"||!SHA.test(file.sha256))
    throw new Error("Choose real local model/MP4 bytes and compute SHA-256.");
  if(file.name==="model.json"){
    if(file.size>ROLLOUT_LIMITS.maxModelBytes||
       file.sha256!==report.adapted_model_sha256)
      throw new Error("Selected adapted model does not match reported SHA-256.");
    return {kind:"model",matched:true,sha256:file.sha256};
  }
  const candidates=[
    {kind:"baseline",filename:"video.mp4",data:report.artifacts.baseline},
    {kind:"adapted",filename:"video.mp4",data:report.artifacts.adapted},
    {kind:"comparison",filename:"comparison.mp4",data:report.artifacts.comparison},
  ];
  const matched=candidates.find(x=>file.name===x.filename&&
    file.sha256===x.data.sha256&&file.size===x.data.video_bytes);
  if(!matched)throw new Error("Selected actual video bytes do not match any self-attested adaptation receipt.");
  return {kind:matched.kind,matched:true,sha256:file.sha256,
    frames:report.sampling.seconds*16,
    interpretation:"Local self-attested bytes, not a visual-quality score or signed source ownership."};
}
