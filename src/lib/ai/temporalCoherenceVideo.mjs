/** CPU-only data-selected motion continuity for an existing genuine neural style. */
export const COHERENCE_LIMITS=Object.freeze({
  maxSeconds:3,maxSeed:2147483647,maxReportBytes:65536,
  maxProfileBytes:65536,maxVideoBytes:64*1024*1024,
  options:Object.freeze([[0,0],[25,25],[50,25],[25,50]]),
});
const SHA=/^[a-f0-9]{64}$/;
const TAG=/^[a-z][a-z0-9_-]{1,23}$/;
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
function bounded(v,min,max,name){
  if(!Number.isSafeInteger(v)||v<min||v>max)
    throw new Error(name+" must be a whole number "+min+"–"+max+".");
}
export function temporalCoherenceCommand({tag="warm",seconds=1,seed=42,
  strength=75,stability=45,variation=6}={}){
  if(typeof tag!=="string"||!TAG.test(tag))
    throw new Error("Choose an existing, shell-safe learned tag.");
  bounded(seconds,1,3,"Sample seconds");
  bounded(seed,0,COHERENCE_LIMITS.maxSeed,"Seed");
  bounded(strength,0,100,"Motion strength");
  bounded(stability,0,85,"Stability");
  bounded(variation,0,20,"Variation");
  return "python gpu-worker/select_temporal_coherence.py"+
    " --base ./eternyx-neural-v2-model/model.json"+
    " --tag-model ./eternyx-neural-style-tags/tag-model.json"+
    " --motion-model ./eternyx-neural-spatial-motion/motion-model.json"+
    " --input ./local-video-media --output ./eternyx-neural-temporal-coherence"+
    " --tag "+tag+" --seconds "+seconds+" --seed "+seed+
    " --strength "+strength+" --stability "+stability+
    " --variation "+variation;
}
export function temporalCoherencePaths(){
  return Object.freeze({
    report:"eternyx-neural-temporal-coherence/selection-report.json",
    profile:"eternyx-neural-temporal-coherence/selection-profile.json",
    base:"eternyx-neural-temporal-coherence/baseline/render/video.mp4",
    selected:"eternyx-neural-temporal-coherence/coherent/render/video.mp4",
    split:"eternyx-neural-temporal-coherence/comparison.mp4",
  });
}
function parse(raw,bytes){
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>bytes)
    throw new Error("Choose a local JSON receipt no larger than 64 KiB.");
  try{return JSON.parse(raw);}catch{throw new Error("Invalid real motion coherence receipt JSON.");}
}
function hashes(data){
  return SHA.test(data?.base_model_sha256)&&SHA.test(data?.tag_model_sha256)&&
    SHA.test(data?.motion_model_sha256);
}
function metric(row,frames,sourceCount){
  if(!row||typeof row!=="object"||row.steps!==frames||
     row.observations!==frames*sourceCount*12||
     !["predicted_warp_mae","zero_shift_mae","shift_accuracy",
       "temporal_jitter","spatial_disagreement","selection_objective"]
       .every(k=>finite(row[k])&&row[k]<=2)||
     row.shift_accuracy>1||
     Math.abs(row.selection_objective-
       (row.predicted_warp_mae+.02*row.temporal_jitter+
        .01*row.spatial_disagreement))>2e-8)
    throw new Error("Measured temporal/spatial motion evidence is malformed.");
}
function validateSelection(s,sources){
  if(!s||typeof s!=="object"||s.tag===undefined||
     s.baseline_allowed!==true||s.training_only_selection!==true||
     s.inner_steps!==4||!Array.isArray(s.split_provenance)||
     s.split_provenance.length!==sources.length||
     !Array.isArray(s.candidates)||s.candidates.length!==4||
     s.objective?.warp_mae_coefficient!==1||
     s.objective?.temporal_jitter_coefficient!==.02||
     s.objective?.spatial_disagreement_coefficient!==.01)
    throw new Error("Inner-prefix-only motion selection evidence is missing.");
  const sourceHashes=new Set(sources);
  const seen=new Set();
  for(const source of s.split_provenance){
    if(!source||!sourceHashes.has(source.source_sha256)||
       seen.has(source.source_sha256)||
       !Number.isSafeInteger(source.outer_holdout_start)||
       source.outer_holdout_start<24||source.outer_holdout_start>48||
       source.inner_training_end!==source.outer_holdout_start-6||
       source.inner_validation_start!==source.inner_training_end||
       source.inner_validation_end_exclusive!==source.inner_training_end+4||
       source.inner_validation_end_exclusive>=source.outer_holdout_start)
      throw new Error("Inner validation boundary touches or misreports unseen heldout footage.");
    seen.add(source.source_sha256);
  }
  let best=Infinity,selected=[0,0];
  const baseline=s.candidates[0]?.inner;
  for(const [i,candidate] of s.candidates.entries()){
    const [t,n]=COHERENCE_LIMITS.options[i];
    if(!candidate||
       candidate.temporal_percent!==t||
       candidate.neighbor_percent!==n)
      throw new Error("A motion candidate was changed, reordered, or invented.");
    metric(candidate.inner,4,sources.length);
    if(i===0){
      best=baseline.selection_objective;
    }else{
      if(candidate.inner.zero_shift_mae!==baseline.zero_shift_mae)
        throw new Error("Motion candidates were not measured against the same inner static baseline.");
      if(candidate.inner.predicted_warp_mae<=baseline.predicted_warp_mae+1e-8&&
         candidate.inner.selection_objective<best-1e-6){
        best=candidate.inner.selection_objective;
        selected=[t,n];
      }
    }
  }
  if(s.selected_temporal_percent!==selected[0]||
     s.selected_neighbor_percent!==selected[1])
    throw new Error("Chosen motion smoothing does not follow actual inner-validation scores.");
}
export function readTemporalCoherenceReport(raw){
  const r=parse(raw,COHERENCE_LIMITS.maxReportBytes);
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_neural_tagged_temporal_coherence_audit"||
     r.neural_motion_classifier!==true||r.text_to_video!==false||
     !hashes(r)||!SHA.test(r.selection_profile_sha256)||
     typeof r.tag!=="string"||!TAG.test(r.tag)||
     !Array.isArray(r.source_sha256)||r.source_sha256.length<1||
     r.source_sha256.length>3||
     new Set(r.source_sha256).size!==r.source_sha256.length||
     r.source_sha256.some(x=>!SHA.test(x))||
     !finite(r.cpu_selection_seconds)||!finite(r.cpu_render_seconds))
    throw new Error("Unsupported genuine CPU temporal-coherence selection report.");
  validateSelection(r.selection,r.source_sha256);
  if(r.selection.tag!==r.tag)
    throw new Error("Selected motion label does not match actual training tag.");
  const audit=r.final_outer_audit;
  if(!audit||typeof audit!=="object"||
     audit.no_outer_selection!==true||
     !Array.isArray(audit.steps)||audit.steps.join(",")!=="1,4,8")
    throw new Error("Unseen outer motion evaluation must not be used for selection.");
  for(const horizon of [1,4,8]){
    const before=audit.baseline?.[String(horizon)];
    const after=audit.selected?.[String(horizon)];
    metric(before,horizon,r.source_sha256.length);
    metric(after,horizon,r.source_sha256.length);
    if(before.zero_shift_mae!==after.zero_shift_mae)
      throw new Error("Outer comparison had different real motion targets.");
  }
  const setting=r.sampling;
  if(!setting||typeof setting!=="object"||
     !Number.isSafeInteger(setting.seconds)||setting.seconds<1||setting.seconds>3||
     !Number.isSafeInteger(setting.seed)||setting.seed<0||
     setting.seed>COHERENCE_LIMITS.maxSeed||
     !Number.isSafeInteger(setting.strength)||setting.strength<0||setting.strength>100||
     !Number.isSafeInteger(setting.stability)||setting.stability<0||setting.stability>85||
     !Number.isSafeInteger(setting.variation)||setting.variation<0||setting.variation>20)
    throw new Error("Unsupported sampled video controls in CPU motion audit.");
  for(const version of ["baseline","coherent"]){
    const video=r.artifacts?.[version];
    if(!video||video.file!==version+"/render/video.mp4"||
       !SHA.test(video.sha256)||!SHA.test(video.raw_rgb_sha256)||
       !Number.isSafeInteger(video.video_bytes)||
       video.video_bytes<1||video.video_bytes>COHERENCE_LIMITS.maxVideoBytes||
       video.frame_count!==setting.seconds*16)
      throw new Error("Actual base/coherent neural MP4 provenance is invalid.");
  }
  const pair=r.artifacts?.comparison;
  if(!pair||pair.file!=="comparison.mp4"||!SHA.test(pair.sha256)||
     !Number.isSafeInteger(pair.video_bytes)||pair.video_bytes<1||
     pair.video_bytes>COHERENCE_LIMITS.maxVideoBytes||
     pair.width!==512||pair.height!==144||
     pair.frame_count!==setting.seconds*16)
    throw new Error("Actual paired H264 video provenance is invalid.");
  return r;
}
export function matchTemporalCoherenceFile(report,file){
  if(!report||!file||
     !Number.isSafeInteger(file.size)||file.size<1||
     typeof file.sha256!=="string"||!SHA.test(file.sha256))
    throw new Error("Choose an actual bounded local selection profile or MP4 file.");
  if(file.name==="selection-profile.json"){
    if(file.size>COHERENCE_LIMITS.maxProfileBytes||
       file.sha256!==report.selection_profile_sha256)
      throw new Error("Actual selected coherence profile SHA-256 differs.");
    return {kind:"profile",matched:true,sha256:file.sha256};
  }
  if(file.size>COHERENCE_LIMITS.maxVideoBytes)
    throw new Error("Video exceeds the local 64 MiB comparison limit.");
  const candidates=[
    {kind:"baseline",name:"video.mp4",source:report.artifacts.baseline},
    {kind:"coherent",name:"video.mp4",source:report.artifacts.coherent},
    {kind:"comparison",name:"comparison.mp4",source:report.artifacts.comparison},
  ];
  const match=candidates.find(c=>file.name===c.name&&
    file.sha256===c.source.sha256&&file.size===c.source.video_bytes);
  if(!match)
    throw new Error("Actual MP4 SHA-256 and size differ from the selection report.");
  return {kind:match.kind,matched:true,sha256:file.sha256,
    frames:report.sampling.seconds*16,
    note:"Self-attested local file integrity; not signed rights or a quality ranking."};
}
