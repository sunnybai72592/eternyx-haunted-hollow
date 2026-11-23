// Workspace Phase 22. Pure contract for real Supabase Postgres Changes delivery.
// SUBSCRIBED alone never counts as a proven delivered event.
export const WORKSPACE_REALTIME_ROLES=Object.freeze(["owner","editor","viewer","outsider"]);
export const REALTIME_DELIVERY_WINDOW_MS=120000;
export const REALTIME_SUBSCRIBE_WINDOW_MS=16000;
export const REALTIME_QUIET_WINDOW_MS=3000;

export function matchesWorkspaceTaskUpdate(row,{space,task,owner,baseline}){
  return Boolean(row&&typeof row==="object"
    &&Number.isSafeInteger(row.id)&&row.id>baseline
    &&row.space_id===space && row.entity_id===task
    &&row.actor_id===owner &&row.event_type==="task_updated"
    &&typeof row.created_at==="string"
    &&Number.isFinite(Date.parse(row.created_at)));
}
export function checkWorkspaceRealtimeEvidence({
  baseline,delivered,outsiderCount,serverRow,space,task,owner,subscribed,
}){
  if(!Number.isSafeInteger(baseline)||baseline<0||
    !Number.isSafeInteger(outsiderCount)||outsiderCount<0
    ||!Array.isArray(subscribed)||!Array.isArray(delivered)){
    throw Error("Invalid Realtime acceptance evidence");
  }
  if(WORKSPACE_REALTIME_ROLES.some(role=>!subscribed.includes(role)))
    throw Error("All authenticated Realtime subscribers must connect");
  if(outsiderCount!==0)throw Error("Unauthorized outsider received team event");
  const valid=matchesWorkspaceTaskUpdate(serverRow,{space,task,owner,baseline});
  if(!valid)throw Error("No matching server-persisted task update");
  const roles=["owner","editor","viewer"];
  if(roles.some(role=>!delivered.some(x=>x.role===role&&x.eventId===serverRow.id)))
    throw Error("Not every authorized member received the new server event");
  return Object.freeze({
    schema:"eternyx.workspace.phase22.realtime-acceptance",version:1,
    mode:"operator_triggered_authenticated_staging",
    verified_realtime_delivery:true,
    verified_in_scope_server_event:true,
    verified_outsider_exclusion:true,
    verified_authorized_roles:roles.length,
    production_certified:false,
    migration_history_verified:false,
    realtime_revocation_verified:false,
    background_tab_recovery_verified:false,
    browser_ui_verified:false,
    application_data_modified_by_runner:false,
    release_gate:"manual_review_required",
    limitations:"A real staging task edit was performed manually by the operator. This does not prove revocation, browser behavior, deployment history or production readiness.",
  });
}
