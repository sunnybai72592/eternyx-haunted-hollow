import test from "node:test";
import assert from "node:assert/strict";
import {
  compareWorkspaceRecoveryRecords, fetchWorkspaceRecoveryComparison,
} from "../src/lib/workspaceRecoveryCompare.mjs";
const owner="11111111-1111-4111-8111-111111111111";
const project="project-x";
const baseTask={title:"Same name",details:"Original",
  status:"todo",priority:"high",due_on:null};
const changedTask={...baseTask,details:"Manual edit"};
const note={kind:"note",title:"Notes",note_text:"Readings",target_url:null};

test("duplicate titles use full record multisets, not naive name joins",()=>{
  const archive={ tasks:[baseTask,baseTask,changedTask],items:[note,note] };
  const summary=compareWorkspaceRecoveryRecords(archive,
    [baseTask,changedTask,{...baseTask,status:"done"}],
    [note,{...note,note_text:"Updated"}]);
  assert.deepEqual(summary.tasks,{
    archiveTotal:3,currentTotal:3,exact:2,archiveOnly:1,currentOnly:1,
  });
  assert.deepEqual(summary.items,{
    archiveTotal:2,currentTotal:2,exact:1,archiveOnly:1,currentOnly:1,
  });
  assert.match(summary.limitations,/not an automatic merge/);
  assert.match(summary.limitations,/checklist/i);
});

test("matching fields with one current missing task are not reported as complete",()=>{
  const summary=compareWorkspaceRecoveryRecords({tasks:[baseTask,changedTask],items:[]},
    [baseTask],[]);
  assert.equal(summary.tasks.exact,1);
  assert.equal(summary.tasks.archiveOnly,1);
  assert.equal(summary.tasks.currentOnly,0);
  assert.throws(()=>compareWorkspaceRecoveryRecords({tasks:[],items:[]},
    Array(5001).fill(baseTask),[]),/safe comparison/);
});

function fakeClient(rows, fail=false) {
  const calls=[];
  return {
    calls,
    from(table){
      let selected=null,scope={};
      const q={
        select(fields){selected=fields;return q;},
        eq(k,v){scope[k]=v;return q;},
        order(){return q;},
        async range(start,end) {
          calls.push({table,scope:{...scope},selected,start,end});
          if(fail) return {data:null,error:{message:"Connection error"}};
          return {data:rows[table].filter(row =>
            row.owner_id===scope.owner_id && row.project_id===scope.project_id
          ).slice(start,end+1),error:null};
        },
      };
      return q;
    },
  };
}

test("read-only comparison pages all owner/project rows, never foreign data",async()=>{
  const tasks=Array.from({length:5},(_,i)=>({
    owner_id:owner,project_id:project,...baseTask,id:"task-"+i,
  }));
  const foreign={...tasks[0],id:"foreign",owner_id:"another"};
  const notes=[{owner_id:owner,project_id:project,...note,id:"note-a"}];
  const client=fakeClient({workspace_tasks:[...tasks,foreign],workspace_items:notes});
  const result=await fetchWorkspaceRecoveryComparison(client,owner,project,2);
  assert.equal(result.tasks.length,5);
  assert.equal(result.items.length,1);
  assert.ok(client.calls.some(c=>c.start===2));
  assert.ok(client.calls.every(c=>c.scope.owner_id===owner &&
    c.scope.project_id===project));
  assert.ok(client.calls.every(c=>!c.selected.includes("owner_id")));
});

test("failed page does not generate a false success comparison",async()=>{
  await assert.rejects(fetchWorkspaceRecoveryComparison(
    fakeClient({workspace_tasks:[],workspace_items:[]},true),owner,project),/failed to read/);
  await assert.rejects(fetchWorkspaceRecoveryComparison(
    fakeClient({workspace_tasks:[],workspace_items:[]}),owner,project,501),/authenticated/);
});
