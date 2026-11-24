import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  workspaceValidTaskDay,workspaceTeamScheduleGroups,
  workspaceTeamTaskDueDatePatch,escapeWorkspaceCalendarText,
  buildWorkspaceTeamScheduleIcs,WORKSPACE_TEAM_SCHEDULE_BUCKETS,
} from "../src/lib/workspaceTeamSchedule.mjs";
const team="33333333-3333-4333-8333-333333333333";
const owner="11111111-1111-4111-8111-111111111111";
const member="22222222-2222-4222-8222-222222222222";
const version="2026-11-24T10:00:00.000Z";
const today="2026-11-24";
const id=i=>"44444444-4444-4444-8444-"+String(i).padStart(12,"0");
const task=(i,changed={})=>({
  id:id(i),space_id:team,title:"Inspect station "+i,
  details:"Measure CP potential",status:"todo",priority:"high",
  assignee_id:owner,due_on:null,updated_at:version,...changed,
});
const readPanel=()=>readFileSync(new URL(
 "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
test("validity uses strict Gregorian days including leap day and month boundaries",()=>{
  for(const day of ["2024-02-29","2026-11-24","2026-12-31","2027-01-01"])
    assert.equal(workspaceValidTaskDay(day),true);
  for(const bad of ["2026-02-29","2026-02-30","2026-11-31","2026-13-01",
    "2026-00-01","2026-2-3","tomorrow",null,""])
    assert.equal(workspaceValidTaskDay(bad),false);
});
test("planner groups only real tasks into six disjoint, deterministically sorted buckets",()=>{
  const rows=[
    task(1,{due_on:"2026-11-23"}),
    task(2,{due_on:"2026-11-24"}),
    task(3,{due_on:"2026-12-01"}),
    task(4,{due_on:"2026-12-02"}),
    task(5,{due_on:null}),
    task(6,{status:"done",due_on:"2026-11-10"}),
    task(7,{due_on:"2026-11-27"}),
  ];
  const groups=workspaceTeamScheduleGroups(rows,team,today);
  assert.deepEqual(groups.map(g=>g.key),WORKSPACE_TEAM_SCHEDULE_BUCKETS.map(g=>g.key));
  assert.deepEqual(groups.map(g=>g.tasks.map(t=>t.id)),[
    [id(1)],[id(2)],[id(7),id(3)],[id(4)],[id(5)],[id(6)],
  ]);
  assert.equal(groups.reduce((n,g)=>n+g.tasks.length,0),rows.length);
  assert.equal(rows[2].due_on,"2026-12-01");
});
test("planner date boundaries work across New Year and completed tasks stay out of overdue",()=>{
  const rows=[task(1,{due_on:"2026-12-31"}),task(2,{due_on:"2027-01-01"}),
    task(3,{due_on:"2027-01-06"}),task(4,{due_on:"2027-01-08"}),
    task(5,{status:"done",due_on:"2026-01-01"})];
  const groups=workspaceTeamScheduleGroups(rows,team,"2026-12-31");
  assert.deepEqual(groups.map(g=>g.tasks.length),[0,1,2,1,0,1]);
});
test("schedule rejects duplicate, foreign, malformed and oversized records",()=>{
  const good=task(1);
  for(const rows of [
    [good,good],[{...good,space_id:"another"}],
    [{...good,id:""}],[{...good,status:"deleted"}],
    [{...good,due_on:"2026-02-30"}],[{...good,title:""}],
    [{...good,details:null}], [null],
  ]) assert.throws(()=>workspaceTeamScheduleGroups(rows,team,today),/Malformed, duplicate or cross-team/);
  assert.throws(()=>workspaceTeamScheduleGroups([],team,"bad day"),/Invalid schedule reference/);
  assert.throws(()=>workspaceTeamScheduleGroups([good],"",today),/Invalid team schedule scope/);
  assert.throws(()=>workspaceTeamScheduleGroups(
    Array.from({length:501},(_,i)=>task(i)),team,today),/Invalid team schedule scope/);
});
test("direct date edit sends complete unchanged fields and expected server revision",()=>{
  const t=task(1,{due_on:null,assignee_id:member,status:"in_progress",priority:"urgent"});
  const original=structuredClone(t);
  assert.deepEqual(workspaceTeamTaskDueDatePatch(t,"2026-12-01",team,[owner,member]),{
    p_space_id:team,p_task_id:id(1),p_title:t.title,p_details:t.details,
    p_status:"in_progress",p_priority:"urgent",p_due_on:"2026-12-01",
    p_assignee_id:member,p_expected_updated_at:version,
  });
  assert.equal(workspaceTeamTaskDueDatePatch(task(2,{due_on:"2026-12-01"}),
    "",team,[owner]).p_due_on,null);
  assert.deepEqual(t,original);
});
test("quick date edits reject invalid calendar days, unchanged dates and nonmembers",()=>{
  const t=task(1,{due_on:"2026-11-24"});
  for(const [row,date,scope,memberIds] of [
    [t,"2026-11-24",team,[owner]],
    [t,"2026-02-30",team,[owner]],
    [t,"tomorrow",team,[owner]],
    [t,"2026-11-25","other",[owner]],
    [{...t,updated_at:"not a timestamp"},"2026-11-25",team,[owner]],
    [{...t,assignee_id:member},"2026-11-25",team,[owner]],
    [{...t,id:""},"2026-11-25",team,[owner]],
  ])assert.throws(()=>workspaceTeamTaskDueDatePatch(row,date,scope,memberIds));
});
test("iCalendar exports only dated outstanding authorized tasks with correct exclusive end date",()=>{
  const rows=[task(1,{due_on:"2026-12-31",assignee_id:member}),
    task(2,{due_on:"2026-11-24",status:"done"}),
    task(3,{due_on:null}),task(4,{due_on:"2026-11-25"})];
  const ics=buildWorkspaceTeamScheduleIcs(rows,owner,team,new Date(version));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
  assert.match(ics,/DTSTART;VALUE=DATE:20261231/);
  assert.match(ics,/DTEND;VALUE=DATE:20270101/);
  assert.match(ics,/UID:44444444-4444-4444-8444-000000000001@eternyx.local/);
  assert.ok(!ics.includes(id(2))&&!ics.includes(id(3)));
  assert.ok(!ics.includes(member),"Member UUID is never serialized as assignee");
  assert.ok(ics.replace(/\r\n /g,"").includes("Member 22222222"));
});
test("iCalendar escapes malicious line breaks and folds UTF-8 lines at 75 bytes",()=>{
  const name="Résumé ".repeat(32)+"\nBEGIN:VALARM";
  const details="=SUM(1,2);hello,world\\raw\r\nEND:VEVENT";
  const row=task(1,{due_on:"2026-11-24",title:name,details});
  const result=buildWorkspaceTeamScheduleIcs([row],owner,team,new Date(version));
  assert.ok(result.includes("SUMMARY:"));
  const unfolded=result.replace(/\r\n /g,"");
  assert.ok(unfolded.includes("\\nBEGIN:VALARM"));
  assert.ok(unfolded.includes("\\nEND:VEVENT"));
  assert.ok(unfolded.includes("\\;hello\\,world\\\\raw"));
  assert.equal((result.match(/BEGIN:VEVENT/g)||[]).length,1);
  for(const line of result.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length<=75,"Overlong iCalendar line");
  assert.equal(escapeWorkspaceCalendarText("hello,\nworld"),"hello\\,\\nworld");
});
test("iCalendar refuses empty schedules, malformed identities and foreign scopes",()=>{
  assert.throws(()=>buildWorkspaceTeamScheduleIcs([
    task(1,{status:"done",due_on:"2026-11-24"}),
    task(2,{due_on:null}),
  ],owner,team,new Date(version)),/No scheduled outstanding tasks/);
  assert.throws(()=>buildWorkspaceTeamScheduleIcs([task(1,{due_on:"2026-11-25"})],
    "",team,new Date(version)),/Invalid calendar export identity/);
  assert.throws(()=>buildWorkspaceTeamScheduleIcs([task(1,{due_on:"2026-11-25",space_id:"other"})],
    owner,team,new Date(version)),/cross-team schedule/);
  assert.throws(()=>buildWorkspaceTeamScheduleIcs([task(1,{due_on:"2026-11-25",id:"unsafe\nuid"})],
    owner,team,new Date(version)),/Unsafe calendar event identity/);
  assert.throws(()=>buildWorkspaceTeamScheduleIcs([task(1,{due_on:"2026-11-25"})],
    owner,team,new Date(NaN)),/Invalid calendar export/);
});
test("schedule UI uses existing verified rows, proper role checks, CSV and calendar export",()=>{
  const panel=readPanel();
  for(const anchor of [
    'const [taskLayout,setTaskLayout]=useState<"list"|"board"|"schedule">("list");',
    'workspaceTeamScheduleGroups(visibleTasks,selected.id,today)',
    'aria-label="Shared team task schedule"',
    'scheduleGroups.map(group=><section',
    'group.tasks.map(task=>renderTeamTask(task,true))',
    'onClick={()=>setTaskLayout("schedule")}',
    'buildWorkspaceTeamScheduleIcs(visibleTasks,owner,selected.id)',
    'disabled={disabled||busy||loading||!currentRole||!scheduledCount}',
    'aria-label={"Change due date for "+task.title}',
    'workspaceTeamTaskDueDatePatch(task,due,selected.id,memberIds)',
    'supabase.rpc("workspace_team_save_task",params)',
    'verifiedSpaceId!==selected.id',
    'if(draft.id===task.id)setDraft(freshDraft());',
    'setTaskLayout("list");setDiscussionTaskId(null);',
  ])assert.ok(panel.includes(anchor),anchor);
  assert.equal(panel.split('setTaskLayout("list");setDiscussionTaskId(null);').length-1,2);
  const changes=panel.slice(panel.indexOf("const changeTaskDueDate="),
    panel.indexOf("const startBoardDrag="));
  assert.ok(!changes.includes("setTasks("),"No optimistic fake task reschedule");
});
