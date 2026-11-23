/** Offline neural 4x3 learned local motion, never external video/model uploads. */
export const SPATIAL_MOTION_LIMITS=Object.freeze({
  maxEpochs:4,maxSeconds:2,maxSeed:2147483647,maxStrength:100,
  modelBytes:131072,reportBytes:65536,videoBytes:64*1024*1024,
});
const TAG=/^[a-z][a-z0-9_-]{1,23}$/;
const SHA=/^[0-9a-f]{64}$/;
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
function bounded(v,lo,hi,desc){
  if(!Number.isSafeInteger(v)||v<lo||v>hi)
    throw new Error(desc+" must be a whole number from "+lo+" to "+hi+".");
}
function checkTag(value){
  if(typeof value!=="string"||!TAG.test(value))
    throw new Error("Enter an actually trained lowercase local style label.");
}
export function spatialMotionTrainCommand({epochs=2,seed=42}={}){
  bounded(epochs,1,4,"Training epochs");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Training seed");
  return "python gpu-worker/train_spatial_motion_video.py train --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --input ./local-video-media --output ./eternyx-neural-spatial-motion --epochs "+epochs+" --seed "+seed;
}
export function spatialMotionGenerateCommand({
  tag="warm",seconds=1,seed=42,strength=85,stability=45,variation=6,
}={}){
  checkTag(tag);
  bounded(seconds,1,2,"Duration");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Seed");
  bounded(strength,0,100,"Spatial motion strength");
  bounded(stability,0,85,"Temporal stability");
  bounded(variation,0,20,"Seeded variation");
  return "python gpu-worker/train_spatial_motion_video.py generate --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --motion ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-neural-spatial-video --tag "+
    tag+" --seconds "+seconds+" --seed "+seed+" --strength "+strength+
    " --stability "+stability+" --variation "+variation;
}
export function spatialMotionCompareCommand({tag="warm",seconds=1,seed=42,strength=85}={}){
  checkTag(tag);
  bounded(seconds,1,2,"Duration");
  bounded(seed,0,SPATIAL_MOTION_LIMITS.maxSeed,"Seed");
  bounded(strength,0,100,"Spatial motion strength");
  return "python gpu-worker/train_spatial_motion_video.py compare --base ./eternyx-neural-v2-model/model.json --tags ./eternyx-neural-style-tags/tag-model.json --motion ./eternyx-neural-spatial-motion/motion-model.json --output ./eternyx-neural-spatial-comparison --tag "+
    tag+" --seconds "+seconds+" --seed "+seed+" --strength "+strength;
}
export function spatialMotionPaths(){
  return Object.freeze({
    model:"eternyx-neural-spatial-motion/motion-model.json",
    training:"eternyx-neural-spatial-motion/training-report.json",
    generated:"eternyx-neural-spatial-video/render/video.mp4",
    comparison:"eternyx-neural-spatial-comparison/comparison.mp4",
    comparisonReport:"eternyx-neural-spatial-comparison/comparison-report.json",
  });
}
function json(raw){
  if(typeof raw!=="string"||
     new TextEncoder().encode(raw).length>SPATIAL_MOTION_LIMITS.reportBytes)
    throw new Error("Choose bounded local spatial motion JSON (≤64 KiB).");
  try{return JSON.parse(raw);}catch{throw new Error("Invalid spatial motion JSON.");}
}
export function readSpatialMotionTraining(raw){
  const report=json(raw);
  if(!report||typeof report!=="object"||Array.isArray(report)||
     report.version!==1||report.kind!=="cpu_neural_tag_motion_training"||
     report.neural_network!==true||report.text_to_video!==false||
     !SHA.test(report.base_model_sha256)||!SHA.test(report.tag_model_sha256)||
     !SHA.test(report.motion_model_sha256)||
     !Array.isArray(report.labels)||report.labels.length<2||report.labels.length>3||
     new Set(report.labels).size!==report.labels.length||
     report.labels.some(label=>typeof label!=="string"||!TAG.test(label))||
     !report.metrics||typeof report.metrics!=="object"||
     !report.source_sha256_by_tag||typeof report.source_sha256_by_tag!=="object"||
     !Number.isSafeInteger(report.epochs)||report.epochs<1||report.epochs>4||
     !Number.isSafeInteger(report.seed)||report.seed<0||
     report.seed>SPATIAL_MOTION_LIMITS.maxSeed||
     !finite(report.training_seconds))
    throw new Error("Unsupported genuine local spatial neural motion training receipt.");
  if(Object.keys(report.metrics).sort().join(",")!==[...report.labels].sort().join(",")||
     Object.keys(report.source_sha256_by_tag).sort().join(",")!==
        [...report.labels].sort().join(","))
    throw new Error("Motion statistics have missing or invented tags.");
  for(const tag of report.labels){
    const m=report.metrics[tag],heldout=m?.heldout;
    const sources=report.source_sha256_by_tag[tag];
    if(!m||!heldout||!Array.isArray(sources)||
       sources.length<1||sources.length>3||
       sources.some(sha=>typeof sha!=="string"||!SHA.test(sha))||
       m.source_count!==sources.length||
       !Number.isSafeInteger(m.training_tiles)||m.training_tiles<1||
       !Number.isSafeInteger(heldout.evaluated_tiles)||heldout.evaluated_tiles<1||
       !finite(m.train_cross_entropy_before)||
       !finite(m.train_cross_entropy_after)||
       !finite(heldout.cross_entropy)||
       !["classifier_accuracy","stationary_baseline_accuracy",
         "training_majority_baseline_accuracy"].every(k=>finite(heldout[k])&&heldout[k]<=1))
      throw new Error("No genuine source-specific motion train/holdout metrics.");
  }
  return report;
}
export function matchSpatialMotionModel(report,file){
  if(!report||!file||file.name!=="motion-model.json"||
     !Number.isSafeInteger(file.size)||file.size<1||
     file.size>SPATIAL_MOTION_LIMITS.modelBytes||
     typeof file.sha256!=="string"||file.sha256!==report.motion_model_sha256)
    throw new Error("Actual spatial motion model SHA-256 does not match its local training report.");
  return {matched:true,labels:report.labels,sha256:file.sha256};
}
export function readSpatialMotionComparison(raw){
  const report=json(raw);
  if(!report||typeof report!=="object"||Array.isArray(report)||
     report.version!==1||report.kind!=="cpu_neural_spatial_motion_comparison"||
     report.neural_network!==true||report.text_to_video!==false||
     !SHA.test(report.base_model_sha256)||!SHA.test(report.tag_model_sha256)||
     !SHA.test(report.motion_model_sha256)||
     typeof report.tag!=="string"||!TAG.test(report.tag)||
     !Number.isSafeInteger(report.seconds)||report.seconds<1||report.seconds>2||
     !Number.isSafeInteger(report.seed)||report.seed<0||
     report.seed>SPATIAL_MOTION_LIMITS.maxSeed||
     !Number.isSafeInteger(report.strength)||report.strength<0||report.strength>100)
    throw new Error("Unsupported spatial motion comparison receipt.");
  const a=report.artifacts;
  for(const version of ["global","spatial"]){
    const row=a?.[version];
    if(!row||row.file!==(version==="global"?"global-motion":"spatial-motion")+
       "/render/video.mp4"||
       !SHA.test(row.sha256)||!Number.isSafeInteger(row.video_bytes)||
       row.video_bytes<1||row.video_bytes>SPATIAL_MOTION_LIMITS.videoBytes||
       row.frame_count!==report.seconds*16)
      throw new Error("Missing actual global/spatial H264 evidence.");
  }
  const pair=a?.comparison;
  if(!pair||pair.file!=="comparison.mp4"||!SHA.test(pair.sha256)||
     !Number.isSafeInteger(pair.video_bytes)||pair.video_bytes<1||
     pair.video_bytes>SPATIAL_MOTION_LIMITS.videoBytes||
     pair.width!==512||pair.height!==144||
     pair.frame_count!==report.seconds*16)
    throw new Error("Invalid actual FFmpeg side-by-side motion video.");
  return report;
}
export function matchSpatialMotionVideo(report,file){
  if(!report||!file||!["video.mp4","comparison.mp4"].includes(file.name)||
     !Number.isSafeInteger(file.size)||file.size<1||
     file.size>SPATIAL_MOTION_LIMITS.videoBytes||
     typeof file.sha256!=="string"||!SHA.test(file.sha256))
    throw new Error("Choose a real bounded local MP4 and compute SHA-256.");
  const possible=[
    {kind:"global",name:"video.mp4",row:report.artifacts.global},
    {kind:"spatial",name:"video.mp4",row:report.artifacts.spatial},
    {kind:"comparison",name:"comparison.mp4",row:report.artifacts.comparison},
  ];
  const matched=possible.find(item=>item.name===file.name&&
     item.row.sha256===file.sha256&&item.row.video_bytes===file.size);
  if(!matched)throw new Error("Selected local video bytes do not match motion comparison SHA-256.");
  return {kind:matched.kind,matched:true,sha256:file.sha256,
    frames:report.seconds*16,
    interpretation:"Local self-reported MP4 integrity, not a trusted signature or perceptual quality score."};
}
