export const WORKSPACE_TEAM_ROLES = Object.freeze(["owner","editor","viewer"]);
export const WORKSPACE_TEAM_STATUSES = Object.freeze(["todo","in_progress","done"]);
export const WORKSPACE_TEAM_PRIORITIES = Object.freeze(["low","normal","high","urgent"]);
const TOKEN=/^[a-f0-9]{64}$/;
// Browser and PostgreSQL task dates use Gregorian years 0001–9999.
export function workspaceValidGregorianDay(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||
     value.startsWith("0000-"))return false;
  const day=new Date(value+"T00:00:00.000Z");
  return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===value;
}
export function validateTeamInviteToken(token) {
  if(typeof token!=="string" || !TOKEN.test(token.trim())) {
    throw new Error("Invitation code must be exactly 64 lowercase hexadecimal characters");
  }
  return token.trim();
}
export function teamCanEdit(role,spaceStatus) {
  return (role==="owner"||role==="editor") && spaceStatus==="active";
}
export function teamCanInvite(role,spaceStatus) {
  return role==="owner" && spaceStatus==="active";
}
export function normalizeTeamTaskDraft(input,memberIds=[]) {
  const title=typeof input?.title==="string"?input.title.trim():"";
  const details=typeof input?.details==="string"?input.details:"";
  if(title.length<1||title.length>200 || details.length>4000 ||
    !WORKSPACE_TEAM_STATUSES.includes(input?.status) ||
    !WORKSPACE_TEAM_PRIORITIES.includes(input?.priority) ||
    typeof input?.due!=="string" ||
    (input.due!=="" && !workspaceValidGregorianDay(input.due)) ||
    typeof input?.assignee!=="string" ||
    (input.assignee && !memberIds.includes(input.assignee))) {
    throw new Error("Review title, details, status, priority, due date and current team assignee");
  }
  return {
    p_title:title,p_details:details,p_status:input.status,
    p_priority:input.priority,p_due_on:input.due||null,
    p_assignee_id:input.assignee||null,
  };
}
export function teamMemberLabel(userId,selfId) {
  if(userId===selfId)return "You";
  return typeof userId==="string" && userId.length>=8
    ? "Member "+userId.slice(0,8)+"…" : "Team member";
}
export const WORKSPACE_TEAM_EVENT_LABELS=Object.freeze({
  space_created:"Team created",space_archived:"Team archived",space_reopened:"Team reopened",
  invite_created:"Invitation created",invite_revoked:"Invitation revoked",
  member_joined:"Member joined",member_removed:"Member removed",
  role_changed:"Member role changed",task_created:"Task created",
  task_updated:"Task updated",task_deleted:"Task deleted",
  task_assigned:"Task assigned",task_unassigned:"Task unassigned",
  comment_posted:"Task comment posted",comment_redacted:"Task comment redacted",
  step_added:"Checklist step added",step_checked:"Checklist step completed",
  step_unchecked:"Checklist step reopened",step_removed:"Checklist step removed",
});
