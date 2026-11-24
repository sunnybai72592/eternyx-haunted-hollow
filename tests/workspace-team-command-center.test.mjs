import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {workspaceTeamCommandCenter,workspaceTeamCommandView,WORKSPACE_COMMAND_QUEUE_LIMIT} from "../src/lib/workspaceTeamCommandCenter.mjs";
import {selectWorkspaceTeamTasks} from "../src/lib/workspaceTeamTaskOperations.mjs";
const owner="self",space="team",today="2026-11-24";
const roster=[{space_id:space,user_id:owner,role:"owner"},{space_id:space,user_id:"other",role:"editor"}];
const task=(id,patch={})=>({id,space_id:space,title:id,details:"",priority:"normal",status:"todo",due_on:null,assignee_id:owner,updated_at:"2026-11-24T00:00:00Z",...patch});
const rows=[
  task("late",{due_on:"2026-11-23"}),
  task("today",{due_on:today,priority:"urgent",status:"in_progress"}),
  task("urgent",{priority:"urgent",assignee_id:null}),
  task("gap",{assignee_id:null}),
  task("foreign-assignee",{assignee_id:"private-id"}),
  task("done",{status:"done",priority:"urgent",due_on:"2026-11-22"}),
  task("future",{due_on:"2026-11-30",assignee_id:"other"}),
];
const center=(items=rows,scope="all")=>workspaceTeamCommandCenter(items,roster,owner,space,today,scope);
test("every command center metric exactly matches the existing task view",()=>{
 const result=center();
 assert.equal(result.total,7);assert.equal(result.done,1);
 assert.equal(result.metrics.length,11);
 for(const metric of result.metrics){
  if(!metric.count){assert.throws(()=>workspaceTeamCommandView(result,metric.key));continue;}
  const view=workspaceTeamCommandView(result,metric.key);
  assert.equal(selectWorkspaceTeamTasks(rows,{...view,owner,today,memberIds:["self","other"]}).length,metric.count);
 }
 assert.equal(result.metrics.find(m=>m.key==="mineOverdue").count,1);
 assert.equal(result.metrics.find(m=>m.key==="unassigned").count,2);
 assert.throws(()=>workspaceTeamCommandView(result,"fake"));
});
test("attention ordering is deterministic, excludes completed and ordinary future work",()=>{
 const original=structuredClone(rows);
 const result=center();
 assert.deepEqual(result.queue.map(r=>r.id),["late","today","urgent","foreign-assignee","gap"]);
 assert.equal(result.queueTotal,5);
 assert.deepEqual(result.queue.find(r=>r.id==="today").reasons,["Due today","Urgent"]);
 assert.equal(result.queue.find(r=>r.id==="foreign-assignee").assignment,"Outside current roster");
 assert.ok(!JSON.stringify(result).includes("private-id"));
 assert.deepEqual(rows,original);
});
test("personal and unassigned attention queues never broaden the task scope",()=>{
 assert.deepEqual(center(rows,"mine").queue.map(r=>r.id),["late","today"]);
 assert.deepEqual(center(rows,"unassigned").queue.map(r=>r.id),["urgent","gap"]);
 assert.equal(center(rows,"mine").total,7);
 assert.throws(()=>center(rows,"other"));
});
test("attention preview is bounded, but counts cover the full verified snapshot",()=>{
 const items=Array.from({length:50},(_,i)=>task(String(i),{assignee_id:null}));
 const result=center(items);
 assert.equal(result.queue.length,WORKSPACE_COMMAND_QUEUE_LIMIT);
 assert.equal(result.queueTotal,50);assert.equal(result.total,50);
 assert.equal(center([]).queueTotal,0);
 assert.equal(center([]).done,0);
});
test("command center rejects foreign rows, duplicate identities and missing member scope",()=>{
 for(const items of [[{...rows[0],space_id:"foreign"}],[rows[0],rows[0]],[{...rows[0],due_on:"2026-02-30"}]])
  assert.throws(()=>center(items));
 assert.throws(()=>workspaceTeamCommandCenter(rows,[],owner,space,today));
});
test("command center uses verified rows, existing filters and task discussion with no writes",()=>{
 const s=readFileSync(new URL("../src/components/workspace/WorkspaceTeamsPanel.tsx",import.meta.url),"utf8");
 for(const anchor of ["workspaceTeamCommandCenter(tasks,members,owner,selected.id,today,queueScope)",
  "aria-label=\"Team project command center\"","workspaceTeamCommandView(commandCenter,key)",
  "commandCenter.queue.some(row=>row.id===taskId)","setQueueScope(\"all\");pendingCommandTask.current=null;",
  "setDiscussionTaskId(taskId)","commandResultsRef.current?.focus({preventScroll:true})"])
  assert.ok(s.includes(anchor),anchor);
 const handlers=s.slice(s.indexOf("const openCommandMetric="),s.indexOf("const clearTaskFilters="));
 assert.ok(!handlers.includes("supabase.")&&!handlers.includes("setTasks("));
 assert.ok(handlers.includes("verifiedSpaceId!==selected.id"));
});
