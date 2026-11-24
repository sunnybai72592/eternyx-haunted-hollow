import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  workspaceTeamLocalDay,workspaceTeamTaskDueBucket,
  workspaceTeamTaskSummary,selectWorkspaceTeamTasks,buildWorkspaceTeamTasksCsv,
  WORKSPACE_TEAM_TASK_VIEW_LIMIT,workspaceTeamWorkload,workspaceTeamWorkloadView,WORKSPACE_TEAM_WORKLOAD_METRICS,
} from "../src/lib/workspaceTeamTaskOperations.mjs";
import {verifyWorkspaceTeamSpacePage} from "../src/lib/workspaceTeamAccess.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const teammate="22222222-2222-4222-8222-222222222222";
const spaceId="33333333-3333-4333-8333-333333333333";
const today="2026-11-23";
function task(id,updates={}){
  return {id,space_id:spaceId,title:"Inspect "+id,details:"Check coating",
    status:"todo",priority:"normal",assignee_id:null,due_on:null,
    updated_at:"2026-11-23T10:00:00.000Z",...updates};
}
const tasks=[
  task("one",{title:"Overdue coating",due_on:"2026-11-22",priority:"urgent",assignee_id:owner}),
  task("two",{title:"Holiday detector",details:"Setup at site",due_on:"2026-11-25",priority:"high",assignee_id:teammate}),
  task("three",{title:"Completed",status:"done",due_on:"2026-11-20",priority:"low"}),
  task("four",{title:"Future job",due_on:"2026-12-30",updated_at:"2026-11-24T10:00:00.000Z"}),
];
test("local calendar day uses human date rather than UTC timestamp slicing",()=>{
  assert.equal(workspaceTeamLocalDay(new Date(2026,10,23,23,59,59)),"2026-11-23");
  assert.throws(()=>workspaceTeamLocalDay(new Date(NaN)),/Invalid local date/);
});
test("overdue and upcoming dates are calendar-safe across month and year boundaries",()=>{
  assert.equal(workspaceTeamTaskDueBucket(task("a",{due_on:"2026-11-22"}),today),"overdue");
  assert.equal(workspaceTeamTaskDueBucket(task("b",{due_on:today}),today),"upcoming");
  assert.equal(workspaceTeamTaskDueBucket(task("c",{due_on:"2026-11-30"}),today),"upcoming");
  assert.equal(workspaceTeamTaskDueBucket(task("d",{due_on:"2026-12-01"}),today),"none");
  assert.equal(workspaceTeamTaskDueBucket(task("e",{due_on:"2027-01-05"}),"2026-12-30"),"upcoming");
  assert.equal(workspaceTeamTaskDueBucket(task("f",{due_on:"2026-12-29"}),"2026-12-30"),"overdue");
  assert.equal(workspaceTeamTaskDueBucket(task("g",{status:"done",due_on:"2026-11-01"}),today),"none");
  assert.equal(workspaceTeamTaskDueBucket(task("h",{due_on:"2026-02-30"}),today),"none");
});
test("summary comes from actual team rows and completed tasks never count as overdue",()=>{
  assert.deepEqual(workspaceTeamTaskSummary(tasks,today),{
    total:4,done:1,outstanding:3,overdue:1,upcoming:1,
  });
  assert.deepEqual(workspaceTeamTaskSummary([],today),{
    total:0,done:0,outstanding:0,overdue:0,upcoming:0,
  });
});
test("search, owner assignment, overdue, upcoming and done filters compose correctly",()=>{
  const by=(filter,search="")=>selectWorkspaceTeamTasks(tasks,{filter,search,sort:"updated",owner,today});
  assert.deepEqual(by("mine").map(x=>x.id),["one"]);
  assert.deepEqual(by("unassigned").map(x=>x.id),["four","three"]);
  assert.deepEqual(by("outstanding").map(x=>x.id),["four","one","two"]);
  assert.deepEqual(by("overdue").map(x=>x.id),["one"]);
  assert.deepEqual(by("upcoming").map(x=>x.id),["two"]);
  assert.deepEqual(by("done").map(x=>x.id),["three"]);
  assert.deepEqual(by("all","  HOLIDAY  ").map(x=>x.id),["two"]);
  assert.deepEqual(by("all","  SITE ").map(x=>x.id),["two"]);
  assert.deepEqual(by("upcoming","holiday").map(x=>x.id),["two"]);
  assert.deepEqual(by("overdue","holiday"),[]);
});
test("stable sorting supports earliest due, urgency, title and newest update without changing source",()=>{
  const ids=sort=>selectWorkspaceTeamTasks(tasks,{sort,owner,today}).map(x=>x.id);
  assert.deepEqual(ids("due"),["three","one","two","four"]);
  assert.deepEqual(ids("priority"),["one","two","four","three"]);
  assert.deepEqual(ids("title"),["three","four","two","one"]);
  assert.deepEqual(ids("updated"),["four","one","three","two"]);
  assert.deepEqual(tasks.map(x=>x.id),["one","two","three","four"]);
});
test("unknown filters, huge queries, invalid dates and oversized views fail closed",()=>{
  for(const change of [
    {filter:"eval"},{sort:"random"},{search:"x".repeat(121)},{today:"not a date"},
    {owner:null},
  ])assert.throws(()=>selectWorkspaceTeamTasks(tasks,{
    filter:"all",sort:"updated",owner,today,...change,
  }),/Invalid team task view controls/);
  const oversized=Array.from({length:WORKSPACE_TEAM_TASK_VIEW_LIMIT+1},(_,i)=>task("t"+i));
  assert.throws(()=>selectWorkspaceTeamTasks(oversized,{today}),/Invalid team task view controls/);
  assert.throws(()=>workspaceTeamTaskSummary(oversized,today),/Invalid current team task snapshot/);
});
test("filtered CSV has only selected authorized rows, safe cell quoting and no raw member UUID",()=>{
  const special=task("safe",{title:"=HYPERLINK(\"https://bad.example\",\"x\")",
    details:" \t+SUM(1,2)\nsecond line",assignee_id:teammate});
  const csv=buildWorkspaceTeamTasksCsv([special],owner,spaceId);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv,/"'=HYPERLINK/);
  assert.match(csv,/"' \t\+SUM/);
  assert.match(csv,/""https:\/\/bad\.example""/);
  assert.match(csv,/Member 22222222/);
  assert.ok(!csv.includes(teammate), "Exports must pseudonymize teammates");
  assert.ok(!csv.includes("one")&&!csv.includes("two"));
  assert.ok(csv.endsWith("\r\n"));
});
test("CSV refuses cross-team rows, malformed statuses, duplicate IDs and >500 exports",()=>{
  const good=task("one");
  for(const bad of [
    [{...good,space_id:"other"}],[{...good,status:"deleted"}],
    [{...good,updated_at:"garbled"}],[{...good,due_on:"2026-02-30"}],
    [good,good],[{...good,title:""}],
  ])assert.throws(()=>buildWorkspaceTeamTasksCsv(bad,owner,spaceId),/Invalid or cross-team/);
  assert.throws(()=>buildWorkspaceTeamTasksCsv([good],"",spaceId),/Invalid authorized/);
  assert.throws(()=>buildWorkspaceTeamTasksCsv(Array.from({length:501},(_,i)=>task(""+i)),owner,spaceId),
    /Invalid authorized/);
});
test("team directory exact count prevents off-page membership from appearing revoked",()=>{
  const row={id:spaceId,owner_id:owner,status:"active"};
  assert.deepEqual(verifyWorkspaceTeamSpacePage([row],1),[row]);
  assert.deepEqual(verifyWorkspaceTeamSpacePage([],0),[]);
  for(const [rows,count] of [
    [[row],2],[[row],null],[[row],151],[[row,row],2],
    [[{...row,status:"disabled"}],1],[[{...row,owner_id:""}],1],
  ])assert.throws(()=>verifyWorkspaceTeamSpacePage(rows,count),/directory incomplete/);
});
test("real UI wires triage, CSV boundary, and account/team-scoped view reset",()=>{
  const panel=readFileSync(new URL(
    "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const anchor of [
    'supabase.from("workspace_team_spaces")',
    '.select("*",{count:"exact"}).order("created_at",{ascending:false}).limit(150)',
    'verifyWorkspaceTeamSpacePage(data,count)',
    'setTaskFilter("all");setTaskQuery("");setTaskSort("updated");',
    'selectWorkspaceTeamTasks(tasks,{',
    'buildWorkspaceTeamTasksCsv(visibleTasks,owner,selected.id)',
    'verifiedSpaceId!==selected.id',
    'Export visible CSV',
    'aria-label="Search shared team tasks"',
    'aria-label="Sort shared team tasks"',
    'workspaceTeamTaskDueBucket(task,today)==="overdue"',
    'window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);',
  ])assert.ok(panel.includes(anchor),anchor);
  assert.equal(panel.split('setTaskFilter("all");setTaskQuery("");setTaskSort("updated");').length-1,3);
});

const roster=[
  {space_id:spaceId,user_id:owner,role:"owner"},
  {space_id:spaceId,user_id:teammate,role:"editor"},
  {space_id:spaceId,user_id:"viewer",role:"viewer"},
];
test("workload reconciles all task counts, zero-task members and unassigned work",()=>{
  const rows=workspaceTeamWorkload(tasks,roster,owner,spaceId,today);
  assert.equal(rows.reduce((n,row)=>n+row.total,0),4);
  assert.equal(rows.reduce((n,row)=>n+row.outstanding,0),3);
  assert.equal(rows.reduce((n,row)=>n+row.done,0),1);
  assert.deepEqual(rows.find(row=>row.filter==="mine"),{
    key:"member:"+owner,label:"You",filter:"mine",total:1,outstanding:1,
    inProgress:0,done:0,overdue:1,upcoming:0,urgent:1,
  });
  assert.equal(rows.find(row=>row.filter==="viewer").total,0);
  assert.equal(rows.find(row=>row.filter==="unassigned").total,2);
  assert.equal(rows[0].filter,"mine");
});
test("completed urgent tasks never count in outstanding urgency or deadline metrics",()=>{
  const rows=workspaceTeamWorkload([
    task("done",{assignee_id:owner,status:"done",priority:"urgent",due_on:"2026-11-20"}),
    task("active",{assignee_id:owner,status:"in_progress",priority:"urgent",due_on:today}),
  ],roster,owner,spaceId,today);
  const mine=rows.find(row=>row.filter==="mine");
  assert.equal(mine.done,1);assert.equal(mine.inProgress,1);
  assert.equal(mine.urgent,1);assert.equal(mine.overdue,0);assert.equal(mine.upcoming,1);
});
test("unknown assignees are grouped without raw identity or drilldown",()=>{
  const unknown="private-former-member";
  const rows=workspaceTeamWorkload([task("a",{assignee_id:unknown})],roster,owner,spaceId,today);
  const row=rows.find(row=>row.key==="unknown");
  assert.equal(row.total,1);assert.equal(row.filter,null);
  assert.ok(!JSON.stringify(rows).includes(unknown));
});
test("workload fails closed on foreign rows, duplicate IDs, missing membership and invalid inputs",()=>{
  for(const bad of [[tasks[0],tasks[0]],[{...tasks[0],space_id:"other"}],
    [{...tasks[0],priority:"invalid"}],[{...tasks[0],due_on:"2026-02-30"}],
    Array.from({length:501},(_,i)=>task(String(i)))])
    assert.throws(()=>workspaceTeamWorkload(bad,roster,owner,spaceId,today));
  for(const members of [[],[roster[1]],[...roster,roster[0]],
    [roster[0],{...roster[1],space_id:"other"}],[roster[0],{...roster[1],role:"bad"}]])
    assert.throws(()=>workspaceTeamWorkload(tasks,members,owner,spaceId,today));
  assert.throws(()=>workspaceTeamWorkload(tasks,roster,owner,spaceId,"invalid"));
});
test("workload drilldown agrees with the current task filters and does not mutate source",()=>{
  const before=structuredClone(tasks);
  const rows=workspaceTeamWorkload(tasks,roster,owner,spaceId,today);
  for(const row of rows.filter(row=>row.filter!==null)){
    const select=filter=>selectWorkspaceTeamTasks(tasks,{
      owner,today,filter,assignee:row.filter,memberIds:roster.map(m=>m.user_id),
    });
    assert.equal(select("outstanding").length,row.outstanding);
    assert.equal(select("overdue").length,row.overdue);
  }
  assert.deepEqual(tasks,before);
});
test("workload UI is verified, read-only and resets its view on account/team changes",()=>{
  const panel=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const anchor of [
    'selected&&currentRole?workspaceTeamWorkload(tasks,members,owner,selected.id,today):[]',
    'aria-label="Team workload overview"',
    'setCalendarDay(null);setShowWorkload(false);',
    'setTaskAssigneeFilter(view.assignee);setTaskFilter(view.filter);',
    'setTaskQuery(view.search);setTaskPriorityFilter(view.priority);setTaskSort(view.sort);',
    'row.filter!==null&&row[metric]>0',
    'verifiedSpaceId!==selected.id',
    'Counts measure task volume, not hours, capacity or member performance.',
  ])assert.ok(panel.includes(anchor),anchor);
  assert.equal(panel.split('setCalendarDay(null);setShowWorkload(false);').length-1,2);
  const handler=panel.slice(panel.indexOf("const openWorkloadTasks="),panel.indexOf("const exportTaskView="));
  assert.ok(!handler.includes("supabase.")&&!handler.includes("setTasks("));
});

test("all six workload metrics drill down to exactly their actual task counts",()=>{
  const rows=[...tasks,
    task("active",{status:"in_progress",priority:"urgent",assignee_id:owner,due_on:today}),
    task("done2",{status:"done",priority:"urgent",assignee_id:owner,due_on:today}),
  ];
  const workload=workspaceTeamWorkload(rows,roster,owner,spaceId,today);
  const before=structuredClone(rows);
  for(const row of workload){
    if(row.filter===null)continue;
    for(const metric of WORKSPACE_TEAM_WORKLOAD_METRICS){
      if(!row[metric]){
        assert.throws(()=>workspaceTeamWorkloadView(workload,row.filter,metric));
        continue;
      }
      const view=workspaceTeamWorkloadView(workload,row.filter,metric);
      assert.equal(selectWorkspaceTeamTasks(rows,{...view,owner,today,memberIds:roster.map(m=>m.user_id)}).length,row[metric]);
    }
  }
  assert.deepEqual(rows,before);
});
test("drilldowns refuse unknown, empty, stale and invented metric selections",()=>{
  const rows=workspaceTeamWorkload(tasks,roster,owner,spaceId,today);
  for(const [assignee,metric] of [[null,"outstanding"],["foreign","outstanding"],
    ["mine","fake"],["viewer","outstanding"],["mine","done"]])
    assert.throws(()=>workspaceTeamWorkloadView(rows,assignee,metric));
  assert.throws(()=>workspaceTeamWorkloadView([], "mine","outstanding"));
});
test("today, undated and in-progress filters compose with assignment and urgency",()=>{
  const rows=[task("a",{due_on:today,status:"in_progress",assignee_id:owner,priority:"urgent"}),
    task("b",{due_on:today,status:"done"}),task("c",{due_on:null,status:"todo"}),
    task("d",{due_on:null,status:"done"}),task("e",{due_on:"2026-11-24",status:"in_progress"})];
  const by=(filter,extra={})=>selectWorkspaceTeamTasks(rows,{filter,today,owner,...extra}).map(t=>t.id);
  assert.deepEqual(by("today"),["a"]);
  assert.deepEqual(by("unscheduled"),["c"]);
  assert.deepEqual(by("in_progress"),["a","e"]);
  assert.deepEqual(by("in_progress",{assignee:"mine",priority:"urgent"}),["a"]);
});
test("date sort places no due date after the latest representable real date",()=>{
  const rows=[task("a",{due_on:null}),task("z",{due_on:"9999-12-31"})];
  assert.deepEqual(selectWorkspaceTeamTasks(rows,{today,sort:"due"}).map(t=>t.id),["z","a"]);
  assert.equal(workspaceTeamTaskDueBucket(rows[1],"9999-12-29"),"upcoming");
});
test("triage controls are accessible and reuse verified list filters without writes",()=>{
  const panel=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
  for(const anchor of ['workspaceTeamWorkloadView(workload,assignee,metric)',
    '["today","Due today"]','["unscheduled","No due date"]',
    '["in_progress","In progress"]','aria-pressed={taskFilter===value}',
    'Reset task filters and sort','setTaskLayout("list");'])
    assert.ok(panel.includes(anchor),anchor);
  const handler=panel.slice(panel.indexOf("const openWorkloadTasks="),panel.indexOf("const exportTaskView="));
  assert.ok(!handler.includes("supabase.")&&!handler.includes("setTasks("));
});
