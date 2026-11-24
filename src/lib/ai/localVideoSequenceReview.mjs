/** Honest on-device export readiness and cross-shot preview plan.
 * Checks the actual existing v2 storyboard contract; it does not pretend
 * browser metadata proves FFmpeg's exact CFR frames or media ownership.
 */
import {buildLocalVideoBoard,checkLocalMediaName,LOCAL_VIDEO_LIMITS,
  LOCAL_VIDEO_PROFILES,LOCAL_VIDEO_QUALITIES,localVideoFps} from "./localVideoEditor.mjs";
import {timelineSegments,timelineSeek} from "./localVideoTimeline.mjs";

const HASH=/^[a-f0-9]{64}$/;
const printable=(x)=>typeof x==="string"&&!/[\x00-\x1f\x7f]/.test(x);
const issue=(code,message,shot=null)=>({code,message,shot});
function validMedia(record,kind){
  try{
    checkLocalMediaName(record?.name,kind);
    const max=kind==="audio"?LOCAL_VIDEO_LIMITS.maxAudioBytes:LOCAL_VIDEO_LIMITS.maxSourceBytes;
    return Number.isSafeInteger(record.size)&&record.size>=1&&record.size<=max&&
      typeof record.sha256==="string"&&HASH.test(record.sha256);
  }catch{return false;}
}
export function auditLocalVideoExport({
  sources=[],shots=[],soundtrack=null,profile="landscape",quality="standard",
}={}){
  if(!Array.isArray(sources)||!Array.isArray(shots))
    throw new Error("Expected editable shot and media arrays.");
  const fps=quality==="cinematic"?24:16,sourceLimit=60*fps,timelineLimit=30*fps;
  const errors=[],warnings=[],rows=[];
  if(!sources.length||sources.length>LOCAL_VIDEO_LIMITS.maxClips)
    errors.push(issue("SOURCE_COUNT","Choose 1–8 original MP4 source files."));
  if(!shots.length||shots.length>LOCAL_VIDEO_LIMITS.maxClips)
    errors.push(issue("SHOT_COUNT","Create 1–8 actual video cuts."));
  const byName=new Map(),caseNames=new Set();
  for(const source of sources){
    if(!validMedia(source,"video")){
      errors.push(issue("SOURCE_INVALID","One source MP4 lacks safe name, size or SHA-256."));
      continue;
    }
    const lower=source.name.toLowerCase();
    if(caseNames.has(lower))errors.push(issue("DUPLICATE_SOURCE","Original MP4 filenames collide."));
    caseNames.add(lower);byName.set(source.name,source);
  }
  let frames=0;
  shots.forEach((shot,index)=>{
    const reasons=[];
    const add=(code,message)=>{
      errors.push(issue(code,message,index));
      reasons.push({code,message});
    };
    if(!shot||typeof shot!=="object"||Array.isArray(shot)){
      add("SHOT_INVALID","Cut "+(index+1)+" has no editable data.");
      rows.push({index,sourceName:"",startFrame:null,frames:null,
        caption:"",rightsRef:"",issues:reasons});
      return;
    }
    if(typeof shot.sourceName!=="string"||!byName.has(shot.sourceName))
      add("SHOT_SOURCE","Cut "+(index+1)+" references a missing or unverified MP4.");
    if(!Number.isSafeInteger(shot.startFrame)||shot.startFrame<0||shot.startFrame>sourceLimit||
       !Number.isSafeInteger(shot.frames)||shot.frames<1||
       shot.frames>timelineLimit||
       shot.startFrame+shot.frames>sourceLimit)
      add("SHOT_FRAME_RANGE","Cut "+(index+1)+" requires a valid original frame range.");
    else frames+=shot.frames;
    if(!printable(shot.caption)||!shot.caption.trim()||shot.caption.length>180)
      add("CAPTION","Cut "+(index+1)+" needs a human-written caption (1–180 printable characters).");
    if(!printable(shot.rightsRef)||!shot.rightsRef.trim()||shot.rightsRef.length>180)
      add("RIGHTS","Cut "+(index+1)+" needs a recording/permission reference.");
    const maxFade=Number.isSafeInteger(shot.frames)&&shot.frames>0?
      Math.min(16,Math.floor(shot.frames/2)):0;
    if(!Number.isSafeInteger(shot.fadeInFrames)||shot.fadeInFrames<0||
       shot.fadeInFrames>maxFade||
       !Number.isSafeInteger(shot.fadeOutFrames)||shot.fadeOutFrames<0||
       shot.fadeOutFrames>maxFade)
      add("FADE","Cut "+(index+1)+" has fade lengths outside its actual duration.");
    rows.push({index,sourceName:typeof shot.sourceName==="string"?shot.sourceName:"",
      startFrame:Number.isSafeInteger(shot.startFrame)?shot.startFrame:null,
      frames:Number.isSafeInteger(shot.frames)?shot.frames:null,
      caption:typeof shot.caption==="string"?shot.caption:"",
      rightsRef:typeof shot.rightsRef==="string"?shot.rightsRef:"",
      issues:reasons});
  });
  if(frames>timelineLimit)
    errors.push(issue("TOTAL_FRAMES","The edited timeline exceeds 30 seconds / "+timelineLimit+" frames."));
  if(!LOCAL_VIDEO_PROFILES.includes(profile)||!LOCAL_VIDEO_QUALITIES.includes(quality))
    errors.push(issue("OUTPUT_PROFILE","Choose a supported output shape and quality."));
  if(soundtrack){
    if(!validMedia(soundtrack,"audio"))
      errors.push(issue("AUDIO_INVALID","The original soundtrack lacks a valid filename, size or SHA-256."));
    if(!printable(soundtrack.rightsRef)||!soundtrack.rightsRef.trim()||
       soundtrack.rightsRef.length>180)
      errors.push(issue("AUDIO_RIGHTS","The soundtrack requires a license/recording reference."));
    if(!Number.isSafeInteger(soundtrack.volumePercent)||
       soundtrack.volumePercent<0||soundtrack.volumePercent>100)
      errors.push(issue("AUDIO_VOLUME","Soundtrack volume must be 0–100%."));
    if(typeof soundtrack.name==="string"&&caseNames.has(soundtrack.name.toLowerCase()))
      errors.push(issue("AUDIO_COLLISION","Soundtrack filename collides with a source MP4."));
  }
  const used=new Set(shots.map(s=>s?.sourceName).filter(x=>typeof x==="string"));
  const unused=sources.filter(s=>s&&typeof s.name==="string"&&!used.has(s.name));
  if(unused.length)warnings.push(issue("UNUSED_SOURCES",
    unused.length+" selected original MP4(s) will be excluded from the portable ZIP."));
  if(shots.length)warnings.push(issue("DECODE_UNVERIFIED",
    "Browser inspection does not prove constant "+fps+" FPS or decoded frame availability; offline FFmpeg verifies these."));
  if(soundtrack)warnings.push(issue("SOUNDTRACK_NOT_PREVIEWED",
    "The source preview is silent; licensed soundtrack is mixed only by offline FFmpeg."));
  // The REAL storyboard serializer is the final authority. The audit may
  // explain issues but cannot approve a project rejected by the renderer schema.
  let storyboard=null;
  try{storyboard=buildLocalVideoBoard({sources,shots,soundtrack,quality});}
  catch(error){
    if(!errors.length)
      errors.push(issue("STORYBOARD",error instanceof Error?error.message:"Invalid v2 storyboard."));
  }
  return {
    canExport:errors.length===0&&storyboard!==null,
    frameCount:frames,seconds:frames/fps,fps,
    shots:rows,sourcesUsed:used.size,
    sourcesUnused:unused.map(x=>x.name),
    soundtrackIncluded:!!soundtrack,
    errors,warnings,
    previewIsRenderedVideo:false,
    rendererRequired:true,
  };
}
export function localSequencePlan(shots,sources,fps=16){
  const timeline=timelineSegments(shots,fps);
  if(!Array.isArray(sources))throw new Error("Expected original source list.");
  const byName=new Map();
  for(const source of sources){
    if(!validMedia(source,"video")||typeof source.url!=="string"||
       !source.url.startsWith("blob:"))
      throw new Error("Original source URL or SHA-256 is missing from local preview.");
    const key=source.name.toLowerCase();
    if(byName.has(key))throw new Error("Preview source names must be unique.");
    byName.set(key,source);
  }
  const cuts=timeline.segments.map((s,index)=>{
    const original=byName.get(s.sourceName.toLowerCase());
    if(!original||original.name!==s.sourceName)
      throw new Error("Preview cut "+(index+1)+" has no exact original local source.");
    const shot=shots[index];
    return {
      index,file:original.name,url:original.url,
      startFrame:s.startFrame,endFrame:s.endFrame,
      sourceStartFrame:s.sourceStartFrame,sourceEndFrame:s.sourceEndFrame,
      sourceStartSeconds:s.sourceStartFrame/timeline.fps,
      sourceEndSeconds:s.sourceEndFrame/timeline.fps,
      frames:s.frames,
      caption:printable(shot.caption)?shot.caption:"",
      rightsPresent:printable(shot.rightsRef)&&!!shot.rightsRef.trim(),
    };
  });
  return {fps:timeline.fps,totalFrames:timeline.frames,
    totalSeconds:timeline.seconds,cuts};
}
export function sequenceFrame(plan,frame){
  if(!plan||!Array.isArray(plan.cuts)||!Number.isSafeInteger(frame)||
     frame<0||frame>=plan.totalFrames)
    throw new Error("Seek a valid whole frame within the current local preview.");
  const shot=plan.cuts.find(x=>x.startFrame<=frame&&frame<x.endFrame);
  if(!shot)throw new Error("No real source clip for selected timeline frame.");
  return {index:shot.index,globalFrame:frame,
    sourceFrame:shot.sourceStartFrame+frame-shot.startFrame,
    sourceSeconds:(shot.sourceStartFrame+frame-shot.startFrame)/plan.fps,
    caption:shot.caption};
}
export function sequenceAtTime(plan,index,sourceSeconds){
  if(!plan||!Array.isArray(plan.cuts)||
     !Number.isSafeInteger(index)||index<0||index>=plan.cuts.length||
     typeof sourceSeconds!=="number"||!Number.isFinite(sourceSeconds))
    throw new Error("Invalid original source playback position.");
  const shot=plan.cuts[index];
  const nearEnd=sourceSeconds>=shot.sourceEndSeconds-.015;
  const inRange=Math.max(shot.sourceStartSeconds,
    Math.min(shot.sourceEndSeconds-.000001,sourceSeconds));
  const advancedFrames=Math.max(0,Math.min(shot.frames-1,
    Math.floor((inRange-shot.sourceStartSeconds)*plan.fps+1e-6)));
  return {
    frame:shot.startFrame+advancedFrames,
    nextIndex:nearEnd?(index+1<plan.cuts.length?index+1:null):index,
    reachedEnd:nearEnd&&index===plan.cuts.length-1,
  };
}
