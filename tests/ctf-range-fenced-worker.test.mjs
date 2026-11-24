import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acceptedWorkerOwner, acceptedFence, parseFencedWorkerRequest,
  trustedWorkerResult,
} from "../supabase/functions/_shared/ctf-range-fenced-contract.mjs";
import { runFencedProviderTick } from "../infrastructure/cyber-range/provider/fenced-worker.mjs";
import { acquireLocalOperatorLock } from "../infrastructure/cyber-range/provider/process-lock.mjs";

const read = path => readFile(new URL("../"+path, import.meta.url),"utf8");
const lease = "a23e4567-e89b-42d3-a456-426614174001";
const oldLease = "b23e4567-e89b-42d3-a456-426614174001";
const session = "123e4567-e89b-42d3-a456-426614174001";
const project = "cr-" + session.replace(/-/g,"");
const future = "2099-01-01T00:00:00Z";
const past = "2020-01-01T00:00:00Z";

function mock({inventory=[],claim={ok:false,reason:"empty"}, acquireFail=false, failAfter=Infinity, reportFail=false}={}) {
  const calls=[];let renews=0;
  return {calls,api:{
    async call(v) {
      calls.push(v);
      if(v.action==="acquire"){
        renews++;
        if(acquireFail||renews>failAfter)
          return {ok:false,reason:"lease_busy"};
        return {ok:true,leaseId:lease,expiresAt:future};
      }
      if(v.action==="reconcile") return {ok:true,sessions:inventory};
      if(v.action==="claim") return claim;
      if(v.action==="report") return {ok:!reportFail};
      if(v.action==="release") return {ok:true};
      throw new Error("Unexpected action");
    },
  }};
}
function runtime({up=true,stopError=false,startError=false,wrongRef=false}={}){
  const calls=[];
  return {calls,async start(id){calls.push("start:"+id);
    if(startError)throw Error("Docker build failed");
    return {instanceRef:wrongRef?"forged":project};
  },async exists(id){calls.push("exists:"+id);return up;},
  async stop(id){calls.push("stop:"+id);if(stopError)throw Error("Docker unavailable");return true;}};
}
const inventory = (status,expiresAt=future) => ({
  id:session,status,expiresAt,instanceRef:status==="running"||status==="stopping"?project:null,
});

test("worker contract accepts only fenced actions; no client owner/image/command/port",()=>{
  assert.equal(acceptedWorkerOwner("operator-01"),true);
  assert.equal(acceptedWorkerOwner("root;rm -rf"),false);
  assert.equal(acceptedFence(lease),true);
  assert.equal(acceptedFence("insecure"),false);
  assert.deepEqual(parseFencedWorkerRequest({action:"acquire"}),{action:"acquire"});
  assert.deepEqual(parseFencedWorkerRequest({action:"acquire",leaseId:lease}),
    {action:"acquire",leaseId:lease});
  assert.deepEqual(parseFencedWorkerRequest({action:"claim",leaseId:lease}),
    {action:"claim",leaseId:lease});
  assert.deepEqual(parseFencedWorkerRequest({action:"report",leaseId:lease,
    sessionId:session,state:"running",instanceRef:project}),
    {action:"report",leaseId:lease,sessionId:session,state:"running",instanceRef:project});
  assert.deepEqual(parseFencedWorkerRequest({action:"report",leaseId:lease,
    sessionId:session,state:"stopped"}),
    {action:"report",leaseId:lease,sessionId:session,state:"stopped"});
  for(const bad of [
    null,[],{action:"heartbeat"},{action:"claim"},
    {action:"claim",leaseId:lease,owner:"operator-evil"},
    {action:"acquire",leaseId:"wrong"},
    {action:"claim",leaseId:lease,image:"arbitrary"},
    {action:"report",leaseId:lease,sessionId:session,state:"running",instanceRef:"fake"},
    {action:"report",leaseId:lease,sessionId:session,state:"running"},
    {action:"report",leaseId:lease,sessionId:session,state:"failed",instanceRef:project},
    {action:"report",leaseId:lease,sessionId:session,state:"queued"},
    {action:"report",leaseId:lease,sessionId:session,state:"stopped",port:8080},
    {action:"release",leaseId:lease,force:true},
  ])assert.equal(parseFencedWorkerRequest(bad),null,JSON.stringify(bad));
});

test("fenced response verifier rejects malformed RPC output",()=>{
  assert.equal(trustedWorkerResult({ok:true,fence_id:lease,expires_at:future},"acquire"),true);
  assert.equal(trustedWorkerResult({ok:true,fence_id:"x",expires_at:future},"acquire"),false);
  assert.equal(trustedWorkerResult({ok:true,session_id:session,challenge_pack:"http-basics-v1",expires_at:future},"claim"),true);
  assert.equal(trustedWorkerResult({ok:true,session_id:session,challenge_pack:"evil",expires_at:future},"claim"),false);
  assert.equal(trustedWorkerResult({ok:true,sessions:[]},"reconcile"),true);
  assert.equal(trustedWorkerResult({ok:true,sessions:Array(13).fill({})},"reconcile"),false);
});

test("lost coordinator lease never touches Docker",async()=>{
  const m=mock({acquireFail:true}),r=runtime();
  await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}),/lease unavailable/);
  assert.deepEqual(r.calls,[]);
});

test("new owner lease cannot silently replace old in-process generation",async()=>{
  const m=mock(),r=runtime();
  await assert.rejects(runFencedProviderTick({api:m.api,runtime:r,leaseId:oldLease}),/generation changed/);
  assert.deepEqual(r.calls,[]);
});

test("worker cleanup of stopping and expired sessions is fenced before/after Docker",async()=>{
  for(const [status,date,expected] of [
    ["stopping",future,"stopped"],["provisioning",future,"failed"],["running",past,"expired"],
  ]) {
    const m=mock({inventory:[inventory(status,date)]}),r=runtime();
    const v=await runFencedProviderTick({api:m.api,runtime:r});
    assert.equal(v.leaseId,lease);
    assert.equal(v.stats.cleaned,1);
    assert.deepEqual(r.calls,["stop:"+session]);
    assert.equal(m.calls.find(x=>x.action==="report").state,expected);
    assert.ok(m.calls.every(x=>x.action!=="claim" || x.leaseId===lease));
    assert.ok(m.calls.filter(x=>x.action==="acquire").length>=3);
  }
});

test("missing running target is fenced and recorded failed",async()=>{
  const m=mock({inventory:[inventory("running")]}),r=runtime({up:false});
  const v=await runFencedProviderTick({api:m.api,runtime:r});
  assert.equal(v.stats.failed,1);
  assert.deepEqual(r.calls,["exists:"+session,"stop:"+session]);
  assert.equal(m.calls.find(x=>x.action==="report").state,"failed");
});

test("budget gate does not call runtime.start and never pretends to have launched",async()=>{
  for(const reason of ["budget_disabled","budget_exhausted"]) {
    const m=mock({claim:{ok:false,reason}}),r=runtime();
    const v=await runFencedProviderTick({api:m.api,runtime:r});
    assert.equal(v.stats.budgetBlocked,true);
    assert.equal(v.stats.claimed,0);
    assert.deepEqual(r.calls,[]);
  }
});

test("valid budgeted claim launches once and reports via same fence",async()=>{
  const m=mock({claim:{ok:true,sessionId:session,challengePack:"http-basics-v1",expiresAt:future}}),r=runtime();
  const v=await runFencedProviderTick({api:m.api,runtime:r});
  assert.equal(v.stats.claimed,1);
  assert.equal(v.stats.running,1);
  assert.deepEqual(r.calls,["start:"+session]);
  assert.deepEqual(m.calls.find(x=>x.action==="report"),{
    action:"report",leaseId:lease,sessionId:session,state:"running",instanceRef:project,
  });
});

test("Docker start failure triggers verified teardown before marking terminal",async()=>{
  const m=mock({claim:{ok:true,sessionId:session,challengePack:"http-basics-v1",expiresAt:future}}),r=runtime({startError:true});
  const v=await runFencedProviderTick({api:m.api,runtime:r});
  assert.equal(v.stats.failed,1);
  assert.deepEqual(r.calls,["start:"+session,"stop:"+session]);
  assert.equal(m.calls.at(-1).state,"failed");
});

test("Docker teardown failure preserves reservation by refusing final report",async()=>{
  const m=mock({inventory:[inventory("stopping")]}),r=runtime({stopError:true});
  await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}),/Docker unavailable/);
  assert.equal(m.calls.some(x=>x.action==="report"),false);
});

test("lease loss during cleanup prevents Docker mutation",async()=>{
  const m=mock({inventory:[inventory("stopping")],failAfter:1}),r=runtime();
  await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}),/lease was lost/);
  assert.deepEqual(r.calls,[]);
});

test("local operator process lock refuses concurrent workers and releases cleanly",async(t)=>{
  const folder=await mkdtemp(join(tmpdir(),"eternyx-test-provider-lock-"));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const lockPath=join(folder,"worker.lock");
  const first=await acquireLocalOperatorLock(lockPath);
  await assert.rejects(acquireLocalOperatorLock(lockPath),/Another operator/);
  await first.release();
  const next=await acquireLocalOperatorLock(lockPath);
  await next.release();
});

test("trusted Edge only calls fenced SQL and operator CLI uses the new worker",async()=>{
  const edge=await read("supabase/functions/ctf-range-worker/index.ts");
  const cli=await read("scripts/cyber-range-provider.mjs");
  const sql=await read("supabase/migrations/20261122200000_ctf_worker_fencing_budget.sql");
  assert.match(edge,/CTF_RANGE_PROVIDER_ID/);
  assert.match(edge,/verifyWorkerToken\(supplied, configured\)/);
  assert.match(edge,/ctf_range_worker_acquire/);
  assert.match(edge,/ctf_range_worker_claim/);
  assert.match(edge,/ctf_range_worker_inventory/);
  assert.match(edge,/ctf_range_worker_report/);
  assert.match(edge,/ctf_range_worker_release/);
  assert.doesNotMatch(edge,/db\.rpc\("ctf_range_claim_queued_session"\)/);
  assert.doesNotMatch(edge,/db\.rpc\("ctf_range_report_session"\)/);
  assert.match(cli,/runFencedProviderTick/);
  assert.match(cli,/acquireLocalOperatorLock/);
  assert.match(sql,/max_reserved_minutes_per_24h integer NOT NULL DEFAULT 0/);
  assert.match(sql,/max_starts_per_24h integer NOT NULL DEFAULT 0/);
  assert.match(sql,/\(v_count \+ 1\) \* 15 > v_limits\.max_reserved_minutes_per_24h/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.ctf_range_worker_lease/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ctf_range_claim_queued_session\(\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ctf_range_report_session\(uuid,text,text\)/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});

test("entire inventory must validate before any runtime mutation",async()=>{
 const m=mock({inventory:[inventory("stopping"),{...inventory("running"),id:"invalid"}]}),r=runtime();
 await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}));
 assert.deepEqual(r.calls,[]);
 const duplicate=mock({inventory:[inventory("stopping"),inventory("running")]});
 await assert.rejects(runFencedProviderTick({api:duplicate.api,runtime:r}),/Unsafe worker inventory/);
 assert.deepEqual(r.calls,[]);
});
test("unconfirmed teardown never releases a fenced reservation",async()=>{
 const m=mock({inventory:[inventory("stopping")]}),r=runtime();
 r.stop=async()=>false;
 await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}),/teardown not confirmed/);
 assert.equal(m.calls.some(x=>x.action==="report"),false);
});
test("worker fails closed on ambiguous startup cleanup",async()=>{
 const m=mock({claim:{ok:true,sessionId:session,challengePack:"http-basics-v1",expiresAt:future}}),r=runtime({startError:true});
 r.stop=async()=>false;
 await assert.rejects(runFencedProviderTick({api:m.api,runtime:r}),/teardown not confirmed/);
 assert.equal(m.calls.some(x=>x.action==="report"),false);
});
