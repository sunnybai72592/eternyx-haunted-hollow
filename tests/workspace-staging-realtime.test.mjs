import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesWorkspaceTaskUpdate,checkWorkspaceRealtimeEvidence,
  REALTIME_DELIVERY_WINDOW_MS,REALTIME_SUBSCRIBE_WINDOW_MS,
  WORKSPACE_REALTIME_ROLES,
} from "../src/lib/workspaceRealtimeAcceptance.mjs";
import {validateWorkspaceRealtimeConfig}
  from "../scripts/workspace-team-staging-realtime.mjs";

const space="11111111-1111-4111-8111-111111111111";
const task="22222222-2222-4222-8222-222222222222";
const owner="33333333-3333-4333-8333-333333333333";
const event={id:11,space_id:space,entity_id:task,actor_id:owner,
  event_type:"task_updated",created_at:"2026-11-23T20:00:00Z"};
const proof=()=>({
  baseline:10,space,task,owner,serverRow:event,
  subscribed:[...WORKSPACE_REALTIME_ROLES],
  delivered:["owner","editor","viewer"].map(role=>({role,eventId:11})),
  outsiderCount:0,
});
test("only a genuinely newer, role-matched server task update can prove delivery",()=>{
  assert.equal(matchesWorkspaceTaskUpdate(event,{space,task,owner,baseline:10}),true);
  assert.equal(matchesWorkspaceTaskUpdate(event,{space,task,owner,baseline:11}),false);
  assert.equal(matchesWorkspaceTaskUpdate({...event,entity_id:"wrong"},
    {space,task,owner,baseline:10}),false);
  assert.equal(matchesWorkspaceTaskUpdate({...event,actor_id:"wrong"},
    {space,task,owner,baseline:10}),false);
  assert.equal(matchesWorkspaceTaskUpdate({...event,event_type:"task_created"},
    {space,task,owner,baseline:10}),false);
  assert.equal(matchesWorkspaceTaskUpdate({...event,id:"11"},
    {space,task,owner,baseline:10}),false);
});
test("subscribed alone never proves delivery, outsider packets always block",()=>{
  const p=proof();
  assert.equal(checkWorkspaceRealtimeEvidence(p).verified_realtime_delivery,true);
  assert.throws(()=>checkWorkspaceRealtimeEvidence({...p,delivered:[]}),/not every authorized/i);
  assert.throws(()=>checkWorkspaceRealtimeEvidence({...p,outsiderCount:1}),/outsider/);
  assert.throws(()=>checkWorkspaceRealtimeEvidence({...p,subscribed:["owner","editor","viewer"]}),/subscriber/);
  assert.throws(()=>checkWorkspaceRealtimeEvidence({...p,serverRow:{...event,space_id:"other"}}),/persisted/);
  assert.throws(()=>checkWorkspaceRealtimeEvidence({...p,
    delivered:[{role:"owner",eventId:11},{role:"editor",eventId:11},{role:"viewer",eventId:12}]}),/not every authorized/);
});
test("staging result is not a production, browser, revocation or migration certificate",()=>{
  const r=checkWorkspaceRealtimeEvidence(proof());
  assert.equal(r.production_certified,false);
  assert.equal(r.browser_ui_verified,false);
  assert.equal(r.realtime_revocation_verified,false);
  assert.equal(r.migration_history_verified,false);
  assert.equal(r.application_data_modified_by_runner,false);
  assert.equal(r.release_gate,"manual_review_required");
  assert.equal(REALTIME_DELIVERY_WINDOW_MS,120000);
  assert.equal(REALTIME_SUBSCRIBE_WINDOW_MS,16000);
});
test("operator approval must be distinct from Phase 21 read-only acknowledgment",()=>{
  const env={
    WORKSPACE_STAGING_URL:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/",
    WORKSPACE_STAGING_PROJECT_REF:"aaaaaaaaaaaaaaaaaaaa",
    WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_fixture",
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
    WORKSPACE_STAGING_SPACE_ID:space,
    WORKSPACE_STAGING_TEAM_TASK_ID:task,
    WORKSPACE_STAGING_PRIVATE_PROJECT_ID:owner,
    WORKSPACE_STAGING_PRIVATE_TASK_ID:"44444444-4444-4444-8444-444444444444",
    WORKSPACE_STAGING_PRIVATE_ITEM_ID:"55555555-5555-4555-8555-555555555555",
  };
  for(const role of WORKSPACE_REALTIME_ROLES){
    const key=role.toUpperCase();
    env["WORKSPACE_STAGING_"+key+"_EMAIL"]=role+"@example.invalid";
    env["WORKSPACE_STAGING_"+key+"_PASSWORD"]="staging_private_password";
  }
  assert.throws(()=>validateWorkspaceRealtimeConfig(env),/explicit-operator/);
  env.WORKSPACE_STAGING_REALTIME_CONFIRM="READ_ONLY_REALTIME_WINDOW";
  assert.equal(validateWorkspaceRealtimeConfig(env).ids.SPACE_ID,space);
  env.WORKSPACE_STAGING_PROJECT_REF="wcncuarekaofmfurbtbh";
  assert.throws(()=>validateWorkspaceRealtimeConfig(env),/nonproduction/);
});
