import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  COMMON_KEYS,WRITE_KEYS,MODES,requiredConfigurationNames,
  configForOfflineValidation,makeEducationStagingInventory,
} from "../scripts/staging/educationStagingConfigurationInventory.mjs";

const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
function synthetic(mode="preflight"){
 const env={
  GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"1234",GITHUB_RUN_ATTEMPT:"1",
  ETERNYX_RLS_STAGING_REF:"bbbbbbbbbbbbbbbbbbbb",
  ETERNYX_RLS_PRODUCTION_REF:"aaaaaaaaaaaaaaaaaaaa",
  ETERNYX_RLS_STAGING_URL:"https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
  ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_offline_key_only",
  ETERNYX_RLS_TEST_A_EMAIL:"rls-student-a@example.invalid",
  ETERNYX_RLS_TEST_A_PASSWORD:"synthetic-password-A",
  ETERNYX_RLS_TEST_B_EMAIL:"rls-student-b@example.invalid",
  ETERNYX_RLS_TEST_B_PASSWORD:"synthetic-password-B",
  ETERNYX_EDU_STAGING_DB_PASSWORD:"synthetic-staging-db-password",
  ETERNYX_EDU_STAGING_TEST_ID:uuid(1),
  ETERNYX_EDU_STAGING_QUESTION_ID:uuid(2),
  ETERNYX_EDU_STAGING_OPTION_ID:uuid(3),
  ETERNYX_EDU_STAGING_ATTEMPT_ID:uuid(4),
  ETERNYX_EDU_STAGING_ANSWER_ID:uuid(5),
  ETERNYX_EDU_WRITE_TEST_ID:uuid(6),
  ETERNYX_EDU_WRITE_MCQ_ID:uuid(7),
  ETERNYX_EDU_WRITE_MCQ_OPTION_ID:uuid(8),
  ETERNYX_EDU_WRITE_ESSAY_ID:uuid(9),
  ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT:uuid(10),
  ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT:uuid(11),
  ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT:uuid(12),
  ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT:uuid(13),
  ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT:uuid(14),
  ETERNYX_EDU_RESULT_A_SCORE:"6",ETERNYX_EDU_RESULT_A_MAX:"10",
  ETERNYX_EDU_RESULT_B_SCORE:"1",ETERNYX_EDU_RESULT_B_MAX:"1",
  ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-instructor@example.invalid",
  ETERNYX_RLS_INSTRUCTOR_PASSWORD:"synthetic-instructor-password",
  ETERNYX_EDU_REVIEW_TEST_ID:uuid(15),
  ETERNYX_EDU_REVIEW_ATTEMPT_ID:uuid(10),
  ETERNYX_EDU_REVIEW_ANSWER_ID:uuid(16),
  ETERNYX_EDU_REVIEW_AWARDED_POINTS:"1",
  ETERNYX_EDU_FINALIZE_EXPECTED_SCORE:"6",
  ETERNYX_EDU_FINALIZE_EXPECTED_MAX:"10",
  ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"sb_secret_offline_synthetic_test_key_123456",
 };
 if(mode==="preflight") delete env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY;
 return env;
}
const source=readFileSync(new URL("../scripts/staging/educationStagingConfigurationInventory.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/education-staging-config-inventory.yml",import.meta.url),"utf8");
const release=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");

test("all three manual modes have complete, distinct recognized config names",()=>{
 assert.deepEqual(MODES,["preflight","rehearsal","journey"]);
 assert.equal(COMMON_KEYS.length,27);
 assert.equal(WRITE_KEYS.length,9);
 for(const mode of MODES){
  const names=requiredConfigurationNames(mode);
  assert.equal(names.length,mode==="preflight"?27:36);
  assert.equal(new Set(names).size,names.length);
  for(const n of names){
   assert.match(n,/^ETERNYX_[A-Z0-9_]+$/);
   assert.ok(workflow.includes(n+": \${{"),n);
  }
 }
 assert.throws(()=>requiredConfigurationNames("production"));
});
test("synthetic fully formed config passes pure offline validators in all modes",()=>{
 for(const mode of MODES){
  const r=makeEducationStagingInventory(synthetic(mode),mode);
  assert.equal(r.outcome,"configuration_syntax_ready");
  assert.deepEqual(r.missing_configuration_names,[]);
  assert.ok(r.checks.every(c=>c.result==="passed"));
  assert.equal(r.network_checks_performed,false);
  assert.equal(r.hosted_staging_verified,false);
  assert.equal(r.production_release_approved,false);
  assert.equal(r.required_count,mode==="preflight"?27:36);
 }
});
test("missing configuration produces missing NAME only and never a secret value",()=>{
 for(const mode of MODES){
  const env=synthetic(mode);
  delete env.ETERNYX_RLS_TEST_A_PASSWORD;
  delete env.ETERNYX_EDU_STAGING_DB_PASSWORD;
  if(mode!=="preflight")delete env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY;
  const r=makeEducationStagingInventory(env,mode);
  assert.equal(r.outcome,"configuration_blocked");
  assert.deepEqual(r.missing_configuration_names.sort(),
   (mode==="preflight" ?
    ["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_EDU_STAGING_DB_PASSWORD"]:
    ["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_EDU_STAGING_DB_PASSWORD",
      "ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY"]).sort());
  const output=JSON.stringify(r);
  assert.doesNotMatch(output,/synthetic-password|synthetic-staging|sb_publishable_|sb_secret_/);
  assert.doesNotMatch(output,/example\.invalid|bbbbbbbbbbbbbbbbbbbb/);
 }
});
test("ref collision and invalid staging host reject offline isolation",()=>{
 for(const patch of [
  e=>{e.ETERNYX_RLS_STAGING_REF=e.ETERNYX_RLS_PRODUCTION_REF;
       e.ETERNYX_RLS_STAGING_URL="https://"+e.ETERNYX_RLS_STAGING_REF+".supabase.co";},
  e=>{e.ETERNYX_RLS_STAGING_URL="https://wrong-host.example.invalid";},
 ]){
  const env=synthetic();patch(env);
  const r=makeEducationStagingInventory(env,"preflight");
  assert.equal(r.outcome,"configuration_blocked");
  assert.equal(r.checks.find(x=>x.check==="production_reference_isolated").result,"blocked");
  assert.equal(r.production_release_approved,false);
 }
});
test("bad fixture cross references, wrong grade marks, invalid service key block modes",()=>{
 for(const [mode,change] of [
  ["preflight",e=>{e.ETERNYX_EDU_STAGING_TEST_ID=e.ETERNYX_EDU_WRITE_TEST_ID;}],
  ["rehearsal",e=>{e.ETERNYX_EDU_REVIEW_ATTEMPT_ID=uuid(17);}],
  ["journey",e=>{e.ETERNYX_EDU_RESULT_A_SCORE="9";}],
  ["journey",e=>{e.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY="not-a-secret-key";}],
 ]){
  const env=synthetic(mode);change(env);
  const report=makeEducationStagingInventory(env,mode);
  assert.equal(report.outcome,"configuration_blocked");
  assert.equal(report.checks.find(x=>x.check==="release_fixture_contract_valid").result,"blocked");
 }
});
test("in-memory validation markers cannot enable a real write or override source env",()=>{
 const env=synthetic("journey");
 const approvals=configForOfflineValidation(env,"journey");
 assert.ok(!Object.hasOwn(env,"ETERNYX_EDU_RELEASE_APPROVAL"));
 assert.ok(Object.hasOwn(approvals,"ETERNYX_EDU_RELEASE_APPROVAL"));
 assert.ok(!source.includes("spawnSync("));
 assert.ok(!source.includes("fetch("));
 assert.ok(!source.includes("createClient("));
 assert.ok(!source.includes("execSync("));
 assert.match(source,/production_release_approved:false/);
});
test("manual inventory is no-network, no scheduled execution and uploads only sanitized artifact",()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\bpush:|\bpull_request:|\bschedule:/);
 assert.match(workflow,/environment: rls-staging/);
 assert.match(workflow,/permissions:\s+contents: read/);
 assert.match(workflow,/node scripts\/staging\/educationStagingConfigurationInventory\.mjs/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/test-results\/education-hosted-configuration-inventory\.json/);
 assert.doesNotMatch(workflow,/curl |psql |supabase db |npm run deploy/);
 for(const name of [...COMMON_KEYS,...WRITE_KEYS])
  assert.ok(release.includes(name),name);
});
