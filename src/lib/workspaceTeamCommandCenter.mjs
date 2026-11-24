// Read-only triage from verified current team rows; no predictions or effort scores.
import {workspaceTeamWorkload,selectWorkspaceTeamTasks,workspaceTeamTaskDueBucket} from "./workspaceTeamTaskOperations.mjs";
import {teamMemberLabel} from "./workspaceTeamUtils.mjs";

const DEFINITIONS=Object.freeze([
  ["open","Outstanding","outstanding","all","all","due"],
  ["overdue","Overdue","overdue","all","all","due"],
  ["today","Due today","today","all","all","due"],
  ["upcoming","Today + next 7 days","upcoming","all","all","due"],
  ["urgent","Urgent open","outstanding","urgent","all","due"],
  ["unassigned","Unassigned open","outstanding","all","unassigned","due"],
  ["undated","No due date (open)","unscheduled","all","all","priority"],
  ["active","In progress","in_progress","all","all","due"],
  ["mine","My open tasks","outstanding","all","mine","due"],
  ["mineOverdue","My overdue","overdue","all","mine","due"],
  ["done","Completed","done","all","all","updated"],
]);
export const WORKSPACE_COMMAND_QUEUE_LIMIT=8;
export function workspaceTeamCommandCenter(tasks,members,owner,spaceId,today,queueScope="all"){
  // Reuse strict bounded snapshot validation, including membership and cross-team rows.
  workspaceTeamWorkload(tasks,members,owner,spaceId,today);
  if(!["all","mine","unassigned"].includes(queueScope))throw Error("Invalid attention queue scope");
  const ids=members.map(member=>member.user_id),roster=new Set(ids);
  const select=view=>selectWorkspaceTeamTasks(tasks,{...view,owner,today,memberIds:ids});
  const metrics=DEFINITIONS.map(([key,label,filter,priority,assignee,sort])=>{
    const view={filter,priority,assignee,sort,search:""};
    return {key,label,count:select(view).length,view};
  });
  const open=select({filter:"outstanding",assignee:queueScope});
  const rank={urgent:3,high:2,normal:1,low:0};
  const candidates=open.map(task=>{
    const bucket=workspaceTeamTaskDueBucket(task,today);
    const overdue=bucket==="overdue",dueToday=task.due_on===today;
    const urgent=task.priority==="urgent",unassigned=task.assignee_id===null;
    const outside=!unassigned&&!roster.has(task.assignee_id);
    const reasons=[];
    if(overdue)reasons.push("Overdue");
    if(dueToday)reasons.push("Due today");
    if(urgent)reasons.push("Urgent");
    if(unassigned)reasons.push("Unassigned");
    if(outside)reasons.push("Outside current roster");
    return {id:task.id,title:task.title,due:task.due_on,priority:task.priority,
      assignment:unassigned?"Unassigned":outside?"Outside current roster":teamMemberLabel(task.assignee_id,owner),
      reasons,tier:overdue?0:dueToday?1:urgent?2:3};
  }).filter(row=>row.reasons.length).sort((a,b)=>a.tier-b.tier||
    rank[b.priority]-rank[a.priority]||
    Number(a.due===null)-Number(b.due===null)||(a.due??"").localeCompare(b.due??"")||
    a.id.localeCompare(b.id));
  const done=metrics.find(row=>row.key==="done").count;
  return {metrics,total:tasks.length,done,queueTotal:candidates.length,
    queue:candidates.slice(0,WORKSPACE_COMMAND_QUEUE_LIMIT)};
}
export function workspaceTeamCommandView(center,key){
  const row=center?.metrics?.find(item=>item.key===key);
  if(!row||!DEFINITIONS.some(item=>item[0]===key)||!Number.isSafeInteger(row.count)||row.count<=0)
    throw Error("Command center metric is unavailable");
  return {...row.view};
}
