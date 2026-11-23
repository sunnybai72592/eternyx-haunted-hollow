import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 WORKSPACE_TEAM_BOARD_COLUMNS,workspaceTeamBoardColumns,
 workspaceTeamNextTaskStatus,workspaceTeamNextTaskLabel,
 workspaceTeamTaskStatusPayload,
} from "../src/lib/workspaceTeamTaskBoard.mjs";
import {selectWorkspaceTeamTasks} from "../src/lib/workspaceTeamTaskOperations.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const editor="22222222-2222-4222-8222-222222222222";
const team="33333333-3333-4333-8333-333333333333";
const ts="2026-11-23T12:00:00.000Z",today="2026-11-23";
const task=(id,status="todo",changed={})=>({
 id,space_id:team,title:"Inspect "+id,details:"Review field readings",
 status,priority:"high",due_on:"2026-11-25",assignee_id:owner,
 updated_at:ts,...changed,
});
const source=()=>readFileSync(new URL(
 "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");

test("three real board columns use exact server statuses, preserving filtered sort and immutability",()=>{
 const input=[task("a","in_progress"),task("b","todo"),
   task("c","done"),task("d","todo")];
 const output=workspaceTeamBoardColumns(input,team);
 assert.deepEqual(output.map(c=>c.status),["todo","in_progress","done"]);
 assert.deepEqual(output.map(c=>c.label),["To do","In progress","Done"]);
 assert.deepEqual(output.map(c=>c.tasks.map(t=>t.id)),[["b","d"],["a"],["c"]]);
 assert.deepEqual(input.map(t=>t.id),["a","b","c","d"]);
 assert.equal(output[0].tasks[0],input[1]);
 assert.equal(WORKSPACE_TEAM_BOARD_COLUMNS.length,3);
});
test("the board only groups the tasks returned from existing search and filters",()=>{
 const input=[
   task("a","todo",{title:"Holiday setup"}),
   task("b","in_progress",{title:"Coating report"}),
   task("c","done",{title:"Holiday complete"}),
 ];
 const chosen=selectWorkspaceTeamTasks(input,{
   filter:"all",search:"holiday",sort:"title",owner,today});
 assert.deepEqual(workspaceTeamBoardColumns(chosen,team)
   .map(c=>c.tasks.map(t=>t.id)),[["a"],[],["c"]]);
 const outstanding=selectWorkspaceTeamTasks(input,{
   filter:"outstanding",search:"",sort:"title",owner,today});
 assert.deepEqual(workspaceTeamBoardColumns(outstanding,team)
   .map(c=>c.tasks.map(t=>t.id)),[["a"],["b"],[]]);
});
test("missing scope, foreign tasks, duplicate cards, invalid statuses and >500 records fail closed",()=>{
 for(const bad of [
   [task("a","todo",{space_id:"foreign"})],
   [task("a"),task("a")],
   [task("b","blocked")],
   [task("", "todo")],
   [task("a","todo",{title:"  "})],
   [null],
 ]) assert.throws(()=>workspaceTeamBoardColumns(bad,team),
   /malformed, duplicated or cross-team/);
 assert.throws(()=>workspaceTeamBoardColumns([task("a")],""),/Invalid team board scope/);
 assert.throws(()=>workspaceTeamBoardColumns(null,team),/Invalid team board scope/);
 assert.throws(()=>workspaceTeamBoardColumns(
   Array.from({length:501},(_,i)=>task("task-"+i)),team),/Invalid team board scope/);
 assert.equal(workspaceTeamBoardColumns([],team).length,3);
});
test("real status transition cycle has clear labels and never guesses an unknown status",()=>{
 assert.equal(workspaceTeamNextTaskStatus(task("a","todo")),"in_progress");
 assert.equal(workspaceTeamNextTaskStatus(task("a","in_progress")),"done");
 assert.equal(workspaceTeamNextTaskStatus(task("a","done")),"in_progress");
 assert.equal(workspaceTeamNextTaskLabel(task("a","todo")),"Start work");
 assert.equal(workspaceTeamNextTaskLabel(task("a","in_progress")),"Mark done");
 assert.equal(workspaceTeamNextTaskLabel(task("a","done")),"Reopen");
 assert.throws(()=>workspaceTeamNextTaskStatus(task("x","unknown")),/Invalid/);
 assert.throws(()=>workspaceTeamNextTaskLabel(null),/Invalid/);
});
test("quick move uses full server task fields and exact updated_at concurrency expectation",()=>{
 const input=task("abc","in_progress",{
   title:"Check pipeline",details:"Record CP readings",due_on:"2026-11-26",
   priority:"urgent",assignee_id:editor,
 });
 const snapshot=structuredClone(input);
 const result=workspaceTeamTaskStatusPayload(input,"done",team,[owner,editor]);
 assert.deepEqual(result,{
   p_space_id:team,p_task_id:"abc",p_title:"Check pipeline",
   p_details:"Record CP readings",p_status:"done",p_priority:"urgent",
   p_due_on:"2026-11-26",p_assignee_id:editor,
   p_expected_updated_at:ts,
 });
 assert.deepEqual(input,snapshot,"Status helper must not mutate source rows");
});
test("quick status edits refuse out-of-team, stale, illegal transitions and unlisted assignees",()=>{
 const good=task("abc");
 for(const [input,next,space,members] of [
   [good,"done",team,[owner]],
   [good,"todo",team,[owner]],
   [good,"in_progress","other",[owner]],
   [task("abc","todo",{updated_at:"bad"}),"in_progress",team,[owner]],
   [task("abc","todo",{assignee_id:editor}),"in_progress",team,[owner]],
   [task("abc","todo",{priority:"unsafe"}),"in_progress",team,[owner]],
   [task("abc","todo",{due_on:"tomorrow"}),"in_progress",team,[owner]],
   [task("abc","done"),"todo",team,[owner]],
 ])assert.throws(()=>workspaceTeamTaskStatusPayload(input,next,space,members));
 assert.throws(()=>workspaceTeamTaskStatusPayload(null,"in_progress",team,[owner]));
});
test("rendered board shares list cards, filters and scope checks rather than mock states",()=>{
 const ui=source();
 for(const anchor of [
   'const [taskLayout,setTaskLayout]=useState<"list"|"board">("list");',
   "workspaceTeamBoardColumns(visibleTasks,selected.id)",
   'aria-label="Team task layout"',
   'aria-pressed={taskLayout==="board"}',
   'aria-label="Shared team task board"',
   'aria-label={column.label+" tasks"}',
   'column.tasks.map(task=>renderTeamTask(task,true))',
   'visibleTasks.map(task=>renderTeamTask(task))',
   "setTaskLayout(\"list\");setDiscussionTaskId(null);",
   'aria-label={"Edit "+task.title}',
   'aria-label={workspaceTeamNextTaskLabel(task)+" — "+task.title}',
 ])assert.ok(ui.includes(anchor),"Missing board UI source: "+anchor);
 assert.equal(ui.split('setTaskLayout("list");setDiscussionTaskId(null);').length-1,2,
   "Layout must reset on team/account changes");
});
test("quick writes use existing scoped RPC, expected timestamp and owner-fenced mutation runner",()=>{
 const ui=source();
 const run=ui.slice(ui.indexOf("const quickMoveTask="),ui.indexOf("const renderTeamTask="));
 for(const anchor of [
   "if(!selected||!editor||disabled||busy||!spaceListVerified||",
   "verifiedSpaceId!==selected.id",
   "const next=workspaceTeamNextTaskStatus(task);",
   "workspaceTeamTaskStatusPayload(task,next,selected.id,memberIds)",
   'supabase.rpc("workspace_team_save_task",params)',
   "if(queryError||!data)throw new Error(",
   "void run(async()=>",
   "if(draft.id===task.id)setDraft(freshDraft());",
 ])assert.ok(run.includes(anchor),anchor);
 assert.ok(!run.includes("setTasks("),"Never fake a local status change");
 assert.ok(!run.includes(".update("),"No direct table bypass of scoped RPC");
});
