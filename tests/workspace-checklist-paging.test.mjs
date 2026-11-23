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
          const scoped = rows.filter(r=>r.owner_id===query.owner && query.ids.includes(r.task_id));
          return { data: scoped.slice(start,end+1), count: scoped.length, error:null };
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
      range:async()=>({data:[{id:"bad",owner_id:"other",task_id:ownedTasks[0].id}],count:1,error:null})};
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


test("exact count catches truncated pages that formerly looked complete",async()=>{
  const rows=Array.from({length:5},(_,i)=>({
    id:"s"+i,task_id:ownedTasks[0].id,owner_id:owner,
    title:"Step "+i,done:false,created_at:"2026-11-20",
  }));
  const client=fakeClient(rows);
  const original=client.from.bind(client);
  client.from=(table)=>{
    const q=original(table),range=q.range.bind(q);
    q.range=async(start,end)=>{
      const result=await range(start,end);
      return {...result,data:result.data.slice(0,1)};
    };
    return q;
  };
  await assert.rejects(fetchWorkspaceChecklistSnapshot(client,owner,[ownedTasks[0]],{pageSize:2}),
    /truncated/);
});

test("count drift between pages and duplicate step IDs fail closed",async()=>{
  const rows=Array.from({length:5},(_,i)=>({
    id:"s"+i,task_id:ownedTasks[0].id,owner_id:owner,
    title:"Step "+i,done:true,created_at:"2026-11-20",
  }));
  const drift=fakeClient(rows);
  const original=drift.from.bind(drift);
  drift.from=(table)=>{
    const q=original(table),range=q.range.bind(q);
    q.range=async(start,end)=>{
      const data=await range(start,end);
      return start>=2?{...data,count:data.count+1}:data;
    };
    return q;
  };
  await assert.rejects(fetchWorkspaceChecklistSnapshot(drift,owner,[ownedTasks[0]],{pageSize:2}),
    /changed during backup/);
  const duplicates=fakeClient([rows[0],{...rows[0]}]);
  await assert.rejects(fetchWorkspaceChecklistSnapshot(duplicates,owner,[ownedTasks[0]],{pageSize:1}),
    /duplicate step identity/);
});

test("inaccessible count and excess server steps never yield partial snapshots",async()=>{
  const rows=[{id:"one",task_id:ownedTasks[0].id,owner_id:owner,
    title:"Step",done:true,created_at:"2026-11-20"}];
  const bad=fakeClient(rows);
  const original=bad.from.bind(bad);
  bad.from=(table)=>{
    const q=original(table),range=q.range.bind(q);
    q.range=async(start,end)=>({...await range(start,end),count:null});
    return q;
  };
  await assert.rejects(fetchWorkspaceChecklistSnapshot(bad,owner,[ownedTasks[0]]),
    /trustworthy exact count/);
  const tooMany=Array.from({length:31},(_,i)=>({...rows[0],id:"step-"+i}));
  await assert.rejects(fetchWorkspaceChecklistSnapshot(fakeClient(tooMany),owner,[ownedTasks[0]]),
    /exceeds its step cap/);
});
