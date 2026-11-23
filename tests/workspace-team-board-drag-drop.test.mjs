import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  WORKSPACE_TEAM_BOARD_DRAG_MIME,workspaceTeamTaskMovePayload,
  workspaceTeamBoardDragReceipt,workspaceTeamBoardResolveDrag,
} from "../src/lib/workspaceTeamTaskBoard.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const teammate="22222222-2222-4222-8222-222222222222";
const space="33333333-3333-4333-8333-333333333333";
const updated="2026-11-23T13:00:00.000Z";
function task(status="todo",changes={}){
  return {id:"44444444-4444-4444-8444-444444444444",
    space_id:space,title:"Inspect test station",
    details:"Record instant-off potential",status,priority:"urgent",
    due_on:"2026-11-25",assignee_id:teammate,updated_at:updated,...changes};
}
const ui=()=>readFileSync(new URL(
  "../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");

test("direct stage menu allows any different valid column, preserving backend fields",()=>{
  const old=task(),clone=structuredClone(old);
  for(const status of ["in_progress","done"]){
    assert.deepEqual(workspaceTeamTaskMovePayload(old,status,space,[owner,teammate]),{
      p_space_id:space,p_task_id:old.id,
      p_title:"Inspect test station",p_details:"Record instant-off potential",
      p_status:status,p_priority:"urgent",p_due_on:"2026-11-25",
      p_assignee_id:teammate,p_expected_updated_at:updated,
    });
  }
  assert.equal(workspaceTeamTaskMovePayload(task("done"),"todo",space,[owner,teammate]).p_status,"todo");
  assert.deepEqual(old,clone,"Direct moves must not optimistically change server rows");
});
test("move helper rejects the same status, unsupported columns and cross-team rows",()=>{
  for(const [row,status,toSpace,ids] of [
    [task(),"todo",space,[owner,teammate]],
    [task(),"blocked",space,[owner,teammate]],
    [task(),"done","other",[owner,teammate]],
    [task("broken"),"done",space,[owner,teammate]],
    [task("todo",{space_id:"foreign"}),"done",space,[owner,teammate]],
    [task("todo",{id:""}),"done",space,[owner,teammate]],
    [task("todo",{updated_at:"not-a-date"}),"done",space,[owner,teammate]],
    [task(),"done",space,[owner]],
    [task("todo",{due_on:"tomorrow"}),"done",space,[owner,teammate]],
    [task("todo",{title:""}),"done",space,[owner,teammate]],
  ])assert.throws(()=>workspaceTeamTaskMovePayload(row,status,toSpace,ids));
  assert.throws(()=>workspaceTeamTaskMovePayload(null,"done",space,[owner,teammate]));
});
test("drag receipt includes only a bounded team identity and task revision",()=>{
  const row=task(),encoded=workspaceTeamBoardDragReceipt(row,space);
  assert.equal(WORKSPACE_TEAM_BOARD_DRAG_MIME,"application/x-eternyx-team-task+json");
  assert.deepEqual(JSON.parse(encoded),{
    v:1,space_id:space,task_id:row.id,from_status:"todo",updated_at:updated,
  });
  assert.ok(!encoded.includes(row.title));
  assert.ok(!encoded.includes(row.details));
  assert.ok(!encoded.includes(row.assignee_id));
  assert.equal(workspaceTeamBoardResolveDrag(encoded,space,[row]),row);
});
test("missing drag payload, unexpected JSON and oversized data fail closed",()=>{
  const row=task();
  for(const input of ["",null,undefined,"bad json", "x".repeat(651),
    "[]","{}",
    JSON.stringify({v:2,space_id:space,task_id:row.id,from_status:"todo",updated_at:updated}),
  ])assert.throws(()=>workspaceTeamBoardResolveDrag(input,space,[row]));
  assert.throws(()=>workspaceTeamBoardDragReceipt(null,space));
  assert.throws(()=>workspaceTeamBoardDragReceipt(task("invalid"),space));
  assert.throws(()=>workspaceTeamBoardDragReceipt(task(), "another-team"));
});
test("forged or cross-team drops cannot target current authorized tasks",()=>{
  const row=task();
  const base=JSON.parse(workspaceTeamBoardDragReceipt(row,space));
  for(const change of [
    {space_id:"other"}, {task_id:"other"},
    {from_status:"done"}, {updated_at:"2026-11-21T00:00:00Z"},
    {updated_at:"garbage"}, {v:99}, {extra:"unexpected"},
  ])assert.throws(()=>workspaceTeamBoardResolveDrag(
    JSON.stringify({...base,...change}),space,[row]));
  assert.throws(()=>workspaceTeamBoardResolveDrag(JSON.stringify(base),"other",[row]));
  assert.throws(()=>workspaceTeamBoardResolveDrag(JSON.stringify(base),space,[]));
});
test("drag start must still match the currently visible task and server revision",()=>{
  const row=task(),receipt=workspaceTeamBoardDragReceipt(row,space);
  assert.equal(workspaceTeamBoardResolveDrag(receipt,space,[row]),row);
  assert.throws(()=>workspaceTeamBoardResolveDrag(receipt,space,
    [task("done")]),/Task changed/);
  assert.throws(()=>workspaceTeamBoardResolveDrag(receipt,space,
    [task("todo",{updated_at:"2026-11-23T13:00:01Z"})]),/Task changed/);
  assert.throws(()=>workspaceTeamBoardResolveDrag(receipt,space,[row,row]),/Task changed/);
  assert.throws(()=>workspaceTeamBoardResolveDrag(receipt,space,
    Array.from({length:501},(_,i)=>task("todo",{id:String(i)}))),/Untrusted/);
});
test("drag/keyboard UI cannot bypass editor role, verified space, or busy guards",()=>{
  const s=ui();
  for(const anchor of [
    'const moveTaskToStatus=(task:Task,toStatus:string)=>',
    'const startBoardDrag=(event:DragEvent<HTMLElement>,task:Task)=>',
    'const dropBoardTask=(event:DragEvent<HTMLElement>,toStatus:string)=>',
    'if(!selected||!editor||disabled||busy||loading||!spaceListVerified||',
    'verifiedSpaceId!==selected.id',
    'workspaceTeamBoardDragReceipt(task,selected.id)',
    'workspaceTeamBoardResolveDrag(receipt,selected.id,visibleTasks)',
    'workspaceTeamTaskMovePayload(task,toStatus,selected.id,memberIds)',
    'supabase.rpc("workspace_team_save_task",params)',
    'aria-label={"Move "+task.title+" to status"}',
    'disabled={busy||disabled||loading}',
    'onDrop={event=>dropBoardTask(event,column.status)}',
    'onDragOver={event=>{',
    'onDragLeave={event=>{',
    'onDragStart={event=>startBoardDrag(event,task)}',
    'event.dataTransfer.setData(WORKSPACE_TEAM_BOARD_DRAG_MIME,receipt)',
    'event.dataTransfer.getData(WORKSPACE_TEAM_BOARD_DRAG_MIME)',
  ])assert.ok(s.includes(anchor),"Missing move safety: "+anchor);
});
test("both board and list use keyboard/touch select; no client-only optimistic move",()=>{
  const s=ui();
  assert.ok(s.includes("visibleTasks.map(task=>renderTeamTask(task))"));
  assert.ok(s.includes("column.tasks.map(task=>renderTeamTask(task,true))"));
  assert.ok(s.includes('onChange={event=>moveTaskToStatus(task,event.target.value)}'));
  assert.ok(s.includes('<option value="todo">To do</option>'));
  assert.ok(s.includes('<option value="in_progress">In progress</option>'));
  assert.ok(s.includes('<option value="done">Done</option>'));
  const body=s.slice(s.indexOf("const moveTaskToStatus="),s.indexOf("const renderTeamTask="));
  assert.ok(!body.includes("setTasks("),"Moves must be confirmed via server refresh");
  assert.ok(!body.includes(".update("),"Moves must use the scoped team RPC");
  assert.ok(body.includes("void run(async()=>"));
  assert.ok(body.includes("if(draft.id===task.id)setDraft(freshDraft());"));
});
test("drag highlight, board view, and pending drag state reset on team/account changes",()=>{
  const s=ui();
  for(const label of [
    'const [dragOverColumn,setDragOverColumn]=useState<string|null>(null);',
    'setDragOverColumn(null);',
    'setTaskLayout("list");setDiscussionTaskId(null);',
    'event.currentTarget.contains(event.relatedTarget as Node)',
    'if(task.status!==toStatus)moveTaskToStatus(task,toStatus);',
    'title="Drag to another column. On touch or keyboard, use the Move to status menu."',
    'Changes are saved by the team backend before the board updates.',
    'setDragOverColumn(previous=>previous===column.status?previous:column.status)',
  ])assert.ok(s.includes(label),label);
  assert.equal(s.split('setTaskLayout("list");setDiscussionTaskId(null);').length-1,2);
  assert.equal(s.split('setDragOverColumn(null);').length>=3,true);
});
