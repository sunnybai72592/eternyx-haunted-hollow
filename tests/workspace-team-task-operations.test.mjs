import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  workspaceTeamLocalDay,workspaceTeamTaskDueBucket,
  workspaceTeamTaskSummary,selectWorkspaceTeamTasks,buildWorkspaceTeamTasksCsv,
  WORKSPACE_TEAM_TASK_VIEW_LIMIT,
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
  assert.equal(panel.split('setTaskFilter("all");setTaskQuery("");setTaskSort("updated");').length-1,2);
});
