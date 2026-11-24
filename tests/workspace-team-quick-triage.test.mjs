import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  workspaceTeamTaskQuickPatch,
} from "../src/lib/workspaceTeamTaskBoard.mjs";
import {
  selectWorkspaceTeamTasks,resolveWorkspaceAssigneeFilter,
} from "../src/lib/workspaceTeamTaskOperations.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const editor="22222222-2222-4222-8222-222222222222";
const team="33333333-3333-4333-8333-333333333333";
const timestamp="2026-11-24T10:00:00.000Z";
const today="2026-11-24";
function task(id,overrides={}){
  return {
    id,space_id:team,title:"Inspect "+id,details:"Check CP and coating",
    status:"todo",priority:"normal",due_on:"2026-11-25",
    assignee_id:null,updated_at:timestamp,...overrides,
  };
}
const members=[owner,editor];
const boardSource=()=>readFileSync(new URL(
  "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");

test("claim task uses same backend RPC snapshot and never edits other task fields",()=>{
  const original=task("a");
  const saved=structuredClone(original);
  const payload=workspaceTeamTaskQuickPatch(original,{assignee_id:owner},team,members);
  assert.deepEqual(payload,{
    p_space_id:team,p_task_id:"a",p_title:"Inspect a",
    p_details:"Check CP and coating",p_status:"todo",
    p_priority:"normal",p_due_on:"2026-11-25",
    p_assignee_id:owner,p_expected_updated_at:timestamp,
  });
  assert.deepEqual(original,saved);
});
test("release task preserves details, status, priority and due date",()=>{
  const original=task("a",{assignee_id:owner,status:"in_progress",priority:"urgent"});
  const payload=workspaceTeamTaskQuickPatch(original,{assignee_id:null},team,members);
  assert.equal(payload.p_assignee_id,null);
  assert.equal(payload.p_status,"in_progress");
  assert.equal(payload.p_priority,"urgent");
  assert.equal(payload.p_due_on,"2026-11-25");
  assert.equal(payload.p_expected_updated_at,timestamp);
});
test("inline priority change preserves owner and task revision",()=>{
  const original=task("a",{assignee_id:editor,priority:"low"});
  const payload=workspaceTeamTaskQuickPatch(original,{priority:"high"},team,members);
  assert.equal(payload.p_priority,"high");
  assert.equal(payload.p_assignee_id,editor);
  assert.equal(payload.p_expected_updated_at,timestamp);
  assert.equal(original.priority,"low");
});
test("quick patch rejects foreign spaces, unavailable members and invalid priorities",()=>{
  const baseline=task("a");
  for(const [row,change,scope,ids] of [
    [baseline,{assignee_id:editor},"another",members],
    [baseline,{assignee_id:"stranger"},team,members],
    [baseline,{assignee_id:owner},team,[]],
    [baseline,{priority:"critical"},team,members],
    [baseline,{priority:"normal"},team,members],
    [baseline,{assignee_id:null},team,members],
    [task("a",{assignee_id:owner}),{assignee_id:owner},team,members],
    [task("a",{updated_at:"invalid"}),{priority:"urgent"},team,members],
    [task("a",{due_on:"tomorrow"}),{priority:"urgent"},team,members],
    [task("",{}),{priority:"urgent"},team,members],
  ])assert.throws(()=>workspaceTeamTaskQuickPatch(row,change,scope,ids));
});
test("quick patch accepts only one supported field and rejects malformed inputs",()=>{
  const row=task("a");
  for(const change of [
    null,[],{}, {priority:"urgent",assignee_id:owner},
    {status:"done"},{title:"changed"},{priority:null},
    {assignee_id:42},{assignee_id:undefined},
  ])assert.throws(()=>workspaceTeamTaskQuickPatch(row,change,team,members));
  assert.throws(()=>workspaceTeamTaskQuickPatch(null,{priority:"low"},team,members));
  assert.throws(()=>workspaceTeamTaskQuickPatch(row,{priority:"urgent"},team,[null]));
});
const list=[
  task("a",{priority:"urgent",assignee_id:owner,title:"Urgent survey"}),
  task("b",{priority:"high",assignee_id:editor,title:"Coating report"}),
  task("c",{priority:"high",assignee_id:null,title:"Holiday test"}),
  task("d",{priority:"low",assignee_id:owner,title:"Site walk",status:"done"}),
];
const select=(changed={})=>selectWorkspaceTeamTasks(list,{
  owner,today,memberIds:members,priority:"all",assignee:"all",
  filter:"all",search:"",sort:"title",...changed,
});
test("priority filter composes with search, status and exact team-assignee filters",()=>{
  assert.deepEqual(select({priority:"urgent"}).map(x=>x.id),["a"]);
  assert.deepEqual(select({priority:"high"}).map(x=>x.id),["b","c"]);
  assert.deepEqual(select({assignee:"mine"}).map(x=>x.id),["d","a"]);
  assert.deepEqual(select({assignee:"unassigned"}).map(x=>x.id),["c"]);
  assert.deepEqual(select({assignee:editor}).map(x=>x.id),["b"]);
  assert.deepEqual(select({assignee:editor,priority:"high"}).map(x=>x.id),["b"]);
  assert.deepEqual(select({priority:"high",search:"Holiday"}).map(x=>x.id),["c"]);
  assert.deepEqual(select({filter:"done",assignee:"mine"}).map(x=>x.id),["d"]);
  assert.deepEqual(select({filter:"outstanding",assignee:"mine"}).map(x=>x.id),["a"]);
});
test("unknown assignee, revoked member and unsupported priorities fail closed",()=>{
  for(const changed of [
    {priority:"critical"},{priority:null},{assignee:"other"},
    {assignee:editor,memberIds:[owner]},{assignee:null},{memberIds:[null]},
  ])assert.throws(()=>select(changed),/Invalid team task view controls/);
});
test("revoked or stale teammate filters revert to All, not a false empty board",()=>{
  assert.equal(resolveWorkspaceAssigneeFilter(editor,members),editor);
  assert.equal(resolveWorkspaceAssigneeFilter(editor,[owner]),"all");
  assert.equal(resolveWorkspaceAssigneeFilter("mine",[owner]),"mine");
  assert.equal(resolveWorkspaceAssigneeFilter("unassigned",[owner]),"unassigned");
  assert.equal(resolveWorkspaceAssigneeFilter("all",[]),"all");
  assert.equal(resolveWorkspaceAssigneeFilter("stranger",members),"all");
  assert.throws(()=>resolveWorkspaceAssigneeFilter("",[null]));
});
test("quick actions and view controls are shared by board and list, gated by editor role",()=>{
  const s=boardSource();
  for(const anchor of [
    "const quickUpdateTask=(task:Task,change:{priority:string}|{assignee_id:string|null})=>",
    "workspaceTeamTaskQuickPatch(task,change,selected.id,memberIds)",
    'supabase.rpc("workspace_team_save_task",params)',
    "if(!selected||!editor||disabled||busy||loading||!spaceListVerified||",
    "verifiedSpaceId!==selected.id",
    'aria-label={"Change priority for "+task.title}',
    'aria-label={(task.assignee_id===null?"Claim ":"Release ")+task.title}',
    "task.assignee_id===null||task.assignee_id===owner",
    'onClick={()=>quickUpdateTask(task,{',
    'aria-label="Filter team tasks by priority"',
    'aria-label="Filter team tasks by assignee"',
    'resolveWorkspaceAssigneeFilter(taskAssigneeFilter,memberIds)',
    'priority:taskPriorityFilter,assignee:effectiveAssigneeFilter,memberIds',
    'visibleTasks.map(task=>renderTeamTask(task))',
    'column.tasks.map(task=>renderTeamTask(task,true))',
  ])assert.ok(s.includes(anchor),"Missing Phase 35 wiring: "+anchor);
});
test("client never optimistically assigns a task and resets filters at account/team switches",()=>{
  const s=boardSource();
  const quick=s.slice(s.indexOf("const quickUpdateTask="),s.indexOf("const startBoardDrag="));
  assert.ok(!quick.includes("setTasks("));
  assert.ok(!quick.includes(".update("));
  assert.ok(quick.includes("void run(async()=>"));
  assert.ok(quick.includes("if(draft.id===task.id)setDraft(freshDraft());"));
  assert.equal(s.split('setTaskPriorityFilter("all");setTaskAssigneeFilter("all");').length-1,2);
});
