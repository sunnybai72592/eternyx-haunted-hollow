import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDockerControlRequest, effectiveDockerControlState, localDockerPreview }
  from "../supabase/functions/_shared/docker-control-contract.mjs";
const agentId="33333333-3333-4333-8333-333333333333";
const requestId="22222222-2222-4222-8222-222222222222";
const requestKey="44444444-4444-4444-8444-444444444444";
const containerId="a".repeat(64);
test("control operations are allowlisted, full IDs required and owner IDs cannot be spoofed",()=>{
  assert.deepEqual(parseDockerControlRequest({action:"list"}),{action:"list"});
  assert.equal(parseDockerControlRequest({action:"request",agentId,requestKey,operation:"start",containerId})?.operation,"start");
  for(const bad of [
    {action:"run",agentId,requestKey,operation:"run",containerId},
    {action:"request",agentId,requestKey,operation:"start",containerId:"abc"},
    {action:"request",agentId,requestKey,operation:"exec",containerId},
    {action:"request",agentId,requestKey,operation:"stop",containerId,ownerId:agentId},
    {action:"list",userId:agentId},
    {action:"policy",enabled:true,dailyLimit:0},
    {action:"policy",enabled:true,dailyLimit:11},
    {action:"policy",enabled:true,dailyLimit:5,token:"private"},
  ])assert.equal(parseDockerControlRequest(bad),null);
});
test("operation approvals require explicit per-request phrase and reject replay variants",()=>{
  const yes=parseDockerControlRequest({action:"decide",requestId,decision:"approve",confirmation:"APPROVE "+requestId.slice(0,8)});
  assert.equal(yes?.decision,"approve");
  assert.equal(parseDockerControlRequest({action:"decide",requestId,decision:"approve",confirmation:"approve "+requestId.slice(0,8)}),null);
  assert.equal(parseDockerControlRequest({action:"decide",requestId,decision:"approve",confirmation:"APPROVE abcdefgh"}),null);
  assert.equal(parseDockerControlRequest({action:"decide",requestId,decision:"reject"})?.decision,"reject");
  assert.equal(parseDockerControlRequest({action:"decide",requestId,decision:"cancel"})?.decision,"cancel");
  assert.equal(parseDockerControlRequest({action:"decide",requestId,decision:"reject",confirmation:"YES"}),null);
});
test("expiry is computed and a queued or approved request never becomes executed",()=>{
  const later=new Date(100000).toISOString(), earlier=new Date(1000).toISOString();
  assert.equal(effectiveDockerControlState({state:"pending",expires_at:later},50000),"pending");
  assert.equal(effectiveDockerControlState({state:"approved",expires_at:earlier},50000),"expired");
  assert.equal(effectiveDockerControlState({state:"rejected",expires_at:earlier},50000),"rejected");
  assert.equal(effectiveDockerControlState({state:"claimed",expires_at:later},50000),"unavailable");
});
test("CLI preview never inserts shell text or confirmation flags",()=>{
  assert.equal(localDockerPreview("stop",containerId),"node scripts/docker-operator.mjs stop "+containerId);
  assert.throws(()=>localDockerPreview("rm",containerId));
  assert.throws(()=>localDockerPreview("start","x; echo hacked"));
  assert.doesNotMatch(localDockerPreview("restart",containerId),/--confirm/);
});
test("migration enforces RLS, bounded quotas, fresh enrolled agents, idempotency and owner-only mutations",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261123050000_docker_operation_review.sql",import.meta.url),"utf8");
  for(const name of ["docker_control_policies","docker_control_requests","docker_control_events"]){
    assert.match(sql,new RegExp("ALTER TABLE public\\."+name+" ENABLE ROW LEVEL SECURITY"));
    assert.match(sql,new RegExp("REVOKE ALL ON public\\."+name+" FROM PUBLIC,\\s*anon,\\s*authenticated"));
  }
  assert.match(sql,/UNIQUE\(owner_id,request_key\)/);
  assert.match(sql,/REFERENCES public\.docker_agent_registrations\(id,owner_id\)/);
  assert.match(sql,/state IN \('pending','approved'\)/);
  assert.match(sql,/last_received_at>v_now-interval '3 minutes'/);
  assert.match(sql,/daily_limit/);
  assert.match(sql,/interval '10 minutes'/);
  assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/status='key_verified'/);
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.docker_control_requests TO authenticated/);
});
test("Edge Function requires signed-in owner and never invokes a Docker execution backend",()=>{
  const source=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
  assert.match(source,/authenticateUser\(req\)/);
  assert.match(source,/user\.is_anonymous/);
  assert.match(source,/remoteExecutionEnabled:false/);
  // Creating or approving a plan never claims local execution.
  assert.match(source,/executionStatus:"not_executed"/);
  // Read-only listings now distinguish undispatched plans from agent-reported
  // outcomes, rather than falsely presenting every plan as not executed.
  assert.match(source,/execution_status:claim\?claim\.state:"not_dispatched"/);
  assert.match(source,/dispatch_reported_at:claim\?\.reported_at\?\?null/);
  assert.doesNotMatch(source,/independentlyVerified:true|execution_verified:true/);
  assert.doesNotMatch(source,/docker\.sock|spawnSync|Deno\.Command|container\s+start|container\s+stop|ssh:\/\//);
});
