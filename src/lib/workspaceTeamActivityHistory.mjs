// Phase 20: bounded, immutable, RLS-read activity history and CSV guards.
export const TEAM_ACTIVITY_PAGE_SIZE=40;
export const TEAM_ACTIVITY_VIEW_CAP=400;
function validEvent(row,spaceId) {
  return row && typeof row==="object" && row.space_id===spaceId
    && Number.isSafeInteger(row.id) && row.id>0
    && typeof row.event_type==="string" && !!row.event_type
    && typeof row.actor_id==="string" && !!row.actor_id
    && typeof row.entity_id==="string" && !!row.entity_id
    && typeof row.created_at==="string"
    && Number.isFinite(Date.parse(row.created_at));
}
export function mergeWorkspaceTeamHistory(latest,older,spaceId) {
  if(!Array.isArray(latest)||!Array.isArray(older)||typeof spaceId!=="string")
    throw new Error("Invalid team history page");
  const map=new Map();
  for(const row of [...latest,...older]){
    if(!validEvent(row,spaceId))throw new Error("Malformed or cross-team activity row");
    if(!map.has(row.id))map.set(row.id,row);
  }
  return Array.from(map.values())
    .sort((a,b)=>b.id-a.id).slice(0,TEAM_ACTIVITY_VIEW_CAP);
}
export function normalizeWorkspaceTeamSnapshot(value) {
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new Error("Not a current member or notification snapshot unavailable");
  const seen=value.last_seen_event_id;
  const count=value.unread_count;
  const newest=value.latest_event_id;
  if(!Number.isSafeInteger(seen)||seen<0||
    !Number.isSafeInteger(count)||count<0||
    !(newest===null||(Number.isSafeInteger(newest)&&newest>0))||
    (newest===null&&(seen!==0||count!==0))||
    (newest!==null&&(seen>newest||count>newest-seen))) {
    throw new Error("Server notification snapshot was malformed");
  }
  return {lastSeen:seen,unread:count,latest:newest};
}
export function teamHistorySearch(event,label,taskName,query){
  const normalized=(typeof query==="string"?query:"").trim().toLocaleLowerCase();
  if(!normalized)return true;
  return (label+" "+taskName).toLocaleLowerCase().includes(normalized);
}
function csvCell(value) {
  const raw=String(value??"");
  const text=raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,"\uFFFD");
  const probe=raw.normalize("NFKC");
  const cleaned=/^[\s\u0000-\u001f\u007f\u200b-\u200f\u2060]*[=+@\-]/u.test(probe)||
    /^[\t\r\n]/u.test(probe)?"'"+text:text;
  return '"'+cleaned.replaceAll('"','""')+'"';
}
// Export is explicitly the records currently loaded and filtered, not a full audit dump.
export function buildWorkspaceTeamActivityCsv(rows,owner,taskTitles,labels,spaceId=rows?.[0]?.space_id){
  if(!Array.isArray(rows)||rows.length>TEAM_ACTIVITY_VIEW_CAP||
    typeof owner!=="string"||!owner||typeof spaceId!=="string"||!spaceId||
    rows.some(row=>!validEvent(row,spaceId))||new Set(rows.map(row=>row.id)).size!==rows.length)
    throw new Error("Invalid visible history export");
  const titles=taskTitles??{};
  const headings=["Event ID","Recorded UTC","Action","Actor","Task"];
  const body=rows.map(row=>[
    row.id,new Date(row.created_at).toISOString(),
    labels?.[row.event_type]??row.event_type,
    row.actor_id===owner?"You":"Teammate",
    titles[row.entity_id]??"",
  ].map(csvCell).join(","));
  return [headings.map(csvCell).join(","),...body].join("\r\n")+"\r\n";
}

/** Acknowledge only the server snapshot presented before the click. */
export function workspaceTeamAcknowledgementTarget(snapshot){
  if(!snapshot||!Number.isSafeInteger(snapshot.lastSeen)||snapshot.lastSeen<0||
    !Number.isSafeInteger(snapshot.unread)||snapshot.unread<=0||
    !Number.isSafeInteger(snapshot.latest)||snapshot.latest<=snapshot.lastSeen||
    snapshot.unread>snapshot.latest-snapshot.lastSeen)
    throw Error("No verified unread activity to acknowledge");
  return snapshot.latest;
}
export function workspaceTeamActivityDateMatches(event,from="",to=""){
  const valid=day=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&
    !day.startsWith("0000-")&&Number.isFinite(Date.parse(day+"T00:00:00Z"))&&
    new Date(day+"T00:00:00Z").toISOString().slice(0,10)===day;
  if((from&&!valid(from))||(to&&!valid(to))||(from&&to&&from>to))return false;
  const stamp=Date.parse(event?.created_at??"");
  if(!Number.isFinite(stamp))return false;
  const day=new Date(stamp).toISOString().slice(0,10);
  return (!from||day>=from)&&(!to||day<=to);
}
export function workspaceTeamActivityDateRangeValid(from,to){
  if(typeof from!=="string"||typeof to!=="string")return false;
  // Test against endpoints to check validity without requiring a specific event.
  return workspaceTeamActivityDateMatches({created_at:(from||to||"2000-01-01")+"T00:00:00Z"},from,to);
}
