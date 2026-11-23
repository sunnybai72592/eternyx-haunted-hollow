import test from "node:test";
import assert from "node:assert/strict";
import {
  REVOCATION_TEAM_NAME,REVOCATION_CONFIRM,REVOCATION_HISTORY_CONFIRM,
  validateRevocationConfig,validateRevocationFixture,isRoleDenied,
  matchesRevocationEvent,verifyRevocationDelivery,safeRevocationReport,
} from "../src/lib/workspaceRevocationAcceptance.mjs";
import {validateStagingRevocationConfig}
  from "../scripts/workspace-team-staging-revocation.mjs";
const uuid=n=>String(n).repeat(8)+"-1111-4111-8111-"+String(n).repeat(12);
const identities=[uuid(1),uuid(2),uuid(3),uuid(4)];
const space=uuid(5),task=uuid(6);
const event={id:22,space_id:space,actor_id:identities[0],
  entity_id:task,event_type:"task_updated"};
function env(){
  const e={
    WORKSPACE_STAGING_URL:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/",
    WORKSPACE_STAGING_PROJECT_REF:"aaaaaaaaaaaaaaaaaaaa",
    WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_fixture",
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
    WORKSPACE_STAGING_SPACE_ID:uuid(7),
    WORKSPACE_STAGING_TEAM_TASK_ID:uuid(8),
    WORKSPACE_STAGING_PRIVATE_PROJECT_ID:uuid(9),
    WORKSPACE_STAGING_PRIVATE_TASK_ID:uuid(1),
    WORKSPACE_STAGING_PRIVATE_ITEM_ID:uuid(2),
    WORKSPACE_STAGING_REVOKE_SPACE_ID:space,
    WORKSPACE_STAGING_REVOKE_CONFIRM:REVOCATION_CONFIRM,
    WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM:REVOCATION_HISTORY_CONFIRM,
  };
  for(const role of ["OWNER","EDITOR","VIEWER","OUTSIDER"]){
    e["WORKSPACE_STAGING_"+role+"_EMAIL"]=role+"@example.invalid";
    e["WORKSPACE_STAGING_"+role+"_PASSWORD"]="staging-account-passphrase";
  }
  return e;
}
test("disposable revocation requires exact independent approvals and nonproduction team",()=>{
  assert.equal(validateStagingRevocationConfig(env()).revocationSpace,space);
  let e=env();e.WORKSPACE_STAGING_REVOKE_SPACE_ID=e.WORKSPACE_STAGING_SPACE_ID;
  assert.throws(()=>validateStagingRevocationConfig(e),/separate-disposable/);
  e=env();e.WORKSPACE_STAGING_REVOKE_CONFIRM="yes";
  assert.throws(()=>validateStagingRevocationConfig(e),/explicit-member-removal/);
  e=env();e.WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM="no";
  assert.throws(()=>validateStagingRevocationConfig(e),/persistent-audit/);
  e=env();e.WORKSPACE_STAGING_PROJECT_REF="wcncuarekaofmfurbtbh";
  e.WORKSPACE_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co/";
  assert.throws(()=>validateStagingRevocationConfig(e),/nonproduction/);
});
test("preflight refuses extra members, nonempty team, wrong owner and active invites",()=>{
  const team={name:REVOCATION_TEAM_NAME,status:"active",owner_id:identities[0]};
  const people=["owner","editor","viewer"].map((role,i)=>({
    role,user_id:identities[i]}));
  assert.equal(validateRevocationFixture(team,people,identities,0,0),true);
  assert.throws(()=>validateRevocationFixture({...team,name:"actual users"},people,identities,0,0),/dedicated-empty/);
  assert.throws(()=>validateRevocationFixture(team,people,identities,1,0),/dedicated-empty/);
  assert.throws(()=>validateRevocationFixture(team,people,identities,0,1),/dedicated-empty/);
  assert.throws(()=>validateRevocationFixture(team,[...people,people[2]],identities,0,0),/dedicated-empty/);
  assert.throws(()=>validateRevocationFixture(team,people.map(x=>({...x,user_id:identities[3]})),identities,0,0),/membership-role/);
});
test("delivery requires a newer server row, complete controls and no leaked packets",()=>{
  const base={space,owner:identities[0],entity:task,
    type:"task_updated",after:20,denyAfter:21};
  const packets={owner:[event],viewer:[event],editor:[],editor_fresh:[],outsider:[]};
  assert.equal(matchesRevocationEvent(event,base),true);
  assert.equal(verifyRevocationDelivery({packets,event,
    permitted:["owner","viewer"],
    forbidden:["editor","editor_fresh","outsider"],...base}),true);
  assert.throws(()=>verifyRevocationDelivery({packets,event:{...event,id:20},
    permitted:["owner","viewer"],forbidden:["editor"],...base}),/unverified-server/);
  assert.throws(()=>verifyRevocationDelivery({packets:{...packets,viewer:[]},event,
    permitted:["owner","viewer"],forbidden:["editor"],...base}),/authorized-delivery/);
  assert.throws(()=>verifyRevocationDelivery({packets:{...packets,editor:[event]},event,
    permitted:["owner","viewer"],forbidden:["editor"],...base}),/revoked-or-outsider/);
  assert.throws(()=>verifyRevocationDelivery({packets:{...packets,editor_fresh:[event]},event,
    permitted:["owner","viewer"],forbidden:["editor_fresh"],...base}),/revoked-or-outsider/);
  assert.equal(isRoleDenied({error:{code:"42501"}}),true);
  assert.equal(isRoleDenied({error:{status:500}}),false);
});
test("sanitized report cannot claim production or successful migration checks",()=>{
  const r=safeRevocationReport([
    "isolated_active_empty_staging_team",
    "four_authenticated_realtime_connections",
    "pre_revocation_editor_received_real_event",
    "persisted_editor_removal_event_and_exact_membership",
    "existing_revoked_session_cannot_read_team_or_snapshot",
    "new_auth_session_cannot_restore_removed_membership",
    "fresh_removed_editor_socket_observation_armed",
    "old_and_new_removed_editor_write_rpcs_denied",
    "revoked_existing_and_new_sockets_excluded",
    "owner_viewer_received_real_post_removal_update",
    "temporary_task_cleanup_and_event_delivery_verified",
  ]);
  assert.equal(r.verified_existing_socket_exclusion,true);
  assert.equal(r.verified_fresh_socket_exclusion,true);
  assert.equal(r.production_certified,false);
  assert.equal(r.browser_ui_verified,false);
  assert.equal(r.persisted_editor_revocation,true);
  assert.throws(()=>safeRevocationReport(["bad"]),/unsafe-report/);
});
