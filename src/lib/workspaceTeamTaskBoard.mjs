// Workspace Phase 33 — one immutable, account-scoped view of real shared tasks.
// No synthetic cards, optimistic writes, hidden queries or copied membership.
import {normalizeTeamTaskDraft,WORKSPACE_TEAM_STATUSES} from "./workspaceTeamUtils.mjs";
import {WORKSPACE_TEAM_TASK_VIEW_LIMIT} from "./workspaceTeamTaskOperations.mjs";

export const WORKSPACE_TEAM_BOARD_COLUMNS=Object.freeze([
  Object.freeze({status:"todo",label:"To do"}),
  Object.freeze({status:"in_progress",label:"In progress"}),
  Object.freeze({status:"done",label:"Done"}),
]);
const nextStatus=Object.freeze({todo:"in_progress",in_progress:"done",done:"in_progress"});

export function workspaceTeamBoardColumns(tasks,spaceId){
  if(!Array.isArray(tasks)||tasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT||
     typeof spaceId!=="string"||!spaceId)throw Error("Invalid team board scope");
  const columns=WORKSPACE_TEAM_BOARD_COLUMNS.map(col=>({...col,tasks:[]}));
  const seen=new Set();
  for(const task of tasks){
    if(!task||task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
       seen.has(task.id)||!WORKSPACE_TEAM_STATUSES.includes(task.status)||
       typeof task.title!=="string"||!task.title.trim()){
      throw Error("Team board contains malformed, duplicated or cross-team tasks");
    }
    seen.add(task.id);
    columns[WORKSPACE_TEAM_STATUSES.indexOf(task.status)].tasks.push(task);
  }
  return columns;
}

export function workspaceTeamNextTaskStatus(task){
  if(!task||!WORKSPACE_TEAM_STATUSES.includes(task.status))
    throw Error("Invalid current team task status");
  return nextStatus[task.status];
}
export function workspaceTeamNextTaskLabel(task){
  if(!task||!WORKSPACE_TEAM_STATUSES.includes(task.status))
    throw Error("Invalid current team task status");
  return task.status==="todo"?"Start work":task.status==="in_progress"?
    "Mark done":"Reopen";
}
// Only a non-stale, authorized editor may invoke the corresponding RPC.
// This helper never mutates a task, does not read Auth and cannot grant access.
export function workspaceTeamTaskStatusPayload(task,toStatus,spaceId,memberIds){
  if(!task||typeof spaceId!=="string"||!spaceId||
     task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
     !WORKSPACE_TEAM_STATUSES.includes(task.status)||
     !WORKSPACE_TEAM_STATUSES.includes(toStatus)||
     toStatus===task.status||toStatus!==nextStatus[task.status]||
     typeof task.updated_at!=="string"||
     !Number.isFinite(Date.parse(task.updated_at))||
     !Array.isArray(memberIds)||
     memberIds.some(id=>typeof id!=="string"||!id))
    throw Error("Task transition is invalid or requires revalidation");
  const validated=normalizeTeamTaskDraft({
    title:task.title,details:task.details,status:toStatus,
    priority:task.priority,due:task.due_on??"",
    assignee:task.assignee_id??"",
  },memberIds);
  return {
    p_space_id:spaceId,p_task_id:task.id,
    ...validated,p_expected_updated_at:task.updated_at,
  };
}
