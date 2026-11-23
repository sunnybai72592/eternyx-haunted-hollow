import test from "node:test";
import assert from "node:assert/strict";
import {checkWorkspaceReadiness,workspaceReadinessSafeReport,WORKSPACE_READINESS_CHECKS}
  from "../src/lib/workspaceReadiness.mjs";

const owner="11111111-1111-4111-8111-111111111111";
function fakeClient(options={}) {
  const calls=[];
  return {
    calls,
    auth:{async getUser(){
      calls.push({type:"auth"});
      return {data:{user:{id:options.foreign?"foreign-account":owner}},error:null};
    }},
    from(table){
      const scoped={table};
      return {select(columns){scoped.columns=columns;return this;},
        eq(key,value){scoped.key=key;scoped.value=value;return this;},
        async limit(amount){
          calls.push({type:"read",...scoped,limit:amount});
          return {data:[],error:table===options.failedTable?{message:"forbidden"}:null};
        },
      };
    },
    storage:{from(bucket){
      return {async list(prefix,args){
        calls.push({type:"storage",bucket,prefix,args});
        return {data:[],error:options.noStorage?{message:"unavailable"}:null};
      }};
    }},
  };
}
test("read-only readiness validates every existing backend API without writes",async()=>{
  const client=fakeClient();
  const report=await checkWorkspaceReadiness(client,owner,()=>"2026-11-23T00:00:00Z");
  assert.equal(report.release_gate,"review_required");
  assert.equal(report.summary.fail,0);
  assert.equal(report.checks.length,WORKSPACE_READINESS_CHECKS.length+3);
  assert.equal(report.production_certified,false);
  assert.equal(report.cross_owner_rls_tested,false);
  assert.equal(report.actual_restore_drilled,false);
  assert.equal(client.calls.filter(c=>c.type==="read").length,WORKSPACE_READINESS_CHECKS.length);
  assert.ok(client.calls.filter(c=>c.type==="read")
    .every(c=>c.key==="owner_id"&&c.value===owner&&c.limit===1));
  assert.equal(client.calls.filter(c=>c.type==="storage")[0].prefix,owner);
  assert.ok(client.calls.every(c=>!["insert","update","delete","rpc"].includes(c.type)));
});
test("failure of any backend service blocks readiness without certifying",async()=>{
  const report=await checkWorkspaceReadiness(fakeClient({
    failedTable:"workspace_reconciliation_receipts",noStorage:true,
  }),owner);
  assert.equal(report.summary.fail,2);
  assert.equal(report.release_gate,"blocked");
  const output=workspaceReadinessSafeReport(report);
  assert.ok(!output.includes(owner));
  assert.match(output,/production_certified": false/);
  assert.match(output,/reviewed recovery receipts/i);
});
test("account mismatch stops before any table or storage reads",async()=>{
  const client=fakeClient({foreign:true});
  const report=await checkWorkspaceReadiness(client,owner);
  assert.equal(report.release_gate,"blocked");
  assert.equal(client.calls.filter(c=>c.type==="read").length,0);
  assert.equal(client.calls.filter(c=>c.type==="storage").length,0);
});
test("invalid client, owner or report is rejected",async()=>{
  await assert.rejects(checkWorkspaceReadiness({},""),/signed-in Workspace/);
  assert.throws(()=>workspaceReadinessSafeReport({}),/invalid/);
});
test("export metadata contains no secrets, raw errors or private records",async()=>{
  const result=await checkWorkspaceReadiness(fakeClient({failedTable:"workspace_tasks"}),owner);
  const json=JSON.parse(workspaceReadinessSafeReport(result));
  assert.equal(json.production_certified,false);
  assert.equal(json.release_gate,"blocked");
  assert.ok(!JSON.stringify(json).includes(owner));
  assert.ok(!JSON.stringify(json).includes("JWT"));
  assert.ok(!JSON.stringify(json).includes("forbidden"));
});
