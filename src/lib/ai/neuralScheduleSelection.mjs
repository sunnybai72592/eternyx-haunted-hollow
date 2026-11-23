/** Genuine CPU neural v2 replay-rate selection with an INNER training-only validation split.
 * This only builds offline commands and verifies user-selected actual local bytes.
 */
export const SCHEDULE_LIMITS=Object.freeze({
  maxSources:3,minFrames:32,maxFrames:64,maxEpochs:2,maxSeconds:2,
  maxReportBytes:65536,maxModelBytes:131072,maxVideoBytes:64*1024*1024,
  mixOptions:Object.freeze([0,25,50,75,100]),maxSeed:2147483647,
});
const SHA=/^[a-f0-9]{64}$/;
const VIDEO=/^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
const finite=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
const integer=(v,lo,hi,name)=>{
  if(!Number.isSafeInteger(v)||v<lo||v>hi)
    throw new Error(name+" must be an integer "+lo+"–"+hi+".");
};
const mixCheck=mixes=>{
  if(!Array.isArray(mixes)||mixes.length<1||mixes.length>3||
     mixes.some(v=>!Number.isSafeInteger(v)||!SCHEDULE_LIMITS.mixOptions.includes(v))||
     new Set(mixes).size!==mixes.length)
    throw new Error("Choose 1–3 distinct replay percentages from 0,25,50,75,100.");
  return [...mixes].sort((a,b)=>a-b);
};
export function neuralScheduleCommand({
  mixes=[0,50,100],seed=42,epochs=1,seconds=1,stability=45,variation=6,
}={}){
  const selected=mixCheck(mixes);
  integer(seed,0,SCHEDULE_LIMITS.maxSeed,"Seed");
  integer(epochs,1,2,"Epochs");
  integer(seconds,1,2,"Seconds");
  integer(stability,0,85,"Stability");
  integer(variation,0,20,"Variation");
  return "python gpu-worker/select_neural_schedule.py --model ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-schedule"+
    selected.map(n=>" --mix "+n).join("")+
    " --seed "+seed+" --epochs "+epochs+" --seconds "+seconds+
    " --stability "+stability+" --variation "+variation;
}
export function neuralSchedulePaths(){
  return Object.freeze({
    report:"eternyx-neural-schedule/schedule-report.json",
    selectedModel:"eternyx-neural-schedule/selected-model/model.json",
    baseline:"eternyx-neural-schedule/base-sample/render/video.mp4",
    selected:"eternyx-neural-schedule/selected-sample/render/video.mp4",
    comparison:"eternyx-neural-schedule/comparison.mp4",
  });
}
export function readNeuralScheduleReport(raw){
  if(typeof raw!=="string"||
     new TextEncoder().encode(raw).length>SCHEDULE_LIMITS.maxReportBytes)
    throw new Error("Choose a real schedule-report.json no larger than 64 KiB.");
  let r;
  try{r=JSON.parse(raw);}catch{throw new Error("Invalid offline schedule JSON receipt.");}
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_neural_inner_prefix_schedule_selection"||
     r.neural_network!==true||r.text_to_video!==false||r.model_generation!==true||
     r.outer_holdout_used_for_selection!==false||
     !SHA.test(r.base_model_sha256)||!SHA.test(r.selected_model_sha256)||
     !SHA.test(r.base_weights_sha256)||!SHA.test(r.selected_weights_sha256)||
     typeof r.weights_changed!=="boolean"||
     r.weights_changed!==(r.base_weights_sha256!==r.selected_weights_sha256)||
     r.selected_model_file!=="selected-model/model.json"||
     !Array.isArray(r.sources)||!r.sources.length||
     r.sources.length>SCHEDULE_LIMITS.maxSources)
    throw new Error("Unsupported measured inner-only neural schedule selection receipt.");
  const names=new Set();
  for(const item of r.sources){
    if(!item||typeof item!=="object"||typeof item.file!=="string"||
       !VIDEO.test(item.file)||item.file.startsWith(".")||item.file.startsWith("~")||
       !SHA.test(item.sha256)||names.has(item.file.toLowerCase())||
       !Number.isSafeInteger(item.used_frames)||item.used_frames<32||item.used_frames>64||
       !Number.isSafeInteger(item.train_frames)||
       item.train_frames!==Math.max(7,Math.floor(item.used_frames*3/4))||
       !Number.isSafeInteger(item.holdout_frames)||item.holdout_frames<8||
       item.train_frames+item.holdout_frames!==item.used_frames)
      throw new Error("Original source provenance and split is invalid.");
    names.add(item.file.toLowerCase());
  }
  const strategy=r.strategy;
  if(!strategy||typeof strategy!=="object"||
     !Number.isSafeInteger(strategy.seed)||strategy.seed<0||
     strategy.seed>SCHEDULE_LIMITS.maxSeed||
     !Number.isSafeInteger(strategy.epochs)||strategy.epochs<1||
     strategy.epochs>SCHEDULE_LIMITS.maxEpochs||
     strategy.inner_validation_steps!==4||
     strategy.unchanged_base_allowed!==true||
     !finite(strategy.cpu_training_and_selection_seconds)||
     !Array.isArray(strategy.candidate_mixes)||
     !Array.isArray(strategy.candidates)||
     !Array.isArray(strategy.inner_splits)||
     strategy.inner_splits.length!==r.sources.length||
     !Number.isSafeInteger(strategy.refit_examples)||strategy.refit_examples<0||
     !Number.isSafeInteger(strategy.refit_teacher_examples)||
     strategy.refit_teacher_examples<0||
     strategy.refit_teacher_examples>strategy.refit_examples)
    throw new Error("Missing actual CPU candidate-selection evidence.");
  const sorted=mixCheck(strategy.candidate_mixes);
  if(strategy.candidate_mixes.join(",")!==sorted.join(",")||
     strategy.candidates.length!==sorted.length+1)
    throw new Error("Candidate count or deterministic replay order disagrees.");
  const sourcesByHash=new Set(r.sources.map(s=>s.sha256));
  for(const split of strategy.inner_splits){
    const source=r.sources.find(s=>s.sha256===split?.source_sha256);
    if(!source||!sourcesByHash.has(split.source_sha256)||
       split.original_training_prefix_end!==source.train_frames||
       split.inner_training_end!==source.train_frames-6||
       split.inner_validation_start!==source.train_frames-6||
       split.inner_validation_end_exclusive!==source.train_frames-2||
       split.outer_holdout_start!==source.train_frames)
      throw new Error("Inner validation overlaps original outer heldout or source split differs.");
  }
  const candidateZero=strategy.candidates[0];
  if(!candidateZero||candidateZero.name!=="unchanged_base"||
     candidateZero.mix_percent!==null||
     candidateZero.trained_on_inner_prefix!==false||
     candidateZero.optimizer_examples!==0)
    throw new Error("Unchanged base fallback is missing from the tested candidates.");
  let best=candidateZero.inner_four_step_mse,bestMix=null;
  for(const [index,entry] of strategy.candidates.entries()){
    const mix=index===0?null:sorted[index-1];
    if(!entry||entry.mix_percent!==mix||
       (index>0&&(entry.name!=="replay_"+mix||
         entry.trained_on_inner_prefix!==true||
         !Number.isSafeInteger(entry.optimizer_examples)||entry.optimizer_examples<1))||
       !finite(entry.inner_four_step_mse)||entry.inner_four_step_mse>1||
       !finite(entry.inner_static_mse)||entry.inner_static_mse>1||
       entry.evaluated_pixels!==r.sources.length*48*28*4||
       Math.abs(entry.inner_static_mse-candidateZero.inner_static_mse)>1e-8)
      throw new Error("Actual inner validation candidate results are malformed.");
    if(index>0&&entry.inner_four_step_mse<best-1e-8){
      best=entry.inner_four_step_mse;bestMix=mix;
    }
  }
  if(bestMix!==strategy.selected_mix_percent||
     strategy.refit_on_full_original_training_prefix!==(bestMix!==null)||
     (bestMix===null&&(r.weights_changed||strategy.refit_examples!==0))||
     (bestMix!==null&&(!r.weights_changed||strategy.refit_examples<1)))
    throw new Error("Reported chosen strategy disagrees with actual inner validation losses.");
  const outer=r.final_outer_audit;
  if(!outer||typeof outer!=="object"||
     !Array.isArray(outer.steps)||outer.steps.join(",")!=="1,4,8")
    throw new Error("Missing independent final outer holdout assessment.");
  for(const key of ["before","after"]){
    if(!outer[key]||typeof outer[key]!=="object")
      throw new Error("Final outer holdout has no before/after measured errors.");
    for(const horizon of [1,4,8]){
      const row=outer[key][String(horizon)];
      if(!row||row.steps!==horizon||
         row.evaluated_pixels!==r.sources.length*48*28*horizon||
         !finite(row.model_mse)||row.model_mse>1||
         !finite(row.static_baseline_mse)||row.static_baseline_mse>1)
        throw new Error("Outer rollout MSE is missing or not based on identical targets.");
    }
  }
  for(const h of [1,4,8]){
    if(outer.before[String(h)].static_baseline_mse!==
       outer.after[String(h)].static_baseline_mse)
      throw new Error("Original and chosen neural models have different outer holdout baselines.");
  }
  const sample=r.sampling;
  if(!sample||typeof sample!=="object"||
     !Number.isSafeInteger(sample.seconds)||sample.seconds<1||sample.seconds>2||
     sample.seed!==strategy.seed||
     !Number.isSafeInteger(sample.stability_percent)||
     sample.stability_percent<0||sample.stability_percent>85||
     !Number.isSafeInteger(sample.variation_percent)||
     sample.variation_percent<0||sample.variation_percent>20)
    throw new Error("Invalid real sample generation settings.");
  for(const label of ["base","selected"]){
    const item=r.artifacts?.[label];
    if(!item||item.file!==(label==="base"?"base-sample":"selected-sample")+
      "/render/video.mp4"||
       !SHA.test(item.sha256)||!Number.isSafeInteger(item.video_bytes)||
       item.video_bytes<1||item.video_bytes>SCHEDULE_LIMITS.maxVideoBytes||
       item.frame_count!==sample.seconds*16)
      throw new Error("Invalid actual v2 neural sample MP4 receipt.");
  }
  const combined=r.artifacts?.comparison;
  if(!combined||combined.file!=="comparison.mp4"||
     !SHA.test(combined.sha256)||combined.width!==512||
     combined.height!==144||combined.frame_count!==sample.seconds*16||
     !Number.isSafeInteger(combined.video_bytes)||combined.video_bytes<1||
     combined.video_bytes>SCHEDULE_LIMITS.maxVideoBytes)
    throw new Error("Invalid actual side-by-side H264 comparison receipt.");
  return r;
}
export function matchNeuralScheduleFile(report,file){
  if(!report||!file||!Number.isSafeInteger(file.size)||file.size<1||
     typeof file.sha256!=="string"||!SHA.test(file.sha256))
    throw new Error("Verify actual bounded local model or video bytes first.");
  if(file.name==="model.json"){
    if(file.size>SCHEDULE_LIMITS.maxModelBytes||
       file.sha256!==report.selected_model_sha256)
      throw new Error("Selected model SHA-256 does not match self-reported checkpoint.");
    return {kind:"model",matched:true,sha256:file.sha256};
  }
  const candidates=[
    {kind:"base",name:"video.mp4",entry:report.artifacts.base},
    {kind:"selected",name:"video.mp4",entry:report.artifacts.selected},
    {kind:"comparison",name:"comparison.mp4",entry:report.artifacts.comparison},
  ];
  const chosen=candidates.find(x=>file.name===x.name&&
    file.sha256===x.entry.sha256&&file.size===x.entry.video_bytes);
  if(!chosen)throw new Error("Actual MP4 hash or byte length does not match the local schedule receipt.");
  return {kind:chosen.kind,matched:true,sha256:file.sha256,
    frames:report.sampling.seconds*16,
    interpretation:"A self-reported local file match, not a signed or perceptual quality score."};
}
