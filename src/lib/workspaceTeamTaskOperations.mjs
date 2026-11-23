// Workspace Phase 32 — bounded, deterministic views of real RLS-loaded team tasks.
// Pure helpers operate ONLY on current authorized rows and never fetch data.
import {workspaceTeamTaskMatchesFilter} from "./workspaceTeamDiscussion.mjs";
import {teamMemberLabel,WORKSPACE_TEAM_PRIORITIES,WORKSPACE_TEAM_STATUSES} from "./workspaceTeamUtils.mjs";

export const WORKSPACE_TEAM_TASK_VIEW_LIMIT=500;
export const WORKSPACE_TEAM_TASK_SEARCH_LIMIT=120;
export const WORKSPACE_TEAM_TASK_SORTS=Object.freeze(["updated","due","priority","title"]);
export const WORKSPACE_TEAM_TASK_FILTERS=Object.freeze([
  "all","mine","unassigned","outstanding","overdue","upcoming","done",
]);
const priorityRank={low:0,normal:1,high:2,urgent:3};
const dayFormat=/^\d{4}-\d{2}-\d{2}$/;
function validDay(day){
  if(typeof day!=="string"||!dayFormat.test(day))return false;
  const date=new Date(day+"T00:00:00.000Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day;
}
export function workspaceTeamLocalDay(date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))
    throw Error("Invalid local date");
  const pad=n=>String(n).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate());
}
export function workspaceTeamTaskDueBucket(task,today){
  if(!validDay(today))throw Error("Invalid task review date");
  if(task?.status==="done"||!validDay(task?.due_on))return "none";
  if(task.due_on<today)return "overdue";
  const upper=new Date(today+"T00:00:00.000Z");
  upper.setUTCDate(upper.getUTCDate()+7);
  return task.due_on<=upper.toISOString().slice(0,10)?"upcoming":"none";
}
export function workspaceTeamTaskSummary(tasks,today){
  if(!Array.isArray(tasks)||tasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT)
    throw Error("Invalid current team task snapshot");
  const summary={total:tasks.length,done:0,outstanding:0,overdue:0,upcoming:0};
  for(const task of tasks){
    if(task?.status==="done")summary.done++;
    else summary.outstanding++;
    const due=workspaceTeamTaskDueBucket(task,today);
    if(due==="overdue")summary.overdue++;
    if(due==="upcoming")summary.upcoming++;
  }
  return summary;
}
export function selectWorkspaceTeamTasks(tasks,{filter="all",search="",sort="updated",owner="",today}={}){
  if(!Array.isArray(tasks)||tasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT||
     !WORKSPACE_TEAM_TASK_FILTERS.includes(filter)||
     !WORKSPACE_TEAM_TASK_SORTS.includes(sort)||
     typeof search!=="string"||search.length>WORKSPACE_TEAM_TASK_SEARCH_LIMIT||
     typeof owner!=="string"||!validDay(today))
    throw Error("Invalid team task view controls");
  const query=search.trim().toLocaleLowerCase();
  const selected=tasks.filter(task=>{
    if(!task||typeof task.title!=="string"||typeof task.details!=="string")
      throw Error("Malformed team task view row");
    if(query&&!(task.title+" "+task.details).toLocaleLowerCase().includes(query))return false;
    if(filter==="done")return task.status==="done";
    if(filter==="overdue"||filter==="upcoming")
      return workspaceTeamTaskDueBucket(task,today)===filter;
    return workspaceTeamTaskMatchesFilter(task,filter,owner);
  });
  // Stable deterministic sort: a copy of the server snapshot, never mutation.
  return selected.sort((a,b)=>{
    let value=0;
    if(sort==="due"){
      value=(a.due_on??"9999-12-31").localeCompare(b.due_on??"9999-12-31");
    }else if(sort==="priority"){
      value=(priorityRank[b.priority]??-1)-(priorityRank[a.priority]??-1);
    }else if(sort==="title"){
      value=a.title.localeCompare(b.title,undefined,{sensitivity:"base"});
    }else{
      value=(b.updated_at??"").localeCompare(a.updated_at??"");
    }
    return value||String(a.id).localeCompare(String(b.id));
  });
}
function csvCell(value){
  const text=String(value??"");
  // Spreadsheet CSV formula injection: including leading whitespace/control
  // before =,+,-,@. Prefix apostrophe inside the quoted CSV cell.
  const safe=/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)?"'"+text:text;
  return '"'+safe.replaceAll('"','""')+'"';
}
export function buildWorkspaceTeamTasksCsv(tasks,owner,spaceId){
  if(!Array.isArray(tasks)||tasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT||
     typeof owner!=="string"||!owner||typeof spaceId!=="string"||!spaceId)
    throw Error("Invalid authorized task export");
  const ids=new Set();
  const headers=["Title","Details","Status","Priority","Due date","Assignee","Updated UTC"];
  const rows=tasks.map(task=>{
    if(!task||task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
       ids.has(task.id)||typeof task.title!=="string"||!task.title.trim()||
       typeof task.details!=="string"||!WORKSPACE_TEAM_STATUSES.includes(task.status)||
       !WORKSPACE_TEAM_PRIORITIES.includes(task.priority)||
       !(task.due_on===null||validDay(task.due_on))||
       !(task.assignee_id===null||typeof task.assignee_id==="string")||
       typeof task.updated_at!=="string"||
       !Number.isFinite(Date.parse(task.updated_at)))
      throw Error("Invalid or cross-team task export row");
    ids.add(task.id);
    return [task.title,task.details,task.status,task.priority,task.due_on??"",
      task.assignee_id?teamMemberLabel(task.assignee_id,owner):"Unassigned",
      new Date(task.updated_at).toISOString()].map(csvCell).join(",");
  });
  return "\uFEFF"+[headers.map(csvCell).join(","),...rows].join("\r\n")+"\r\n";
}
