// Phase 20: bounded, immutable, RLS-read activity history and CSV guards.
export const TEAM_ACTIVITY_PAGE_SIZE=40;
export const TEAM_ACTIVITY_VIEW_CAP=400;
function validEvent(row,spaceId) {
  return row && typeof row==="object" && row.space_id===spaceId
    && Number.isSafeInteger(row.id) && row.id>0
    && typeof row.event_type==="string"
    && typeof row.actor_id==="string"
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
    (newest!==null&&seen>newest)) {
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
  const text=String(value??"");
  const cleaned=/^[\s]*[=+@\-]/.test(text)?"'"+text:text;
  return '"'+cleaned.replaceAll('"','""')+'"';
}
// Export is explicitly the records currently loaded and filtered, not a full audit dump.
export function buildWorkspaceTeamActivityCsv(rows,owner,taskTitles,labels){
  if(!Array.isArray(rows)||rows.length>TEAM_ACTIVITY_VIEW_CAP)
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
