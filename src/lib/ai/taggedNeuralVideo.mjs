/** Truly trained tiny neural v2 color/style tags, not natural-language text-to-video. */
const SHA=/^[a-f0-9]{64}$/;
const TAG=/^[a-z][a-z0-9_-]{1,23}$/;
const FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.mp4$/;
export const TAG_VIDEO_LIMITS=Object.freeze({
  sourceMin:2,sourceMax:3,maxEpochs:4,maxSeconds:3,maxSeed:2147483647,
  modelBytes:131072,reportBytes:65536,videoBytes:64*1024*1024,
});
function number(value,low,high,label){
  if(!Number.isSafeInteger(value)||value<low||value>high)
    throw new Error(label+" must be an integer "+low+"–"+high+".");
}
export function validateTagMappings(rows){
  if(!Array.isArray(rows)||rows.length<2||rows.length>3)
    throw new Error("Supply two or three local training video:tag mappings.");
  const files=new Set(),tags=new Set();
  for(const value of rows){
    if(!value||typeof value!=="object"||
       typeof value.file!=="string"||!FILE.test(value.file)||
       value.file.startsWith(".")||typeof value.tag!=="string"||
       !TAG.test(value.tag))
      throw new Error("Use safe video.mp4 filenames and 2–24-character lowercase tag names.");
    if(files.has(value.file.toLowerCase()))
      throw new Error("Each local video source must be listed once.");
    files.add(value.file.toLowerCase());
    tags.add(value.tag);
  }
  if(tags.size<2)throw new Error("At least two DISTINCT locally trained tags are required.");
  return rows.map(r=>({file:r.file,tag:r.tag}));
}
function chosenTag(value){
  if(typeof value!=="string"||!TAG.test(value))
    throw new Error("Choose a safe label trained from the user's local footage.");
  return value;
}
export function trainTaggedVideoCommand({sources=[
  {file:"sunrise.mp4",tag:"warm"},{file:"ocean.mp4",tag:"cool"},
],epochs=2,seed=42}={}){
  validateTagMappings(sources);
  number(epochs,1,4,"Training epochs");
  number(seed,0,TAG_VIDEO_LIMITS.maxSeed,"Training seed");
  return "python gpu-worker/train_tagged_neural_video.py train --base ./eternyx-neural-v2-model/model.json --input ./local-video-media --output ./eternyx-neural-style-tags"+
    sources.map(s=>" --file-tag "+s.file+":"+s.tag).join("")+
    " --epochs "+epochs+" --seed "+seed;
}
export function generateTaggedVideoCommand({tag="warm",seconds=2,seed=42,
  profile="landscape",quality="standard",stability=45,variation=6}={}){
  chosenTag(tag);
  number(seconds,1,3,"Sample seconds");
  number(seed,0,TAG_VIDEO_LIMITS.maxSeed,"Sample seed");
  number(stability,0,85,"Stability");
  number(variation,0,20,"Variation");
  if(!["landscape","portrait","square"].includes(profile)||
     !["standard","high"].includes(quality))
    throw new Error("Unsupported tag-video output preset.");
  return "python gpu-worker/train_tagged_neural_video.py generate --base ./eternyx-neural-v2-model/model.json --adapter ./eternyx-neural-style-tags/tag-model.json"+
    " --output ./eternyx-neural-tag-video --tag "+tag+" --seconds "+seconds+
    " --seed "+seed+" --profile "+profile+" --quality "+quality+
    " --stability "+stability+" --variation "+variation;
}
export function compareTaggedVideoCommand({firstTag="warm",secondTag="cool",
  seconds=1,seed=42}={}){
  chosenTag(firstTag);chosenTag(secondTag);
  if(firstTag===secondTag)throw new Error("Choose two distinct trained tags to compare.");
  number(seconds,1,3,"Comparison seconds");
  number(seed,0,TAG_VIDEO_LIMITS.maxSeed,"Comparison seed");
  return "python gpu-worker/train_tagged_neural_video.py compare --base ./eternyx-neural-v2-model/model.json --adapter ./eternyx-neural-style-tags/tag-model.json"+
    " --output ./eternyx-neural-tag-comparison --first-tag "+firstTag+
    " --second-tag "+secondTag+" --seconds "+seconds+" --seed "+seed;
}
export function taggedVideoPaths(){
  return Object.freeze({
    model:"eternyx-neural-style-tags/tag-model.json",
    training:"eternyx-neural-style-tags/training-report.json",
    rendered:"eternyx-neural-tag-video/render/video.mp4",
    generation:"eternyx-neural-tag-video/generation-report.json",
    comparison:"eternyx-neural-tag-comparison/comparison.mp4",
    comparisonReport:"eternyx-neural-tag-comparison/comparison-report.json",
  });
}
function parse(raw,limit){
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>limit)
    throw new Error("Local neural tag receipt must be bounded UTF-8 JSON.");
  try{return JSON.parse(raw);}catch{throw new Error("Invalid neural tag JSON receipt.");}
}
export function readTaggedTrainingReport(raw){
  const r=parse(raw,TAG_VIDEO_LIMITS.reportBytes);
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.kind!=="cpu_neural_tag_training"||r.version!==1||
     r.neural_network!==true||r.text_to_video!==false||
     r.frozen_base_weights!==true||
     !SHA.test(r.base_model_sha256)||!SHA.test(r.tag_model_sha256)||
     !Array.isArray(r.tags)||r.tags.length<2||r.tags.length>3||
     new Set(r.tags).size!==r.tags.length||
     r.tags.some(t=>typeof t!=="string"||!TAG.test(t))||
     !Array.isArray(r.file_tags)||r.file_tags.length<2||r.file_tags.length>3||
     !r.metrics||typeof r.metrics!=="object"||
     typeof r.training_seconds!=="number"||!Number.isFinite(r.training_seconds)||
     r.training_seconds<0)
    throw new Error("Unsupported learned local neural tag training report.");
  const used=new Set();
  const sourceByLabel=new Map(r.tags.map(t=>[t,0]));
  for(const row of r.file_tags){
    if(!row||typeof row!=="object"||
       typeof row.file!=="string"||!FILE.test(row.file)||
       used.has(row.file.toLowerCase())||!r.tags.includes(row.tag)||
       !SHA.test(row.sha256)||typeof row.rights_ref!=="string"||
       !row.rights_ref.trim()||row.rights_ref.length>180||
       !Number.isSafeInteger(row.used_frames)||row.used_frames<32||row.used_frames>64||
       !Number.isSafeInteger(row.train_frames)||
       row.train_frames!==Math.floor(row.used_frames*3/4)||
       row.holdout_frames!==row.used_frames-row.train_frames||
       row.holdout_frames<8)
      throw new Error("Invalid reviewed local training tag source or temporal split.");
    used.add(row.file.toLowerCase());
    sourceByLabel.set(row.tag,sourceByLabel.get(row.tag)+1);
  }
  for(const label of r.tags){
    const score=r.metrics[label];
    if(sourceByLabel.get(label)<1||!score||typeof score!=="object"||
       score.source_count!==sourceByLabel.get(label)||
       !Number.isSafeInteger(score.train_examples)||score.train_examples<1||
       !Number.isSafeInteger(score.holdout_examples)||score.holdout_examples<1||
       !["train_mse_before","train_mse_after","holdout_style_mse",
         "holdout_frozen_base_mse"].every(key=>
           typeof score[key]==="number"&&Number.isFinite(score[key])&&
           score[key]>=0&&score[key]<=1))
      throw new Error("Missing actually measured tag-specific training and holdout errors.");
  }
  return r;
}
export function matchTaggedAdapter(report,file){
  if(!report||!file||file.name!=="tag-model.json"||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>TAG_VIDEO_LIMITS.modelBytes||
     typeof file.sha256!=="string"||file.sha256!==report.tag_model_sha256)
    throw new Error("Actual tag-model.json SHA-256 does not match the selected training receipt.");
  return {matched:true,labels:report.tags,sha256:file.sha256,
    interpretation:"Actual local checkpoint hash matches its self-reported training receipt, not signed authenticity."};
}
export function readTaggedComparisonReport(raw){
  const r=parse(raw,TAG_VIDEO_LIMITS.reportBytes);
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!==1||r.kind!=="cpu_neural_tag_comparison"||
     r.neural_network!==true||r.text_to_video!==false||
     !SHA.test(r.base_model_sha256)||!SHA.test(r.tag_model_sha256)||
     !Array.isArray(r.tags)||r.tags.length!==2||
     !TAG.test(r.tags[0])||!TAG.test(r.tags[1])||r.tags[0]===r.tags[1]||
     !Number.isSafeInteger(r.seed)||r.seed<0||r.seed>TAG_VIDEO_LIMITS.maxSeed||
     !Number.isSafeInteger(r.seconds)||r.seconds<1||r.seconds>3||
     !Array.isArray(r.candidates)||r.candidates.length!==2)
    throw new Error("Unsupported real two-tag neural comparison receipt.");
  for(const [index,row] of r.candidates.entries()){
    if(!row||row.tag!==r.tags[index]||
       row.file!=="candidate-"+String(index+1).padStart(2,"0")+"/render/video.mp4"||
       !SHA.test(row.sha256)||!SHA.test(row.raw_rgb_sha256)||
       !Number.isSafeInteger(row.video_bytes)||row.video_bytes<1||
       row.video_bytes>TAG_VIDEO_LIMITS.videoBytes||
       row.frame_count!==r.seconds*16)
      throw new Error("Invalid actual local tag candidate MP4 evidence.");
  }
  const pair=r.comparison;
  if(!pair||pair.file!=="comparison.mp4"||
     !SHA.test(pair.sha256)||pair.width!==512||pair.height!==144||
     pair.frame_count!==r.seconds*16||
     !Number.isSafeInteger(pair.video_bytes)||pair.video_bytes<1||
     pair.video_bytes>TAG_VIDEO_LIMITS.videoBytes)
    throw new Error("Invalid actual side-by-side tag H264 evidence.");
  return r;
}
export function matchTaggedComparisonVideo(report,file){
  if(!report||!file||!["video.mp4","comparison.mp4"].includes(file.name)||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>TAG_VIDEO_LIMITS.videoBytes||
     typeof file.sha256!=="string"||!SHA.test(file.sha256))
    throw new Error("Choose and hash an actual bounded local tag comparison MP4.");
  const candidates=[
    ...report.candidates.map(row=>({kind:row.tag,name:"video.mp4",data:row})),
    {kind:"comparison",name:"comparison.mp4",data:report.comparison},
  ];
  const result=candidates.find(row=>row.name===file.name&&
    row.data.sha256===file.sha256&&row.data.video_bytes===file.size);
  if(!result)throw new Error("Actual tag sample MP4 hash/size does not match the report.");
  return {matched:true,kind:result.kind,sha256:file.sha256,
    frames:report.seconds*16,
    interpretation:"File matched by local SHA-256 and size; not a semantic-quality score."};
}
