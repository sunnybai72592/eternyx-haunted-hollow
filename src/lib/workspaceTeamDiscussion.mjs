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

/** Validate exact bounded RLS pages before either is published. */
export function verifyWorkspaceDiscussionSnapshot({comments,steps,commentCount,stepCount,spaceId,taskId}){
  const id=value=>typeof value==="string"&&value.length>0;
  const timestamp=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
  const validPage=(rows,count,limit,valid)=>Array.isArray(rows)&&
    Number.isSafeInteger(count)&&count>=0&&count<=limit&&rows.length===count&&
    new Set(rows.map(row=>row?.id)).size===rows.length&&rows.every(row=>
      row&&id(row.id)&&row.space_id===spaceId&&row.task_id===taskId&&valid(row));
  if(!id(spaceId)||!id(taskId)||
    !validPage(comments,commentCount,TEAM_COMMENT_LIMIT,c=>id(c.author_id)&&
      typeof c.body==="string"&&c.body.length<=TEAM_COMMENT_MAX_LENGTH&&
      timestamp(c.created_at)&&(c.redacted_at===null||timestamp(c.redacted_at)))||
    !validPage(steps,stepCount,TEAM_STEP_LIMIT,s=>id(s.created_by)&&
      typeof s.title==="string"&&s.title.trim().length>0&&s.title.length<=TEAM_STEP_MAX_LENGTH&&
      typeof s.done==="boolean"&&timestamp(s.created_at)&&timestamp(s.updated_at)&&
      (s.done?(id(s.done_by)&&timestamp(s.completed_at)):
        (s.done_by===null&&s.completed_at===null))))
    throw Error("Team discussion returned an invalid or incomplete scoped snapshot.");
  return {comments,steps};
}
export function isWorkspaceDiscussionCurrent(scope,request,currentScope,currentRequest){
  return scope===currentScope&&request===currentRequest;
}
export function selectWorkspaceDiscussionComments(comments,{query="",filter="all",owner="",sort="newest"}={}){
  if(!Array.isArray(comments)||comments.length>TEAM_COMMENT_LIMIT||
     typeof query!=="string"||query.length>120||
     !["all","mine","redacted"].includes(filter)||!["newest","oldest"].includes(sort))
    throw Error("Invalid discussion controls");
  const term=query.trim().toLocaleLowerCase();
  return comments.filter(c=>{
    if(filter==="mine"&&c.author_id!==owner)return false;
    if(filter==="redacted"&&!c.redacted_at)return false;
    // Redacted content is never searched, even if a stale backend returns it.
    return !term||(!c.redacted_at&&c.body.toLocaleLowerCase().includes(term));
  }).sort((a,b)=>{
    const byTime=Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id);
    return sort==="oldest"?byTime:-byTime;
  });
}
export function selectWorkspaceDiscussionSteps(steps,filter="all"){
  if(!["all","open","done"].includes(filter))throw Error("Invalid checklist filter");
  workspaceTeamStepProgress(steps);
  return steps.filter(s=>filter==="all"||(filter==="done"?s.done:!s.done));
}
