/** Private in-memory edit journal for local video SHOT metadata only.
 * No media bytes, URLs, backend, persistence or automatic network transfer.
 * Every source import/reopened project resets this journal to avoid stale
 * references to retired local video files.
 */
export const TIMELINE_HISTORY_LIMIT=40;
const KEYS=["sourceName","startFrame","frames","caption","rightsRef",
            "fadeInFrames","fadeOutFrames"];
function snapshot(shots){
  if(!Array.isArray(shots)||shots.length>8)
    throw new Error("Editor history only stores up to 8 local video shot records.");
  return shots.map((shot,i)=>{
    if(!shot||typeof shot!=="object"||Array.isArray(shot)||
       KEYS.some(k=>!Object.hasOwn(shot,k)))
      throw new Error("Invalid editable shot "+(i+1)+" in local history.");
    return Object.fromEntries(KEYS.map(key=>[key,shot[key]]));
  });
}
const same=(left,right)=>left.length===right.length&&
  left.every((row,i)=>KEYS.every(k=>Object.is(row[k],right[i][k])));
function shape(h){
  if(!h||!Array.isArray(h.past)||!Array.isArray(h.present)||
     !Array.isArray(h.future)||h.past.length>TIMELINE_HISTORY_LIMIT||
     h.future.length>TIMELINE_HISTORY_LIMIT)
    throw new Error("Invalid bounded local video edit history.");
}
export function newTimelineHistory(shots=[]){
  return {past:[],present:snapshot(shots),future:[]};
}
export function commitTimelineHistory(history,nextShots){
  shape(history);
  const next=snapshot(nextShots);
  if(same(history.present,next))return history;
  return {
    past:[...history.past,history.present].slice(-TIMELINE_HISTORY_LIMIT),
    present:next,
    future:[],
  };
}
export function undoTimelineHistory(history){
  shape(history);
  if(!history.past.length)return history;
  const previous=history.past.at(-1);
  return {
    past:history.past.slice(0,-1),
    present:snapshot(previous),
    future:[history.present,...history.future].slice(0,TIMELINE_HISTORY_LIMIT),
  };
}
export function redoTimelineHistory(history){
  shape(history);
  if(!history.future.length)return history;
  return {
    past:[...history.past,history.present].slice(-TIMELINE_HISTORY_LIMIT),
    present:snapshot(history.future[0]),
    future:history.future.slice(1),
  };
}
export function resetTimelineHistory(shots=[]){
  return newTimelineHistory(shots);
}
export function timelineHistoryStatus(history){
  shape(history);
  return {
    undo:history.past.length>0,redo:history.future.length>0,
    previousSteps:history.past.length,nextSteps:history.future.length,
    maxSteps:TIMELINE_HISTORY_LIMIT,
  };
}
