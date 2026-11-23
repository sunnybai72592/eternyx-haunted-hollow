import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  parseRangeProviderStatus,parseRangeSessionsResponse,parseRangeReservationReply,
  parseRangeStopReply,canRequestRangeSession,createRangeOwnerFence,RANGE_SESSION_LIMIT,
} from "../src/lib/eternyxRangeSessionClient.mjs";
const owner="123e4567-e89b-42d3-a456-426614174001";
const other="223e4567-e89b-42d3-a456-426614174001";
const session="323e4567-e89b-42d3-a456-426614174001";
const time="2026-11-22T18:00:00.000Z";
const provider=()=>({
  providerOnline:true,hostedAccessAvailable:false,maxConcurrentSessions:2,
  sessionDurationMinutes:15,dailyLaunchBudgetConfigured:true,
  message:"Operator-controlled staging only.",
});
const row=()=>({
  id:session,challenge_pack:"http-basics-v1",status:"queued",
  requested_at:time,updated_at:time,expires_at:"2026-11-22T18:15:00Z",
  started_at:null,finished_at:null,
});
test("provider readiness refuses malformed, contradictory or inflated capability",()=>{
  assert.equal(parseRangeProviderStatus(provider()).providerOnline,true);
  for(const change of [
    x=>delete x.dailyLaunchBudgetConfigured,x=>x.hostedAccessAvailable="true",
    x=>x.maxConcurrentSessions=100,x=>x.sessionDurationMinutes=60,
    x=>x.providerOnline="yes",x=>x.message="x".repeat(241),
    x=>{x.providerOnline=false;x.hostedAccessAvailable=true;},
    x=>{x.dailyLaunchBudgetConfigured=false;x.providerOnline=true;},
  ]){const p=provider();change(p);assert.throws(()=>parseRangeProviderStatus(p));}
  assert.throws(()=>parseRangeProviderStatus([]));
});
test("owner sessions have bounded shape and private fields never reach renderer",()=>{
  const record={...row(),user_id:other,provider_instance_ref:"private",ingress_url:"private",token:"private"};
  const list=parseRangeSessionsResponse({source:"authenticated_server",hostedAccessAvailable:false,sessions:[record]});
  assert.deepEqual(Object.keys(list[0]),["id","challenge_pack","status","requested_at","updated_at","expires_at","started_at","finished_at"]);
  assert.equal(JSON.stringify(list).includes("private"),false);
  assert.ok(Object.isFrozen(list[0]));
});
test("PostgreSQL timestamptz UTC offsets and zoned timestamps survive valid parsing",()=>{
  const record={...row(),requested_at:"2026-11-22T18:00:00+00:00",
    updated_at:"2026-11-22T21:00:00+03:00",
    expires_at:"2026-11-22T18:15:00.123456+00:00"};
  const sessions=parseRangeSessionsResponse({
    source:"authenticated_server",hostedAccessAvailable:false,sessions:[record],
  });
  assert.equal(sessions.length,1);
  assert.equal(sessions[0].requested_at,record.requested_at);
});
test("sessions reject unknown owner sources, IDs, duplicates, statuses and timestamps",()=>{
  const base={source:"authenticated_server",hostedAccessAvailable:false,sessions:[row()]};
  const bad=[
    {...base,source:"browser"},{...base,hostedAccessAvailable:true},
    {...base,sessions:Array.from({length:RANGE_SESSION_LIMIT+1},(_,i)=>({...row(),id:i}))},
    {...base,sessions:[row(),row()]},
    {...base,sessions:[{...row(),id:"not-uuid"}]},
    {...base,sessions:[{...row(),status:"started"}]},
    {...base,sessions:[{...row(),requested_at:"garbage"}]},
    {...base,sessions:[{...row(),finished_at:undefined}]},
    {...base,sessions:[{...row(),challenge_pack:"arbitrary"}]},
  ];
  for(const candidate of bad)assert.throws(()=>parseRangeSessionsResponse(candidate));
  assert.throws(()=>parseRangeSessionsResponse(null));
});
test("reservations require verified session receipts and stops match the exact session ID",()=>{
  const receipt={accepted:true,sessionId:session,status:"queued",expiresAt:time,reused:false,hostedAccessAvailable:false};
  assert.equal(parseRangeReservationReply(receipt).sessionId,session);
  for(const changed of [{...receipt,accepted:false},{...receipt,expiresAt:"invalid"},
    {...receipt,sessionId:other,status:"fake"},{...receipt,hostedAccessAvailable:true}])
    assert.throws(()=>parseRangeReservationReply(changed));
  assert.equal(parseRangeStopReply({sessionId:session,status:"stopping",stopped:false},session).status,"stopping");
  assert.equal(parseRangeStopReply({sessionId:session,status:"stopped",stopped:true},session).status,"stopped");
  for(const changed of [{sessionId:other,status:"stopping",stopped:false},
    {sessionId:session,status:"stopped",stopped:false},{sessionId:session,status:"running",stopped:false}])
    assert.throws(()=>parseRangeStopReply(changed,session));
});
test("hosted request button fails closed without provider, hosted ingress or empty capacity",()=>{
  const p=parseRangeProviderStatus(provider());
  const sessionList=parseRangeSessionsResponse({source:"authenticated_server",hostedAccessAvailable:false,sessions:[row()]});
  assert.equal(canRequestRangeSession(p,[],true),false);
  assert.equal(canRequestRangeSession({...p,hostedAccessAvailable:true},[],true),true);
  assert.equal(canRequestRangeSession({...p,hostedAccessAvailable:true},sessionList,true),false);
  assert.equal(canRequestRangeSession({...p,hostedAccessAvailable:true},[],false),false);
  assert.equal(canRequestRangeSession({...p,hostedAccessAvailable:true,maxConcurrentSessions:0},[],true),false);
});
test("owner fence discards stale replies after newer refresh, signout and account switch",()=>{
  const fence=createRangeOwnerFence();
  const first=fence.start(owner),second=fence.start(owner);
  assert.equal(fence.accepts(first,owner),false);
  assert.equal(fence.accepts(second,owner),true);
  assert.equal(fence.accepts(second,other),false);
  fence.invalidate();
  assert.equal(fence.accepts(second,owner),false);
  const third=fence.start(other);
  assert.equal(fence.accepts(third,other),true);
  assert.equal(fence.accepts(second,other),false);
  assert.throws(()=>fence.start("not-uuid"));
});
test("React portal applies authentic owner gate on loads and actions, never stores results locally",async()=>{
  const ui=await readFile(new URL("../src/pages/EternyxRangeSessions.tsx",import.meta.url),"utf8");
  assert.match(ui,/createRangeOwnerFence/);
  assert.match(ui,/fence\.current\.accepts/);
  assert.match(ui,/useAuthStore\.getState/);
  assert.match(ui,/parseRangeSessionsResponse/);
  assert.match(ui,/parseRangeProviderStatus/);
  assert.match(ui,/parseRangeReservationReply/);
  assert.match(ui,/parseRangeStopReply/);
  assert.match(ui,/pendingAction\.current/);
  assert.doesNotMatch(ui,/localStorage\.setItem|sessionStorage\.setItem|Math\.random|fakeInstanceId|mockInstanceId/);
});
