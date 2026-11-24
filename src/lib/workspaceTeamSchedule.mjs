// Phase 36: real owner-scoped team scheduling and downloadable all-day calendar.
// Uses only currently authorized task rows. No backend calls or invented events.
import {normalizeTeamTaskDraft,WORKSPACE_TEAM_STATUSES,WORKSPACE_TEAM_PRIORITIES,teamMemberLabel,workspaceValidGregorianDay} from "./workspaceTeamUtils.mjs";
import {WORKSPACE_TEAM_TASK_VIEW_LIMIT} from "./workspaceTeamTaskOperations.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function workspaceValidTaskDay(value){
  return workspaceValidGregorianDay(value);
}
function addDays(day,count){
  const date=new Date(day+"T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate()+count);
  return date.getTime();
}
function authorizedTaskRows(tasks,spaceId){
  if(!Array.isArray(tasks)||tasks.length>WORKSPACE_TEAM_TASK_VIEW_LIMIT||
    typeof spaceId!=="string"||!spaceId)throw Error("Invalid team schedule scope");
  const seen=new Set();
  for(const task of tasks){
    if(!task||task.space_id!==spaceId||
      typeof task.id!=="string"||!task.id||seen.has(task.id)||
      typeof task.title!=="string"||!task.title.trim()||
      typeof task.details!=="string"||
      !WORKSPACE_TEAM_STATUSES.includes(task.status)||
      !(task.due_on===null||workspaceValidTaskDay(task.due_on))){
      throw Error("Malformed, duplicate or cross-team schedule row");
    }
    seen.add(task.id);
  }
  return tasks;
}
export const WORKSPACE_TEAM_SCHEDULE_BUCKETS=Object.freeze([
  {key:"overdue",label:"Overdue"},
  {key:"today",label:"Due today"},
  {key:"next7",label:"Next 7 days"},
  {key:"later",label:"Later"},
  {key:"unscheduled",label:"No due date"},
  {key:"completed",label:"Completed"},
]);
export function workspaceTeamScheduleGroups(tasks,spaceId,today){
  if(!workspaceValidTaskDay(today))throw Error("Invalid schedule reference day");
  const rows=authorizedTaskRows(tasks,spaceId);
  const bucket=Object.fromEntries(WORKSPACE_TEAM_SCHEDULE_BUCKETS.map(b=>[b.key,[]]));
  const next=addDays(today,7);
  for(const task of rows){
    if(task.status==="done")bucket.completed.push(task);
    else if(task.due_on===null)bucket.unscheduled.push(task);
    else if(task.due_on<today)bucket.overdue.push(task);
    else if(task.due_on===today)bucket.today.push(task);
    else if(Date.parse(task.due_on+"T00:00:00.000Z")<=next)bucket.next7.push(task);
    else bucket.later.push(task);
  }
  const sort=(a,b)=>Number(a.due_on===null)-Number(b.due_on===null)||
    (a.due_on??"").localeCompare(b.due_on??"")
    ||String(a.id).localeCompare(String(b.id));
  return WORKSPACE_TEAM_SCHEDULE_BUCKETS.map(item=>({
    key:item.key,label:item.label,
    tasks:[...bucket[item.key]].sort(sort),
  }));
}
export function workspaceTeamTaskDueDatePatch(task,due,spaceId,memberIds){
  if(!task||typeof spaceId!=="string"||!spaceId||
     task.space_id!==spaceId||typeof task.id!=="string"||!task.id||
     !Array.isArray(memberIds)||memberIds.some(id=>typeof id!=="string"||!id)||
     typeof task.updated_at!=="string"||
     !Number.isFinite(Date.parse(task.updated_at))||
     typeof due!=="string"||(due!==""&&!workspaceValidTaskDay(due))||
     (task.due_on??"")===due)
    throw Error("Invalid task due date or stale schedule");
  const validated=normalizeTeamTaskDraft({
    title:task.title,details:task.details,status:task.status,
    priority:task.priority,due,assignee:task.assignee_id??"",
  },memberIds);
  return {p_space_id:spaceId,p_task_id:task.id,
    ...validated,p_expected_updated_at:task.updated_at};
}
const encoder=new TextEncoder();
export function escapeWorkspaceCalendarText(value){
  if(typeof value!=="string")throw Error("Invalid calendar text");
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,"\uFFFD").replaceAll("\\","\\\\").replace(/\r\n|\r|\n/g,"\\n")
    .replaceAll(";","\\;").replaceAll(",","\\,");
}
function calendarLine(value){
  // RFC5545 folding at 75 UTF-8 octets; continuation space consumes one.
  const parts=[];let part="",size=0;
  for(const char of value){
    const count=encoder.encode(char).length;
    if(size+count>75){parts.push(part);part=" ";size=1;}
    part+=char;size+=count;
  }
  parts.push(part);
  return parts.join("\r\n");
}
export function buildWorkspaceTeamScheduleIcs(tasks,owner,spaceId,now=new Date()){
  if(typeof owner!=="string"||!owner||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    now.getUTCFullYear()<1||now.getUTCFullYear()>9999)
    throw Error("Invalid calendar export identity or timestamp");
  const rows=authorizedTaskRows(tasks,spaceId);
  const stamp=now.toISOString().replaceAll("-","").replaceAll(":","").replace(/\.\d{3}Z$/,"Z");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ETERNYX//Workspace Team Tasks//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  let exported=0;
  for(const task of rows){
    // Completed tasks and undated tasks aren't future planning events.
    if(task.status==="done"||task.due_on===null)continue;
    if(!UUID.test(task.id)||!UUID.test(spaceId))
      throw Error("Unsafe calendar event identity");
    if(!WORKSPACE_TEAM_PRIORITIES.includes(task.priority)||
       !(task.assignee_id===null||(typeof task.assignee_id==="string"&&task.assignee_id)))
      throw Error("Malformed calendar event metadata");
    const name=escapeWorkspaceCalendarText(task.title);
    const description=escapeWorkspaceCalendarText(task.details+
      "\nStatus: "+task.status+"\nPriority: "+task.priority+
      "\nAssignee: "+(task.assignee_id?
        teamMemberLabel(task.assignee_id,owner):"Unassigned"));
    lines.push("BEGIN:VEVENT","UID:"+task.id+"@eternyx.local",
      "DTSTAMP:"+stamp,"DTSTART;VALUE=DATE:"+task.due_on.replaceAll("-",""),
      // RFC 5545: a DATE-only event without DTEND/DURATION lasts one day.
      // Avoid an unrepresentable year 10000 for the final supported date.
      ...(task.due_on==="9999-12-31"?[]:[
        "DTEND;VALUE=DATE:"+new Date(addDays(task.due_on,1)).toISOString().slice(0,10).replaceAll("-",""),
      ]),
      "SUMMARY:"+name,"DESCRIPTION:"+description,"END:VEVENT");
    exported++;
  }
  if(exported===0)throw Error("No scheduled outstanding tasks to export");
  return lines.concat(["END:VCALENDAR"]).map(calendarLine).join("\r\n")+"\r\n";
}

function validMonth(month){
  return typeof month==="string"&&/^\d{4}-\d{2}$/.test(month)&&
    !month.startsWith("0000-")&&workspaceValidTaskDay(month+"-01");
}
export function workspaceTeamShiftMonth(month,delta){
  if(!validMonth(month)||![-1,1].includes(delta))throw Error("Invalid planner month");
  const [year,number]=month.split("-").map(Number);
  const index=year*12+number-1+delta;
  const nextYear=Math.floor(index/12);
  if(nextYear<1||nextYear>9999)return null;
  return String(nextYear).padStart(4,"0")+"-"+String(index%12+1).padStart(2,"0");
}
export function workspaceTeamMonthPlan(tasks,spaceId,month){
  if(!validMonth(month))throw Error("Invalid planner month");
  const rows=authorizedTaskRows(tasks,spaceId);
  const first=new Date(month+"-01T00:00:00.000Z");
  const year=first.getUTCFullYear(),number=first.getUTCMonth()+1;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][number-1];
  const byDay=new Map();
  for(const task of rows){
    if(!task.due_on?.startsWith(month+"-"))continue;
    const bucket=byDay.get(task.due_on)??[];
    bucket.push(task);byDay.set(task.due_on,bucket);
  }
  const cells=Array.from({length:first.getUTCDay()},()=>null);
  for(let i=1;i<=days;i++){
    const date=month+"-"+String(i).padStart(2,"0");
    const tasks=[...(byDay.get(date)??[])].sort((a,b)=>a.id.localeCompare(b.id));
    const done=tasks.filter(task=>task.status==="done").length;
    cells.push({date,day:i,tasks,done,outstanding:tasks.length-done});
  }
  while(cells.length%7)cells.push(null);
  return cells;
}
