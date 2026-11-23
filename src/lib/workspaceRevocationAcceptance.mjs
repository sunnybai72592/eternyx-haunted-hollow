// Workspace Phase 25: evidence contract for a deliberately destructive STAGING-only
// member-removal rehearsal. Unit tests don't imply a remote database pass.
export const REVOCATION_TEAM_NAME="ETERNYX STAGING REVOCATION PROBE";
export const REVOCATION_CONFIRM="REMOVE_DISPOSABLE_STAGING_EDITOR";
export const REVOCATION_HISTORY_CONFIRM="PERSISTENT_STAGING_REVOCATION_AUDIT_ACKNOWLEDGED";
export const REVOCATION_ROLES=Object.freeze(["owner","editor","viewer","outsider"]);
export const REVOCATION_SUBSCRIBE_MS=16000;
export const REVOCATION_EVENT_MS=30000;
export const REVOCATION_QUIET_MS=3000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateRevocationConfig(env,base){
  const id=String(env.WORKSPACE_STAGING_REVOKE_SPACE_ID??"").trim();
  if(!UUID.test(id)||
     !base?.ids?.SPACE_ID||
     id.toLowerCase()===base.ids.SPACE_ID.toLowerCase()||
     id.toLowerCase()===String(env.WORKSPACE_STAGING_WRITE_SPACE_ID??"").trim().toLowerCase())
    throw Error("Workspace revocation blocked: separate-disposable-team-required");
  if(env.WORKSPACE_STAGING_REVOKE_CONFIRM!==REVOCATION_CONFIRM)
    throw Error("Workspace revocation blocked: explicit-member-removal-approval-required");
  if(env.WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM!==REVOCATION_HISTORY_CONFIRM)
    throw Error("Workspace revocation blocked: persistent-audit-consent-required");
  return {...base,revocationSpace:id};
}
export function validateRevocationFixture(team,members,identityIds,taskCount,pendingInvites){
  if(!team||team.name!==REVOCATION_TEAM_NAME||team.status!=="active"||
     team.owner_id!==identityIds?.[0]||taskCount!==0||pendingInvites!==0||
     !Array.isArray(members)||members.length!==3||
     !Array.isArray(identityIds)||identityIds.length!==4||
     new Set(identityIds).size!==4)
    throw Error("Workspace revocation blocked: dedicated-empty-team-fixture-required");
  const expected=new Map([["owner",identityIds[0]],["editor",identityIds[1]],
    ["viewer",identityIds[2]]]);
  for(const member of members){
    if(expected.get(member.role)!==member.user_id)
      throw Error("Workspace revocation blocked: membership-role-mismatch");
    expected.delete(member.role);
  }
  if(expected.size)throw Error("Workspace revocation blocked: incomplete-fixture-membership");
  return true;
}
export function isRoleDenied(result){
  const error=result?.error;
  return Boolean(error&&(
    error.code==="42501"||error.code==="PGRST301"||
    error.status===401||error.status===403));
}
export function matchesRevocationEvent(event,{space,owner,entity,type,after}){
  return Boolean(event&&Number.isSafeInteger(event.id)&&event.id>after&&
    event.space_id===space&&event.actor_id===owner&&
    event.entity_id===entity&&event.event_type===type);
}
export function verifyRevocationDelivery({packets,event,space,owner,entity,type,
  after,permitted,forbidden,denyAfter}){
  if(!matchesRevocationEvent(event,{space,owner,entity,type,after}))
    throw Error("Workspace revocation blocked: unverified-server-event");
  if(!packets||!Array.isArray(permitted)||!Array.isArray(forbidden))
    throw Error("Workspace revocation blocked: invalid-channel-evidence");
  for(const role of permitted){
    if(!packets[role]?.some(x=>x.id===event.id&&
       matchesRevocationEvent(x,{space,owner,entity,type,after})))
      throw Error("Workspace revocation blocked: authorized-delivery-missing");
  }
  for(const role of forbidden){
    if(!Array.isArray(packets[role])||packets[role].some(x=>
      x.space_id===space&&Number.isSafeInteger(x.id)&&x.id>denyAfter))
      throw Error("Workspace revocation blocked: revoked-or-outsider-event-exposed");
  }
  return true;
}
export function safeRevocationReport(checks){
  if(!Array.isArray(checks)||checks.length<9||
    !checks.every(x=>/^[a-z_]{3,64}$/.test(x)))
    throw Error("Workspace revocation blocked: unsafe-report-labels");
  return Object.freeze({
    schema:"eternyx.workspace.phase25.revocation-acceptance",
    mode:"explicit_staging_membership_mutation",
    checks:checks.map(key=>({key,status:"pass"})),
    summary:{passed:checks.length,failed:0},
    verified_pre_removal_editor_delivery:true,
    verified_revoked_metadata_denial:true,
    verified_revoked_rpc_denial:true,
    verified_existing_socket_exclusion:true,
    verified_fresh_socket_exclusion:true,
    verified_owner_viewer_control_delivery:true,
    temporary_task_removed:true,
    persisted_editor_revocation:true,
    persistent_staging_audit_events_expected:true,
    production_certified:false,
    migrations_verified:false,
    browser_ui_verified:false,
    release_gate:"manual_review_required",
    limitations:"Only a dedicated staging team. Editor removal and audit events persist; no production, migration or browser certification.",
  });
}
