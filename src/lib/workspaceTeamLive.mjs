// Pure helpers for server-backed team activity; never infer unread from mocks.
const DISCUSSION=new Set(["comment_posted","comment_redacted","step_added",
  "step_checked","step_unchecked","step_removed"]);
const PEOPLE=new Set(["member_joined","member_removed","role_changed",
  "invite_created","invite_revoked"]);
const SPACE=new Set(["space_created","space_archived","space_reopened"]);
export function workspaceTeamEventGroup(type) {
  if(DISCUSSION.has(type))return "discussion";
  if(PEOPLE.has(type))return "people";
  if(SPACE.has(type))return "space";
  if(typeof type==="string"&&type.startsWith("task_"))return "tasks";
  return "other";
}
export function workspaceTeamEventUnread(event,owner,joinedAt,lastSeenEventId) {
  const created=Date.parse(event?.created_at??"");
  const joined=Date.parse(joinedAt??"");
  return Number.isSafeInteger(event?.id)&&event.id>0
    && Number.isSafeInteger(lastSeenEventId)&&lastSeenEventId>=0
    && typeof event?.actor_id==="string"
    && event.actor_id!==owner
    && Number.isFinite(created)&&Number.isFinite(joined)
    && created>=joined && event.id>lastSeenEventId;
}
export function workspaceTeamVisibleEvents(events,group,actor,owner) {
  if(!Array.isArray(events))return [];
  return events.filter(event=>
    (group==="all"||workspaceTeamEventGroup(event.event_type)===group)
    && (actor==="all"||(actor==="others"?event.actor_id!==owner:event.actor_id===owner)));
}
