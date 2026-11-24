/** Pure, CPU-only frame-accurate timeline operations for locally owned video.
 * Never read media or fabricate output; seek targets are source MP4 times.
 * The offline FFmpeg renderer remains authoritative for actual CFR frame counts.
 */
import {LOCAL_VIDEO_LIMITS} from "./localVideoEditor.mjs";

function integer(value,min,max,description){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new Error(description+" must be an integer from "+min+" to "+max+".");
  return value;
}
function fadeLimit(frames){return Math.min(16,Math.floor(frames/2));}
function normalizedShot(shot,index,fps=16){
  if(!shot||typeof shot!=="object"||Array.isArray(shot)||
     typeof shot.sourceName!=="string"||!shot.sourceName.trim())
    throw new Error("Shot "+(index+1)+" needs a real source MP4.");
  const startFrame=integer(shot.startFrame,0,fps*60,"Source start");
  const frames=integer(shot.frames,1,fps*30,"Shot duration");
  if(startFrame+frames>fps*60)
    throw new Error("Shot "+(index+1)+" exceeds the "+(fps*60)+"-frame original source ceiling.");
  integer(shot.fadeInFrames,0,fadeLimit(frames),"Fade in");
  integer(shot.fadeOutFrames,0,fadeLimit(frames),"Fade out");
  return shot;
}
function validate(shots,fps=16){
  if(fps!==16&&fps!==24)throw new Error("Choose 16 or 24 FPS.");
  if(!Array.isArray(shots)||shots.length<1||shots.length>LOCAL_VIDEO_LIMITS.maxClips)
    throw new Error("The timeline requires 1–8 original video shots.");
  let total=0;
  for(const [index,shot] of shots.entries()){
    normalizedShot(shot,index,fps);
    total+=shot.frames;
    if(total>fps*30)
      throw new Error("The edited timeline cannot exceed "+(fps*30)+" frames / 30 seconds.");
  }
  return total;
}
function at(shots,index){
  integer(index,0,shots.length-1,"Selected shot");
  return shots[index];
}
export function timelineSegments(shots,fps=16){
  if(fps!==16&&fps!==24)throw new Error("Choose 16 or 24 FPS.");
  const frames=validate(shots,fps);
  let cursor=0;
  const segments=shots.map((shot,index)=>{
    const start=cursor;
    cursor+=shot.frames;
    return {index,sourceName:shot.sourceName,
      sourceStartFrame:shot.startFrame,sourceEndFrame:shot.startFrame+shot.frames,
      startFrame:start,endFrame:cursor,
      frames:shot.frames,
      startSeconds:start/fps,
      endSeconds:cursor/fps,
      widthPercent:shot.frames*100/frames,
      caption:shot.caption,
    };
  });
  return {frames,seconds:frames/fps,
    segments,fps};
}
export function timelineSeek(shots,globalFrame,fps=16){
  const timeline=timelineSegments(shots,fps);
  integer(globalFrame,0,timeline.frames-1,"Timeline seek frame");
  const segment=timeline.segments.find(s=>
    s.startFrame<=globalFrame&&globalFrame<s.endFrame);
  if(!segment)throw new Error("No original source for timeline position.");
  const offset=globalFrame-segment.startFrame;
  return {index:segment.index,globalFrame,sourceName:segment.sourceName,
    sourceFrame:segment.sourceStartFrame+offset,
    sourceSeconds:(segment.sourceStartFrame+offset)/timeline.fps,
    globalSeconds:globalFrame/timeline.fps,
    cutEndSeconds:segment.sourceEndFrame/timeline.fps,
    remainingFrames:segment.endFrame-globalFrame,
    caption:segment.caption,
  };
}
function withShot(shots,index,changed,fps=16){
  validate(shots,fps);
  at(shots,index);
  const next=shots.map((s,i)=>i===index?changed:s);
  validate(next,fps);
  return next;
}
export function splitTimelineShot(shots,index,afterFrames,fps=16){
  validate(shots,fps);
  const shot=at(shots,index);
  integer(afterFrames,1,shot.frames-1,"Split offset");
  if(shots.length>=LOCAL_VIDEO_LIMITS.maxClips)
    throw new Error("Maximum 8 cuts reached; remove a cut before splitting.");
  const left={...shot,frames:afterFrames,
    fadeInFrames:Math.min(shot.fadeInFrames,fadeLimit(afterFrames)),
    fadeOutFrames:0};
  const remaining=shot.frames-afterFrames;
  const right={...shot,startFrame:shot.startFrame+afterFrames,
    frames:remaining,fadeInFrames:0,
    fadeOutFrames:Math.min(shot.fadeOutFrames,fadeLimit(remaining))};
  const next=[...shots.slice(0,index),left,right,...shots.slice(index+1)];
  validate(next,fps);
  return next;
}
export function duplicateTimelineShot(shots,index,fps=16){
  validate(shots,fps);
  const shot=at(shots,index);
  if(shots.length>=LOCAL_VIDEO_LIMITS.maxClips)
    throw new Error("Maximum 8 cuts reached; remove a cut before duplicating.");
  if(timelineSegments(shots,fps).frames+shot.frames>fps*30)
    throw new Error("Duplicating this cut exceeds the 30-second project limit.");
  const next=[...shots.slice(0,index+1),{...shot},...shots.slice(index+1)];
  validate(next,fps);
  return next;
}
export function moveTimelineShot(shots,index,direction,fps=16){
  validate(shots,fps);
  at(shots,index);
  if(direction!==-1&&direction!==1)
    throw new Error("Reorder one shot to the left or right.");
  const target=index+direction;
  integer(target,0,shots.length-1,"Reordered shot");
  const copy=[...shots];
  [copy[index],copy[target]]=[copy[target],copy[index]];
  return copy;
}
/** Pointer/keyboard parity: move a selected cut to any valid timeline position. */
export function repositionTimelineShot(shots,from,to,fps=16){
  validate(shots,fps);
  integer(from,0,shots.length-1,"Dragged shot");
  integer(to,0,shots.length-1,"Destination shot");
  if(from===to)return [...shots];
  const reordered=[...shots];
  const [moving]=reordered.splice(from,1);
  reordered.splice(to,0,moving);
  validate(reordered);
  return reordered;
}
export function removeTimelineShot(shots,index,fps=16){
  validate(shots,fps);
  at(shots,index);
  if(shots.length===1)
    throw new Error("Keep at least one shot in the project.");
  return shots.filter((_,i)=>i!==index);
}
/** Nudge start IN/OUT or shot end by exactly integer frames.
 * startDelta +1 trims one frame from the beginning; -1 extends earlier.
 * endDelta +1 extends the end, -1 trims it.
 * Safely clamp original fades to the shorter adjusted shot duration.
 */
export function nudgeTimelineShot(shots,index,edge,delta,fps=16){
  validate(shots,fps);
  const shot=at(shots,index);
  if(edge!=="in"&&edge!=="out")
    throw new Error("Choose the in or out boundary of an original source cut.");
  integer(delta,-16,16,"Frame adjustment");
  if(delta===0)return [...shots];
  const startFrame=edge==="in"?shot.startFrame+delta:shot.startFrame;
  const frames=shot.frames+(edge==="in"?-delta:delta);
  integer(startFrame,0,fps*60,"Adjusted source in-point");
  integer(frames,1,fps*30,"Adjusted cut frames");
  if(startFrame+frames>fps*60)
    throw new Error("Adjusted cut exceeds original source frame ceiling.");
  const next={...shot,startFrame,frames,
    fadeInFrames:Math.min(shot.fadeInFrames,fadeLimit(frames)),
    fadeOutFrames:Math.min(shot.fadeOutFrames,fadeLimit(frames))};
  return withShot(shots,index,next,fps);
}
/** Join adjacent source-contiguous cuts only if this loses no captions,
 * rights metadata, or original fade effects.
 */
export function joinTimelineShots(shots,index,fps=16){
  validate(shots,fps);
  integer(index,0,shots.length-2,"First cut to join");
  const first=shots[index],second=shots[index+1];
  if(first.sourceName!==second.sourceName||
     first.startFrame+first.frames!==second.startFrame||
     first.caption!==second.caption||first.rightsRef!==second.rightsRef||
     first.fadeOutFrames!==0||second.fadeInFrames!==0)
    throw new Error("Join only contiguous cuts from the same source with matching caption/rights and no internal fades.");
  const merged={...first,frames:first.frames+second.frames,
    fadeInFrames:first.fadeInFrames,fadeOutFrames:second.fadeOutFrames};
  const next=[...shots.slice(0,index),merged,...shots.slice(index+2)];
  validate(next,fps);
  return next;
}
export function timelineTimecode(frame,fps=16){
  if(fps!==16&&fps!==24)throw new Error("Choose 16 or 24 FPS.");
  integer(frame,0,fps*30,"Timecode frame");
  const seconds=frame/fps;
  return Math.floor(seconds/60).toString().padStart(2,"0")+":"+
    (seconds%60).toFixed(2).padStart(5,"0");
}
