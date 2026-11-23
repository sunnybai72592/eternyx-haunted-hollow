// Phase 23: contract for an explicitly approved, disposable STAGING write probe.
export const WRITE_PROBE_SPACE_NAME="ETERNYX STAGING WRITE PROBE";
export const WRITE_PROBE_APPROVAL="DISPOSABLE_STAGING_WRITE_ROLE_PROBE";
export const WRITE_AUDIT_APPROVAL="PERSISTENT_TEST_EVENTS_ACKNOWLEDGED";
export const UUID_REGEX=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isExpectedAccessDenial(error){
  return Boolean(error&&typeof error==="object"&&(
    error.code==="42501"||error.code==="PGRST301"||
    error.status===401||error.status===403
  ));
}

export function assertDeniedOutcome(result,registerUnexpectedTask=()=>{}){
  if(result?.error&&isExpectedAccessDenial(result.error))return true;
  if(UUID_REGEX.test(String(result?.data??"")))
    registerUnexpectedTask(result.data);
  throw Error("Workspace Phase 23 blocked: unauthorized-mutation-not-proven-denied");
}

export function validateWriteProbeTeam(team,ownerId,members,identities){
  if(!team||team.name!==WRITE_PROBE_SPACE_NAME||
     team.status!=="active"||team.owner_id!==ownerId)
    throw Error("Workspace Phase 23 blocked: dedicated-active-owner-team-required");
  if(!Array.isArray(members)||members.length!==3||identities.length!==4)
    throw Error("Workspace Phase 23 blocked: unexpected-team-membership");
  const expected=new Map([["owner",identities[0]],["editor",identities[1]],
    ["viewer",identities[2]]]);
  for(const member of members){
    if(expected.get(member.role)!==member.user_id)
      throw Error("Workspace Phase 23 blocked: unexpected-team-membership");
    expected.delete(member.role);
  }
  if(expected.size)
    throw Error("Workspace Phase 23 blocked: incomplete-member-roles");
  return true;
}

export function writeRoleProbeReport(checks){
  if(!Array.isArray(checks)||checks.length<5||
     !checks.every(x=>typeof x==="string"&&/^[a-z_]{3,55}$/.test(x)))
    throw Error("Workspace Phase 23 blocked: invalid-sanitized-evidence");
  return Object.freeze({
    schema:"eternyx.workspace.phase23.role-write-acceptance",
    mode:"explicit_operator_staging_mutation",
    checks:checks.map(key=>({key,status:"pass"})),
    summary:{passed:checks.length,failed:0},
    verified_editor_owner_writes:true,
    verified_viewer_outsider_denial:true,
    verified_generated_activity:true,
    verified_temporary_task_cleanup:true,
    persistent_audit_events_expected:true,
    production_certified:false,
    migration_history_verified:false,
    private_storage_bytes_verified:false,
    realtime_delivery_verified:false,
    release_gate:"manual_review_required",
    limitations:"Authorized staging records were created/deleted; immutable audit events remain. This does not prove production readiness or realtime.",
  });
}
