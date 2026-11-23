import test from "node:test";
import assert from "node:assert/strict";
import {
  WRITE_PROBE_SPACE_NAME,isExpectedAccessDenial,assertDeniedOutcome,
  validateWriteProbeTeam,writeRoleProbeReport,
} from "../src/lib/workspaceRoleWriteAcceptance.mjs";
import {validateStagingWriteConfig}
  from "../scripts/workspace-team-staging-write-roles.mjs";
const uuid=(n)=>String(n).repeat(8)+"-1111-4111-8111-"+String(n).repeat(12);
function config(){
  const e={
    WORKSPACE_STAGING_URL:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/",
    WORKSPACE_STAGING_PROJECT_REF:"aaaaaaaaaaaaaaaaaaaa",
    WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_staging",
    WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
    WORKSPACE_STAGING_SPACE_ID:uuid(1),
    WORKSPACE_STAGING_TEAM_TASK_ID:uuid(2),
    WORKSPACE_STAGING_PRIVATE_PROJECT_ID:uuid(3),
    WORKSPACE_STAGING_PRIVATE_TASK_ID:uuid(4),
    WORKSPACE_STAGING_PRIVATE_ITEM_ID:uuid(5),
    WORKSPACE_STAGING_WRITE_SPACE_ID:uuid(6),
    WORKSPACE_STAGING_WRITE_CONFIRM:"DISPOSABLE_STAGING_WRITE_ROLE_PROBE",
    WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM:"PERSISTENT_TEST_EVENTS_ACKNOWLEDGED",
  };
  for(const role of ["OWNER","EDITOR","VIEWER","OUTSIDER"]){
    e["WORKSPACE_STAGING_"+role+"_EMAIL"]=role.toLowerCase()+"@example.invalid";
    e["WORKSPACE_STAGING_"+role+"_PASSWORD"]="nonproduction-test-password";
  }
  return e;
}
test("write acceptance requires a separate dedicated team and two explicit approvals",()=>{
  const e=config();
  assert.equal(validateStagingWriteConfig(e).writeSpace,uuid(6));
  e.WORKSPACE_STAGING_WRITE_SPACE_ID=uuid(1);
  assert.throws(()=>validateStagingWriteConfig(e),/separate/);
  e.WORKSPACE_STAGING_WRITE_SPACE_ID=uuid(6);
  e.WORKSPACE_STAGING_WRITE_CONFIRM="yes";
  assert.throws(()=>validateStagingWriteConfig(e),/disposable-write-approval/);
  e.WORKSPACE_STAGING_WRITE_CONFIRM="DISPOSABLE_STAGING_WRITE_ROLE_PROBE";
  e.WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM="yes";
  assert.throws(()=>validateStagingWriteConfig(e),/persistent-audit-consent/);
  e.WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM="PERSISTENT_TEST_EVENTS_ACKNOWLEDGED";
  e.WORKSPACE_STAGING_PROJECT_REF="wcncuarekaofmfurbtbh";
  e.WORKSPACE_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co/";
  assert.throws(()=>validateStagingWriteConfig(e),/nonproduction/);
});
test("dedicated team owner, exact three roles and active scope cannot be bypassed",()=>{
  const ids=[uuid(1),uuid(2),uuid(3),uuid(4)];
  const team={name:WRITE_PROBE_SPACE_NAME,status:"active",owner_id:ids[0]};
  const people=["owner","editor","viewer"].map((role,i)=>({role,user_id:ids[i]}));
  assert.equal(validateWriteProbeTeam(team,ids[0],people,ids),true);
  assert.throws(()=>validateWriteProbeTeam({...team,name:"real customer team"},ids[0],people,ids),/dedicated/);
  assert.throws(()=>validateWriteProbeTeam({...team,status:"archived"},ids[0],people,ids),/dedicated/);
  assert.throws(()=>validateWriteProbeTeam(team,ids[0],
    [...people,{role:"viewer",user_id:ids[3]}],ids),/membership/);
  assert.throws(()=>validateWriteProbeTeam(team,ids[0],
    people.map(p=>({...p,user_id:ids[3]})),ids),/membership/);
});
test("denials are precise; unexpected write success is captured for cleanup",()=>{
  for(const error of [{code:"42501"},{code:"PGRST301"},{status:403},{status:401}])
    assert.equal(assertDeniedOutcome({error}),true);
  assert.equal(isExpectedAccessDenial({code:"PGRST116"}),false);
  assert.throws(()=>assertDeniedOutcome({error:{code:"PGRST116"}}),/not-proven/);
  const leaked=[];
  assert.throws(()=>assertDeniedOutcome({data:uuid(7),error:null},id=>leaked.push(id)),/not-proven/);
  assert.deepEqual(leaked,[uuid(7)]);
});
test("only sanitized report can pass and it warns of persistent staging audit events",()=>{
  const report=writeRoleProbeReport([
    "four_verified_staging_users","empty_dedicated_team_and_exact_roles",
    "owner_and_editor_created_real_tasks","viewer_outsider_comment_step_delete_denied",
    "temporary_tasks_removed_with_audit",
  ]);
  assert.equal(report.production_certified,false);
  assert.equal(report.persistent_audit_events_expected,true);
  assert.equal(report.verified_temporary_task_cleanup,true);
  assert.equal(report.release_gate,"manual_review_required");
  assert.throws(()=>writeRoleProbeReport(["bad status"]),/invalid-sanitized/);
});
