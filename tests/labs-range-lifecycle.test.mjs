import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {rangeLifecycle,mayRefreshRange,restartEligibility} from "../src/lib/eternyxRangeLifecycle.mjs";
const now=Date.parse("2026-11-25T12:00:00Z");
const session=(status="running",expires=now+125000)=>({id:"session-a",status,expires_at:new Date(expires).toISOString()});
const provider={providerOnline:true,hostedAccessAvailable:true,maxConcurrentSessions:1};
test("countdown does not alter authoritative server state",()=>{
  const s=session();
  assert.equal(rangeLifecycle(s,now).remainingSeconds,125);
  assert.match(rangeLifecycle(s,now).label,/2:05/);
  assert.equal(s.status,"running");
});
test("expired device clock cannot release running or queued capacity",()=>{
  for(const status of ["queued","provisioning","running","stopping"]){
    const s=session(status,now-1);
    const state=rangeLifecycle(s,now);
    assert.equal(state.awaitingCleanup,true);
    assert.equal(state.canOfferRestart,false);
    assert.equal(restartEligibility(s,provider,[s],true).allowed,false);
  }
});
test("stopping blocks restart even before deadline",()=>{
  const s=session("stopping");
  assert.equal(rangeLifecycle(s,now).awaitingCleanup,true);
  assert.match(rangeLifecycle(s,now).label,/reserved/);
});
test("terminal reservation permits only ordinary fresh authorized request",()=>{
  for(const status of ["stopped","expired","failed"]){
    const s=session(status);
    assert.equal(restartEligibility(s,provider,[s],true).allowed,true);
    assert.equal(restartEligibility(s,{...provider,hostedAccessAvailable:false},[s],true).allowed,false);
    assert.equal(restartEligibility(s,provider,[s,{...session("stopping"),id:"other"}],true).allowed,false);
    assert.equal(restartEligibility(s,provider,[],true).allowed,false);
    assert.equal(restartEligibility(s,provider,[s],false).allowed,false);
  }
});
test("refresh is restricted to visible live owner and idle mutation state",()=>{
  const args={visible:true,mounted:true,owner:"A",currentOwner:"A",busy:false};
  assert.equal(mayRefreshRange(args),true);
  for(const patch of [{visible:false},{mounted:false},{currentOwner:"B"},{busy:true},{owner:null},{currentOwner:null}]){
    assert.equal(mayRefreshRange({...args,...patch}),false);
  }
});
test("invalid time and status fail closed",()=>{
  assert.throws(()=>rangeLifecycle(session(),NaN));
  assert.throws(()=>rangeLifecycle({status:"fake",expires_at:"bad"},now));
});
test("dashboard keys private subtree, reuses authenticated controller, and never auto-resets",async()=>{
  const page=await readFile(new URL("../src/pages/EternyxRangeSessions.tsx",import.meta.url),"utf8");
  assert.match(page,/RangeSessionDashboard key=\{ownerId/);
  assert.match(page,/visibilitychange/);
  assert.match(page,/setInterval\(synchronize,10000\)/);
  assert.match(page,/restartEligibility/);
  assert.match(page,/mounted\.current && generation/);
  assert.doesNotMatch(page,/localStorage\.setItem|setInterval\([^)]*request/);
});
