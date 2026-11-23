/** Offline 4x3 per-tag learned motion; strictly data-driven, not dense optical flow/T2V. */
export const SPATIAL_MOTION_LIMITS=Object.freeze({
  modelBytes:131072,videoBytes:64*1024*1024,reportBytes:65536,
  maxSeed:2147483647,maxSeconds:3,maxEpochs:4,maxTags:3,
});
const SHA=/^[a-f0-9]{64}$/;
const TAG=/^[a-z][a-z0-9_-]{1,23}$/;
const FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.mp4$/;
function bounded(x,a,b,label){
  if(!Number.isSafeInteger(x)||x<a||x>b)
    throw new Error(label+" must be a whole number "+a+"–"+b+".");
}
function label(value){
  if(typeof value!=="string"||!TAG.test(value))
    throw new Error("Select a safe, already trained local style label.");
  return value;
}
function base(){
  return "--base ./eternyx-neural-v2-model/model.json --tag-model ./eternyx-neural-style-tags/tag-model.json";
}
export function trainSpatialMotionCommand({epochs=2,seed=42}={}){
  bounded(epochs,1,4,"Motion epochs");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Training seed");
  return "python gpu-worker/learn_tagged_spatial_motion.py train "+
    base()+" --input ./local-video-media --output ./eternyx-neural-spatial-motion"+
    " --epochs "+epochs+" --seed "+seed;
}
export function generateSpatialMotionCommand({
  tag="warm",seconds=2,seed=42,strength=75,stability=45,variation=6,
  seededMotion=false,profile="landscape",quality="standard",
}={}){
  label(tag);
  bounded(seconds,1,3,"Video seconds");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Video seed");
  bounded(strength,0,100,"Spatial motion strength");
  bounded(stability,0,85,"Temporal stability");
  bounded(variation,0,20,"Seeded variation");
  if(typeof seededMotion!=="boolean")throw new Error("Motion mode must be deterministic or seeded.");
  if(!["landscape","portrait","square"].includes(profile)||
     !["standard","high"].includes(quality))
    throw new Error("Select a supported H264 output profile and quality.");
  return "python gpu-worker/learn_tagged_spatial_motion.py generate "+
    base()+" --motion-model ./eternyx-neural-spatial-motion/motion-model.json"+
    " --output ./eternyx-spatial-motion-video --tag "+tag+
    " --seconds "+seconds+" --seed "+seed+" --strength "+strength+
    " --stability "+stability+" --variation "+variation+
    (seededMotion?" --seeded-motion":"")+
    " --profile "+profile+" --quality "+quality;
}
export function compareSpatialMotionCommand({
  first="warm",second="cool",seconds=1,seed=42,strength=75,
}={}){
  label(first);label(second);
  if(first===second)throw new Error("Compare two DISTINCT trained local motion tags.");
  bounded(seconds,1,3,"Comparison seconds");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Comparison seed");
  bounded(strength,0,100,"Spatial motion strength");
  return "python gpu-worker/learn_tagged_spatial_motion.py compare "+
    base()+" --motion-model ./eternyx-neural-spatial-motion/motion-model.json"+
    " --output ./eternyx-spatial-motion-compare --first "+first+
    " --second "+second+" --seconds "+seconds+
    " --seed "+seed+" --strength "+strength;
}
export function spatialMotionPaths(){
  return Object.freeze({
    model:"eternyx-neural-spatial-motion/motion-model.json",
    training:"eternyx-neural-spatial-motion/training-report.json",
    video:"eternyx-spatial-motion-video/render/video.mp4",
    generation:"eternyx-spatial-motion-video/generation-report.json",
    comparison:"eternyx-spatial-motion-compare/comparison.mp4",
    comparisonReport:"eternyx-spatial-motion-compare/comparison-report.json",
  });
}
function parse(raw){
  if(typeof raw!=="string"||
     new TextEncoder().encode(raw).length>SPATIAL_MOTION_LIMITS.reportBytes)
    throw new Error("Choose a bounded local JSON receipt (64 KiB maximum).");
  try{return JSON.parse(raw);}catch{throw new Error("Invalid local spatial-motion JSON.");}
}
const goodHash=x=>typeof x==="string"&&SHA.test(x);
const positive=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
function provenance(r){
  return goodHash(r?.base_model_sha256)&&goodHash(r?.tag_model_sha256)&&
    goodHash(r?.motion_model_sha256);
}
export function readSpatialMotionTraining(raw){
  const r=parse(raw);
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_tagged_spatial_motion_training"||
     r.neural_motion_classifier!==true||r.text_to_video!==false||
     !provenance(r)||
     r.architecture!=="4x3_tiles_9_motion_classes_4_features_softmax"||
     !Array.isArray(r.tags)||r.tags.length<2||r.tags.length>3||
     new Set(r.tags).size!==r.tags.length||
     r.tags.some(t=>typeof t!=="string"||!TAG.test(t))||
     !Array.isArray(r.source_files)||r.source_files.length<2||
     r.source_files.length>3||!r.metrics||
     typeof r.metrics!=="object"||!positive(r.training_seconds))
    throw new Error("Unsupported actual per-tag CPU spatial-motion training receipt.");
  const seen=new Set(),count=new Map(r.tags.map(t=>[t,0]));
  for(const row of r.source_files){
    if(!row||typeof row!=="object"||
       typeof row.file!=="string"||!FILE.test(row.file)||
       seen.has(row.file.toLowerCase())||
       !count.has(row.tag)||!goodHash(row.sha256)||
       !Number.isSafeInteger(row.train_frames)||row.train_frames<18||
       !Number.isSafeInteger(row.holdout_frames)||row.holdout_frames<8||
       row.train_frames+row.holdout_frames>64)
      throw new Error("Motion source differs from locally approved video split.");
    count.set(row.tag,count.get(row.tag)+1);
    seen.add(row.file.toLowerCase());
  }
  for(const tag of r.tags){
    const m=r.metrics[tag],h=m?.heldout;
    if(!count.get(tag)||!m||m.source_count!==count.get(tag)||
       !Number.isSafeInteger(m.training_observations)||
       m.training_observations<1||
       !["training_ce_before","training_ce_after"].every(k=>positive(m[k])&&m[k]<30)||
       !["training_accuracy_before","training_accuracy_after"].every(k=>
         positive(m[k])&&m[k]<=1)||
       !h||!Number.isSafeInteger(h.observations)||h.observations<1||
       !positive(h.free_running_motion_cross_entropy)||
       h.free_running_motion_cross_entropy>=30||
       !positive(h.free_running_shift_accuracy)||h.free_running_shift_accuracy>1||
       !positive(h.predicted_warp_frame_mae)||h.predicted_warp_frame_mae>1||
       !positive(h.zero_shift_frame_mae)||h.zero_shift_frame_mae>1)
      throw new Error("Missing real tag-specific training and unseen-motion evaluation metrics.");
  }
  return r;
}
export function matchSpatialMotionModel(report,file){
  if(!report||!file||file.name!=="motion-model.json"||
     !Number.isSafeInteger(file.size)||file.size<1||
     file.size>SPATIAL_MOTION_LIMITS.modelBytes||
     typeof file.sha256!=="string"||file.sha256!==report.motion_model_sha256)
    throw new Error("Actual motion-model.json SHA-256 differs from its training report.");
  return {matched:true,tags:report.tags,sha256:file.sha256};
}
export function readSpatialMotionGeneration(raw){
  const r=parse(raw),m=r?.temporal_diagnostics;
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_tagged_spatial_motion_sample"||
     r.neural_motion_classifier!==true||r.text_to_video!==false||
     !provenance(r)||typeof r.tag!=="string"||!TAG.test(r.tag)||
     r.fps!==16||r.width!==48||r.height!==28||
     !Number.isSafeInteger(r.seconds)||r.seconds<1||r.seconds>3||
     !Number.isSafeInteger(r.seed)||r.seed<0||r.seed>SPATIAL_MOTION_LIMITS.maxSeed||
     !Number.isSafeInteger(r.motion_strength_percent)||
     r.motion_strength_percent<0||r.motion_strength_percent>100||
     !["argmax","seeded"].includes(r.motion_sampling)||
     !Number.isSafeInteger(r.stability_percent)||
     r.stability_percent<0||r.stability_percent>85||
     !Number.isSafeInteger(r.variation_percent)||
     r.variation_percent<0||r.variation_percent>20||
     !["landscape","portrait","square"].includes(r.profile)||
     !["standard","high"].includes(r.quality)||
     !goodHash(r.raw_rgb_sha256)||!goodHash(r.source_clip_sha256)||
     !goodHash(r.video_sha256)||
     !Number.isSafeInteger(r.video_bytes)||r.video_bytes<1||
     r.video_bytes>SPATIAL_MOTION_LIMITS.videoBytes||
     r.frame_count!==r.seconds*16||m?.frame_count!==r.frame_count||
     !positive(m.mean_adjacent_rgb_delta)||m.mean_adjacent_rgb_delta>1||
     !positive(m.max_adjacent_rgb_delta)||m.max_adjacent_rgb_delta>1||
     !Number.isSafeInteger(m.identical_adjacent_pairs)||
     m.identical_adjacent_pairs<0||m.identical_adjacent_pairs>=m.frame_count)
    throw new Error("Malformed actual H264 neural spatial-motion sample receipt.");
  return r;
}
export function readSpatialMotionComparison(raw){
  const r=parse(raw);
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_tagged_spatial_motion_comparison"||
     r.neural_motion_classifier!==true||r.text_to_video!==false||
     !provenance(r)||
     !Array.isArray(r.tags)||r.tags.length!==2||
     r.tags.some(x=>typeof x!=="string"||!TAG.test(x))||
     r.tags[0]===r.tags[1]||
     !Number.isSafeInteger(r.seconds)||r.seconds<1||r.seconds>3||
     !Number.isSafeInteger(r.seed)||r.seed<0||r.seed>SPATIAL_MOTION_LIMITS.maxSeed||
     !Number.isSafeInteger(r.motion_strength_percent)||
     r.motion_strength_percent<0||r.motion_strength_percent>100||
     !Array.isArray(r.candidates)||r.candidates.length!==2)
    throw new Error("Unsupported genuine spatial-motion two-tag comparison report.");
  for(const [i,row] of r.candidates.entries()){
    if(!row||typeof row!=="object"||
       row.tag!==r.tags[i]||
       row.file!=="candidate-"+String(i+1).padStart(2,"0")+"/render/video.mp4"||
       !goodHash(row.sha256)||!goodHash(row.raw_rgb_sha256)||
       !Number.isSafeInteger(row.video_bytes)||row.video_bytes<1||
       row.video_bytes>SPATIAL_MOTION_LIMITS.videoBytes||
       row.frame_count!==r.seconds*16)
      throw new Error("Invalid actual tag-conditioned spatial video source receipt.");
  }
  const pair=r.comparison;
  if(!pair||pair.file!=="comparison.mp4"||
     !goodHash(pair.sha256)||
     !Number.isSafeInteger(pair.video_bytes)||pair.video_bytes<1||
     pair.video_bytes>SPATIAL_MOTION_LIMITS.videoBytes||
     pair.width!==512||pair.height!==144||
     pair.frame_count!==r.seconds*16)
    throw new Error("Invalid actual spatial-motion paired MP4 receipt.");
  return r;
}
export function matchSpatialMotionVideo(report,file){
  if(!report||!file||!["video.mp4","comparison.mp4"].includes(file.name)||
     !Number.isSafeInteger(file.size)||file.size<1||
     file.size>SPATIAL_MOTION_LIMITS.videoBytes||
     typeof file.sha256!=="string"||!goodHash(file.sha256))
    throw new Error("Choose a bounded actual MP4 and compute its local SHA-256.");
  let candidates;
  if(report.kind==="cpu_tagged_spatial_motion_sample"){
    candidates=[{kind:report.tag,filename:"video.mp4",
      hash:report.video_sha256,bytes:report.video_bytes}];
  }else if(report.kind==="cpu_tagged_spatial_motion_comparison"){
    candidates=[
      ...report.candidates.map(row=>({kind:row.tag,filename:"video.mp4",
        hash:row.sha256,bytes:row.video_bytes})),
      {kind:"comparison",filename:"comparison.mp4",
        hash:report.comparison.sha256,bytes:report.comparison.video_bytes},
    ];
  }else throw new Error("Unknown real spatial-motion video report kind.");
  const match=candidates.find(x=>x.filename===file.name&&x.hash===file.sha256&&
    x.bytes===file.size);
  if(!match)throw new Error("Selected MP4 does not match the local spatial-motion hash and size receipt.");
  return {matched:true,kind:match.kind,sha256:file.sha256,
    frames:report.seconds*16};
}
