// Workspace Phase 33 — one immutable, account-scoped view of real shared tasks.
// No synthetic cards, optimistic writes, hidden queries or copied membership.
import {normalizeTeamTaskDraft,WORKSPACE_TEAM_PRIORITIES,WORKSPACE_TEAM_STATUSES} from "./workspaceTeamUtils.mjs";
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


// Phase 34: explicitly selected columns may differ from the one-click
// progression. All moves still use the same optimistic-concurrency RPC.
export const WORKSPACE_TEAM_BOARD_DRAG_MIME="application/x-eternyx-team-task+json";
const MAX_DRAG_RECEIPT_BYTES=650;
export function workspaceTeamTaskMovePayload(task,toStatus,spaceId,memberIds){
  if(!task||typeof spaceId!=="string"||!spaceId||
     task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
     !WORKSPACE_TEAM_STATUSES.includes(task.status)||
     !WORKSPACE_TEAM_STATUSES.includes(toStatus)||
     toStatus===task.status||
     typeof task.updated_at!=="string"||
     !Number.isFinite(Date.parse(task.updated_at))||
     !Array.isArray(memberIds)||
     memberIds.some(id=>typeof id!=="string"||!id)){
    throw Error("Task move is invalid or requires a fresh team review");
  }
  const validated=normalizeTeamTaskDraft({
    title:task.title,details:task.details,status:toStatus,
    priority:task.priority,due:task.due_on??"",
    assignee:task.assignee_id??"",
  },memberIds);
  return {p_space_id:spaceId,p_task_id:task.id,
    ...validated,p_expected_updated_at:task.updated_at};
}
export function workspaceTeamBoardDragReceipt(task,spaceId){
  if(!task||typeof spaceId!=="string"||!spaceId||
     task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
     !WORKSPACE_TEAM_STATUSES.includes(task.status)||
     typeof task.updated_at!=="string"||
     !Number.isFinite(Date.parse(task.updated_at))){
    throw Error("Cannot drag a task without a verified team snapshot");
  }
  const receipt=JSON.stringify({
    v:1,space_id:spaceId,task_id:task.id,
    from_status:task.status,updated_at:task.updated_at,
  });
  if(receipt.length>MAX_DRAG_RECEIPT_BYTES)throw Error("Invalid task drag receipt");
  return receipt;
}
export function workspaceTeamBoardResolveDrag(receipt,spaceId,visibleTasks){
  if(typeof receipt!=="string"||!receipt||
     receipt.length>MAX_DRAG_RECEIPT_BYTES||
     typeof spaceId!=="string"||!spaceId||
     !Array.isArray(visibleTasks)||visibleTasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT)
    throw Error("Untrusted or oversized board drag data");
  let data;
  try {data=JSON.parse(receipt);}catch{throw Error("Invalid board drag receipt");}
  if(!data||Array.isArray(data)||typeof data!=="object"||
     Object.keys(data).length!==5||
     data.v!==1||data.space_id!==spaceId||
     typeof data.task_id!=="string"||!data.task_id||
     !WORKSPACE_TEAM_STATUSES.includes(data.from_status)||
     typeof data.updated_at!=="string"||
     !Number.isFinite(Date.parse(data.updated_at)))
    throw Error("Board drag identity or scope was not verified");
  const matches=visibleTasks.filter(task=>
    task?.id===data.task_id&&task.space_id===spaceId&&
    task.status===data.from_status&&task.updated_at===data.updated_at);
  if(matches.length!==1)throw Error("Task changed during drag; refresh and retry");
  return matches[0];
}


// Phase 35: one-field quick edit helper. Rebuild the *entire* server RPC
// payload from a verified row; do not bypass the task's version precondition.
export function workspaceTeamTaskQuickPatch(task,change,spaceId,memberIds){
  if(!task||typeof spaceId!=="string"||!spaceId||
     task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
     !Array.isArray(memberIds)||memberIds.some(id=>typeof id!=="string"||!id)||
     typeof task.updated_at!=="string"||
     !Number.isFinite(Date.parse(task.updated_at))||
     !change||typeof change!=="object"||Array.isArray(change)||
     Object.keys(change).length!==1) {
    throw Error("Invalid team quick task change or stale server row");
  }
  const key=Object.keys(change)[0];
  if(key!=="priority"&&key!=="assignee_id")
    throw Error("Unsupported quick task edit");
  if(key==="priority"&&
     (!WORKSPACE_TEAM_PRIORITIES.includes(change.priority)||
       change.priority===task.priority))
    throw Error("Priority must change to a supported value");
  if(key==="assignee_id"&&
     !(change.assignee_id===null||
       (typeof change.assignee_id==="string"&&memberIds.includes(change.assignee_id))))
    throw Error("Assignee is not a verified current member");
  if(key==="assignee_id"&&change.assignee_id===task.assignee_id)
    throw Error("Task assignee has not changed");
  const validated=normalizeTeamTaskDraft({
    title:task.title,details:task.details,status:task.status,
    priority:key==="priority"?change.priority:task.priority,
    due:task.due_on??"",
    assignee:key==="assignee_id"?(change.assignee_id??""):(task.assignee_id??""),
  },memberIds);
  return {
    p_space_id:spaceId,p_task_id:task.id,...validated,
    p_expected_updated_at:task.updated_at,
  };
}
