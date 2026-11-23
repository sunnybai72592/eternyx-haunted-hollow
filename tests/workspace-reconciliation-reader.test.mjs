import test from "node:test";
import assert from "node:assert/strict";
import { fetchWorkspaceReviewSnapshot } from "../src/lib/workspaceReconciliationReader.mjs";
import { fingerprintWorkspaceReviewSnapshot } from "../src/lib/workspaceReconciliation.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const project="22222222-2222-4222-8222-222222222222";
const now="2026-11-23T11:00:00.000Z";
const tasks=Array.from({length:5},(_,i)=>({
  id:"task-"+i,owner_id:owner,project_id:project,title:"Task "+i,
  details:"Current work",priority:"normal",status:"todo",due_on:null,
  updated_at:now,completed_at:null,
}));
const items=[{id:"item-1",owner_id:owner,project_id:project,kind:"note",
  title:"Current note",note_text:"Detailed note",target_url:null,updated_at:now,
  file_size:null,mime_type:null,storage_path:null}];
const steps=[{id:"step-1",task_id:"task-0",owner_id:owner,
  title:"Check anode",done:true,created_at:now}];

function fakeClient(options={}) {
  const calls=[];
  function from(table) {
    const q={scope:{},ids:[],
      select(columns,opts){q.columns=columns;q.count=opts?.count;return q;},
      eq(column,value){q.scope[column]=value;return q;},
      in(column,values){q.ids=values;return q;},
      order(){return q;},
      async single(){
        return options.noProject?{data:null,error:{message:"Forbidden"}}:
          {data:{id:project,owner_id:owner,status:"active"},error:null};
      },
      async range(start,end) {
        calls.push({table,start,end,scope:{...q.scope},fields:q.columns,count:q.count});
        if(options.error && table===options.error)
          return {error:{message:"Backend unavailable"},data:null,count:null};
        let all=table==="workspace_tasks"?tasks:table==="workspace_items"?items:steps;
        all=all.filter(row=>row.owner_id===q.scope.owner_id &&
          (table==="workspace_task_steps"?q.ids.includes(row.task_id):
            row.project_id===q.scope.project_id));
        if(table==="workspace_task_steps")all=[...all].sort((a,b)=>a.id.localeCompare(b.id));
        const take=all.slice(start,end+1);
        return {data:options.short && table==="workspace_tasks"?take.slice(0,1):take,
          count:options.changedCount && table==="workspace_tasks" && start>=2 ? all.length+1:all.length,
          error:null};
      },
    };
    return q;
  }
  return {from,calls};
}

test("read-only owner-scoped review loads exactly all pages and current steps",async()=>{
  const client=fakeClient();
  const result=await fetchWorkspaceReviewSnapshot(client,owner,project,2);
  assert.equal(result.snapshot.tasks.length,5);
  assert.equal(result.snapshot.items.length,1);
  assert.equal(result.snapshot.steps.length,1);
  assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(result.fingerprint,await fingerprintWorkspaceReviewSnapshot(
    result.snapshot,owner,project));
  assert.ok(client.calls.some(x=>x.table==="workspace_tasks"&&x.start===2));
  assert.ok(client.calls.every(x=>x.scope.owner_id===owner));
  assert.ok(client.calls.filter(x=>x.table!=="workspace_task_steps")
    .every(x=>x.scope.project_id===project && x.count==="exact"));
});

test("missing, truncated or changed pages reject review instead of silently omitting data",async()=>{
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient({error:"workspace_tasks"}),
    owner,project,2),/Could not review/);
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient({short:true}),
    owner,project,2),/truncated page/);
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient({changedCount:true}),
    owner,project,2),/changed while reading/);
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient({noProject:true}),
    owner,project,2),/outside the signed-in account/);
});

test("missing account, huge page size or project are rejected",async()=>{
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient(),"",project),/valid private/);
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient(),owner,project,600),/valid private/);
  await assert.rejects(fetchWorkspaceReviewSnapshot(fakeClient(),owner,""),/valid private/);
});
