import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateSuiteConfig,verifySuiteStage,SUITE_CONFIRM} from "../scripts/workspace-staging-acceptance-suite.mjs";
import {FIXTURE_REF} from "../scripts/workspace-staging-provision-fixtures.mjs";
import {WRITE_PROBE_APPROVAL,WRITE_AUDIT_APPROVAL} from "../src/lib/workspaceRoleWriteAcceptance.mjs";
import {REVOCATION_CONFIRM,REVOCATION_HISTORY_CONFIRM} from "../src/lib/workspaceRevocationAcceptance.mjs";
import {STORAGE_APPROVAL} from "../src/lib/workspaceStorageAcceptance.mjs";
const uuid=n=>n.toString(16).padStart(8,"0")+"-1111-4111-8111-"+n.toString(16).padStart(12,"0");
function env(){
 const e={WORKSPACE_FIXTURE_COMPLETE:"true",WORKSPACE_FIXTURE_SUITE_CONFIRM:SUITE_CONFIRM,
 WORKSPACE_STAGING_PROJECT_REF:FIXTURE_REF,WORKSPACE_STAGING_URL:"https://"+FIXTURE_REF+".supabase.co/",
 WORKSPACE_STAGING_PUBLISHABLE_KEY:"sb_publishable_fixture",WORKSPACE_STAGING_CONFIRM:"READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE",
 WORKSPACE_STAGING_SPACE_ID:uuid(1),WORKSPACE_STAGING_TEAM_TASK_ID:uuid(2),WORKSPACE_STAGING_PRIVATE_PROJECT_ID:uuid(3),
 WORKSPACE_STAGING_PRIVATE_TASK_ID:uuid(4),WORKSPACE_STAGING_PRIVATE_ITEM_ID:uuid(5),WORKSPACE_STAGING_WRITE_SPACE_ID:uuid(6),
 WORKSPACE_STAGING_REVOKE_SPACE_ID:uuid(7),WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID:uuid(8),WORKSPACE_STAGING_STORAGE_SHA256:"a".repeat(64),
 WORKSPACE_STAGING_WRITE_CONFIRM:WRITE_PROBE_APPROVAL,WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM:WRITE_AUDIT_APPROVAL,
 WORKSPACE_STAGING_REVOKE_CONFIRM:REVOCATION_CONFIRM,WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM:REVOCATION_HISTORY_CONFIRM,
 WORKSPACE_STAGING_STORAGE_CONFIRM:STORAGE_APPROVAL,WORKSPACE_STAGING_REALTIME_CONFIRM:"READ_ONLY_REALTIME_WINDOW"};
 ["OWNER","EDITOR","VIEWER","OUTSIDER"].forEach((role,i)=>{
  e["WORKSPACE_STAGING_"+role+"_EMAIL"]=role+"@example.com";e["WORKSPACE_STAGING_"+role+"_PASSWORD"]="fixture-passphrase";
  e["WORKSPACE_FIXTURE_CREATED_"+role+"_ID"]=uuid(10+i);
 });return e;
}
test("suite requires completed exact-staging fixtures, separate scopes and explicit consent",()=>{
 assert.equal(validateSuiteConfig(env()).accounts.length,4);
 for(const patch of [{WORKSPACE_FIXTURE_COMPLETE:"false"},{WORKSPACE_FIXTURE_SUITE_CONFIRM:"yes"},
 {WORKSPACE_STAGING_PROJECT_REF:"wcncuarekaofmfurbtbh"},{WORKSPACE_STAGING_WRITE_SPACE_ID:uuid(7)},
 {WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID:uuid(3)},{WORKSPACE_FIXTURE_CREATED_EDITOR_ID:uuid(10)}])
  assert.throws(()=>validateSuiteConfig({...env(),...patch}));
});
test("stage-specific evidence cannot be replaced by a generic success flag",()=>{
 const base={release_gate:"manual_review_required",production_certified:false};
 for(const stage of ["authenticated_read","private_storage","concurrent_write","realtime","revocation"])
  assert.throws(()=>verifySuiteStage(stage,base));
 const rt={...base,verified_realtime_delivery:true,verified_outsider_exclusion:true,application_data_modified_by_runner:true};
 assert.equal(verifySuiteStage("realtime",rt),true);
 assert.throws(()=>verifySuiteStage("realtime",{...rt,application_data_modified_by_runner:false}));
 assert.throws(()=>verifySuiteStage("realtime",{...rt,production_certified:true}));
});
test("automated edit only occurs after armed subscriptions; irreversible revocation runs last",()=>{
 const rt=readFileSync(new URL("../scripts/workspace-team-staging-realtime.mjs",import.meta.url),"utf8");
 assert.ok(rt.indexOf("baseline=await latestId")<rt.indexOf("await approvedFixtureEdit("));
 assert.ok(rt.includes('application_data_modified_by_runner:true'));
 const s=readFileSync(new URL("../scripts/workspace-staging-acceptance-suite.mjs",import.meta.url),"utf8");
 assert.ok(s.indexOf("()=>runWorkspaceRealtimeStaging")<s.indexOf("()=>runStagingRevocationAcceptance"));
 assert.ok(s.includes("p_expected_updated_at:row.updated_at")&&s.includes("eternyx_workspace_test_fixture"));
 assert.ok(!s.includes("auth.admin")&&!s.includes("WORKSPACE_FIXTURE_ADMIN_KEY"));
});
