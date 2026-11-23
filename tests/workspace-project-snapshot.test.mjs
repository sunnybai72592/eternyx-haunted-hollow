import test from "node:test";
import assert from "node:assert/strict";
import { fetchWorkspaceExportSnapshot } from "../src/lib/workspaceProjectSnapshot.mjs";

const owner="11111111-1111-4111-8111-111111111111", project="p";
const tasks=Array.from({length:5},(_,i)=>({
  id:"t"+i,owner_id:owner,project_id:project,title:"Real "+i,
}));
const notes=[{id:"n0",owner_id:owner,project_id:project,kind:"note",title:"Diary"}];

function fakeClient(options={}) {
  const calls=[];
  return {
    calls,
    from(table){
      const q={scope:{},select(columns,settings){q.countMode=settings?.count;return q;},
        eq(k,v){q.scope[k]=v;return q;},order(){return q;},
        async range(start,end){
          calls.push({table,start,end,count:q.countMode,scope:{...q.scope}});
          if(options.fail===table)return {data:null,error:{message:"DB failure"},count:null};
          const all=(table==="workspace_tasks"?tasks:notes).filter(r=>
            r.owner_id===q.scope.owner_id && r.project_id===q.scope.project_id);
          let data=all.slice(start,end+1);
          if(options.truncate===table)data=data.slice(0,1);
          if(options.duplicate===table && start>=2)data=[all[0]];
          const count=options.missingCount===table?null:
            options.drift===table && start>=2?all.length+1:all.length;
          return {data,count,error:null};
        },
      };
      return q;
    },
  };
}

test("complete snapshots keep every owner/project-scoped row with exact counts",async()=>{
  const client=fakeClient();
  const result=await fetchWorkspaceExportSnapshot(client,owner,project,2);
  assert.equal(result.tasks.length,5);
  assert.equal(result.items.length,1);
  assert.ok(client.calls.some(c=>c.table==="workspace_tasks"&&c.start===4));
  assert.ok(client.calls.every(c=>c.count==="exact" &&
    c.scope.owner_id===owner && c.scope.project_id===project));
});

test("truncated pages, changed totals and duplicate identities refuse backup",async()=>{
  await assert.rejects(fetchWorkspaceExportSnapshot(
    fakeClient({truncate:"workspace_tasks"}),owner,project,2),/truncated/);
  await assert.rejects(fetchWorkspaceExportSnapshot(
    fakeClient({drift:"workspace_tasks"}),owner,project,2),/changed during export/);
  await assert.rejects(fetchWorkspaceExportSnapshot(
    fakeClient({duplicate:"workspace_tasks"}),owner,project,2),/repeated or foreign/);
});
test("missing exact counts, backend errors, huge limits or wrong arguments fail closed",async()=>{
  await assert.rejects(fetchWorkspaceExportSnapshot(
    fakeClient({missingCount:"workspace_items"}),owner,project),/exact count/);
  await assert.rejects(fetchWorkspaceExportSnapshot(
    fakeClient({fail:"workspace_items"}),owner,project),/DB failure/);
  await assert.rejects(fetchWorkspaceExportSnapshot(fakeClient(),owner,project,600),/valid pagination/);
  await assert.rejects(fetchWorkspaceExportSnapshot(fakeClient(),"",project),/signed-in owner/);
});
