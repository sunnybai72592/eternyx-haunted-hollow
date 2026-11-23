export const TEAM_COMMENT_MAX_LENGTH=2000;
export const TEAM_STEP_MAX_LENGTH=180;
export const TEAM_COMMENT_LIMIT=200;
export const TEAM_STEP_LIMIT=30;
export function validateTeamCommentBody(value) {
  if(typeof value!=="string" || !value.trim() ||
    value.trim().length>TEAM_COMMENT_MAX_LENGTH) {
    throw new Error("A team comment must contain 1–2,000 characters");
  }
  return value.trim();
}
export function validateTeamStepTitle(value) {
  if(typeof value!=="string" || !value.trim() ||
    value.trim().length>TEAM_STEP_MAX_LENGTH) {
    throw new Error("A checklist step must contain 1–180 characters");
  }
  return value.trim();
}
export function workspaceTeamStepProgress(steps=[]) {
  if(!Array.isArray(steps) || steps.length>TEAM_STEP_LIMIT ||
    steps.some(s=>typeof s?.done!=="boolean")) {
    throw new Error("Invalid team checklist snapshot");
  }
  return {done:steps.filter(s=>s.done).length,total:steps.length};
}
export function workspaceTeamCommentCanRedact({role,owner,authorId,redactedAt,active}) {
  return active===true && !redactedAt &&
    (role==="owner" || (role==="editor" && authorId===owner));
}
export function workspaceTeamTaskMatchesFilter(task,filter,owner) {
  if(filter==="mine")return task.assignee_id===owner;
  if(filter==="unassigned")return task.assignee_id===null;
  if(filter==="outstanding")return task.status!=="done";
  return true;
}
