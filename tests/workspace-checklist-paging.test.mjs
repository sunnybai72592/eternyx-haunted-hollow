import test from "node:test";
import assert from "node:assert/strict";
import { fetchWorkspaceChecklistSnapshot } from "../src/lib/workspaceChecklistPaging.mjs";
const owner="11111111-1111-4111-8111-111111111111";

function fakeClient(rows, options = {}) {
  const calls=[];
  return {
    calls,
    from(table) {
      assert.equal(table, "workspace_task_steps");
      const query = { limit: null, ids: null, owner: null };
      const q = {
        select() { return q; },
        eq(column, value) { if(column==="owner_id")query.owner=value; return q; },
        in(column, value) { assert.equal(column, "task_id"); query.ids=value; return q; },
        order() { return q; },
        async range(start,end) {
          calls.push({start,end,ids:query.ids,owner:query.owner});
          if(options.error) return { data:null,error:{message:"Service interrupted"} };
          return { data: rows.filter(r=>r.owner_id===query.owner && query.ids.includes(r.task_id))
            .slice(start,end+1), error:null };
        },
      };
      return q;
    },
  };
}

const ownedTasks = Array.from({length:21}, (_,i)=>({id:"task-"+i,owner_id:owner}));

test("snapshot pages by bounded groups and returns every owned step",async()=>{
  const rows=ownedTasks.flatMap((task,i)=>Array.from({length:i===0?30:2},(_,j)=>({
    id:task.id+"-s"+j, task_id:task.id, owner_id:owner,
    title:"Step "+j,done:j%2===0,created_at:"2026-11-20",
  })));
  const client=fakeClient(rows);
  const actual=await fetchWorkspaceChecklistSnapshot(client,owner,ownedTasks,{pageSize:10});
  assert.equal(actual.length,70);
  assert.ok(client.calls.some(c=>c.start>=10));
  assert.ok(client.calls.some(c=>c.ids.length===1));
  assert.ok(client.calls.every(c=>c.owner===owner && c.ids.length<=20));
});

test("snapshot fails hard on missing pages or foreign rows", async()=>{
  await assert.rejects(fetchWorkspaceChecklistSnapshot(fakeClient([], {error:true}),owner,ownedTasks),
    /could not load every step/);
  const client=fakeClient([]);
  client.from=()=> {
    const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,
      range:async()=>({data:[{id:"bad",owner_id:"other",task_id:ownedTasks[0].id}],error:null})};
    return q;
  };
  await assert.rejects(fetchWorkspaceChecklistSnapshot(client,owner,ownedTasks), /foreign/);
});

test("rejects duplicated task IDs, cross-account scope and invalid page settings", async()=>{
  await assert.rejects(fetchWorkspaceChecklistSnapshot(fakeClient([]),owner,
    [ownedTasks[0],ownedTasks[0]]), /unique/);
  await assert.rejects(fetchWorkspaceChecklistSnapshot(fakeClient([]),owner,
    [{...ownedTasks[0],owner_id:"other"}]), /owned/);
  await assert.rejects(fetchWorkspaceChecklistSnapshot(fakeClient([]),owner,
    ownedTasks,{pageSize:501}), /pagination/);
});
