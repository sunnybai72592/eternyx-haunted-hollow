// Phase 16 — authenticated, owner-scoped READ-ONLY reachability checks.
// "pass" means the requested query succeeded, NOT RLS isolation certified,
// complete migration rollout, Storage file readability, or production approval.
import { WORKSPACE_BUCKET } from "./workspaceRules.mjs";

export const WORKSPACE_READINESS_CHECKS = Object.freeze([
  { key:"projects", title:"Private projects API", table:"workspace_projects" },
  { key:"tasks", title:"Tasks API", table:"workspace_tasks" },
  { key:"checklists", title:"Checklist steps API", table:"workspace_task_steps" },
  { key:"saved_items", title:"Saved items API", table:"workspace_items" },
  { key:"import_sessions", title:"Import recovery sessions API", table:"workspace_import_sessions" },
  { key:"receipts", title:"Reviewed recovery receipts API", table:"workspace_reconciliation_receipts" },
]);

const failure = (key,title) => ({
  key,title,status:"fail",detail:"Read access could not be confirmed. Verify staging migration, grants, RLS and account setup.",
});
const passed = (key,title) => ({
  key,title,status:"pass",detail:"Owner-scoped read-only request succeeded (not an isolation audit).",
});

export async function checkWorkspaceReadiness(client, expectedOwner, now = () => new Date().toISOString()) {
  if (!client?.auth?.getUser || !client?.from || !client?.storage?.from ||
      typeof expectedOwner !== "string" || !expectedOwner) {
    throw new Error("Readiness requires a signed-in Workspace owner and valid Supabase client");
  }
  const result = {
    format:"eternyx.workspace.readiness",
    version:1,
    checked_at:now(),
    mode:"authenticated-read-only",
    scope:"Current signed-in account only; no test data created or modified",
    production_certified:false,
    cross_owner_rls_tested:false,
    actual_restore_drilled:false,
    checks:[],
  };
  let auth;
  try { auth = await client.auth.getUser(); }
  catch { auth = null; }
  if (auth?.error || auth?.data?.user?.id !== expectedOwner) {
    result.checks.push(failure("auth","Fresh authenticated account"));
    result.release_gate="blocked";
    return result;
  }
  result.checks.push(passed("auth","Fresh authenticated account"));
  for (const check of WORKSPACE_READINESS_CHECKS) {
    try {
      const response = await client.from(check.table)
        .select("id").eq("owner_id",expectedOwner).limit(1);
      result.checks.push(response?.error ? failure(check.key,check.title) :
        passed(check.key,check.title));
    } catch {
      result.checks.push(failure(check.key,check.title));
    }
  }
  // Storage .list is a metadata read only and may succeed for an empty
  // directory without proving private file downloads or cross-account RLS.
  try {
    const response = await client.storage.from(WORKSPACE_BUCKET)
      .list(expectedOwner,{limit:1});
    result.checks.push(response?.error
      ? failure("storage_list","Private Storage metadata listing")
      : passed("storage_list","Private Storage metadata listing"));
  } catch {
    result.checks.push(failure("storage_list","Private Storage metadata listing"));
  }
  let finalAuth;
  try { finalAuth = await client.auth.getUser(); }
  catch { finalAuth = null; }
  if (finalAuth?.error || finalAuth?.data?.user?.id !== expectedOwner) {
    result.checks.push(failure("auth_stable","Account remained stable during checks"));
  } else {
    result.checks.push(passed("auth_stable","Account remained stable during checks"));
  }
  const counts = result.checks.reduce((acc,c)=>{
    acc[c.status]++;return acc;
  },{pass:0,fail:0});
  result.summary=counts;
  result.release_gate=counts.fail?"blocked":"review_required";
  result.limitations="No writes, RPC restore, foreign-owner access, actual private bytes or live production migration inventory were tested. A green result is NOT a production release approval.";
  return result;
}

export function workspaceReadinessSafeReport(result) {
  if (!result || result.format!=="eternyx.workspace.readiness" ||
      result.version!==1 || !Array.isArray(result.checks)) {
    throw new Error("Cannot export an invalid Workspace readiness report");
  }
  // Explicitly whitelist report fields. Never export user ID, server URL,
  // JWT, private DB records, Storage paths, raw errors, or credentials.
  return JSON.stringify({
    format:result.format,version:1,checked_at:result.checked_at,
    mode:result.mode,scope:result.scope,
    release_gate:result.release_gate,
    production_certified:false,cross_owner_rls_tested:false,
    actual_restore_drilled:false,
    checks:result.checks.map(c=>({
      key:c.key,title:c.title,status:c.status,detail:c.detail,
    })),
    limitations:result.limitations??"Read-only reachability is not production certification.",
  },null,2);
}
