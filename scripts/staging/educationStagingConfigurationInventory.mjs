/**
 * Education hosted release: no-network, no-write configuration inventory.
 * Only missing CONFIGURATION NAMES and fixed validation results are exposed.
 * This does NOT authorize a manual rehearsal or connect to Supabase.
 */
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {validateStagingRlsReadOnlyConfig} from "./stagingRlsConfig.mjs";
import {validateEducationReleaseConfig} from "./educationReleaseGate.mjs";
import {validateEducationDbConfig} from "./educationHostedDbMetadata.mjs";

export const MODES=Object.freeze(["preflight","rehearsal","journey"]);
export const COMMON_KEYS=Object.freeze([
 "ETERNYX_RLS_STAGING_URL","ETERNYX_RLS_STAGING_REF",
 "ETERNYX_RLS_PRODUCTION_REF","ETERNYX_RLS_STAGING_PUBLISHABLE_KEY",
 "ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_A_PASSWORD",
 "ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_TEST_B_PASSWORD",
 "ETERNYX_EDU_STAGING_DB_PASSWORD",
 "ETERNYX_EDU_STAGING_TEST_ID","ETERNYX_EDU_STAGING_QUESTION_ID",
 "ETERNYX_EDU_STAGING_OPTION_ID","ETERNYX_EDU_STAGING_ATTEMPT_ID",
 "ETERNYX_EDU_STAGING_ANSWER_ID",
 "ETERNYX_EDU_WRITE_TEST_ID","ETERNYX_EDU_WRITE_MCQ_ID",
 "ETERNYX_EDU_WRITE_MCQ_OPTION_ID","ETERNYX_EDU_WRITE_ESSAY_ID",
 "ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT","ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT",
 "ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT","ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT",
 "ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT",
 "ETERNYX_EDU_RESULT_A_SCORE","ETERNYX_EDU_RESULT_A_MAX",
 "ETERNYX_EDU_RESULT_B_SCORE","ETERNYX_EDU_RESULT_B_MAX",
]);
export const WRITE_KEYS=Object.freeze([
 "ETERNYX_RLS_INSTRUCTOR_EMAIL","ETERNYX_RLS_INSTRUCTOR_PASSWORD",
 "ETERNYX_EDU_REVIEW_TEST_ID","ETERNYX_EDU_REVIEW_ATTEMPT_ID",
 "ETERNYX_EDU_REVIEW_ANSWER_ID","ETERNYX_EDU_REVIEW_AWARDED_POINTS",
 "ETERNYX_EDU_FINALIZE_EXPECTED_SCORE","ETERNYX_EDU_FINALIZE_EXPECTED_MAX",
 "ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY",
]);
const FLAGS=Object.freeze([
 "required_configuration_present",
 "production_reference_isolated",
 "release_fixture_contract_valid",
 "staging_database_connection_config_valid",
]);
export const INVENTORY_PATH="test-results/education-hosted-configuration-inventory.json";
const SECRET_NAMES=new Set([
 "ETERNYX_RLS_STAGING_URL","ETERNYX_RLS_STAGING_PUBLISHABLE_KEY",
 "ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_A_PASSWORD",
 "ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_TEST_B_PASSWORD",
 "ETERNYX_RLS_INSTRUCTOR_EMAIL","ETERNYX_RLS_INSTRUCTOR_PASSWORD",
 "ETERNYX_EDU_STAGING_DB_PASSWORD","ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY",
]);
export function configurationLocation(name){
 if(!COMMON_KEYS.includes(name)&&!WRITE_KEYS.includes(name))throw new Error("Unknown Education configuration name");
 return SECRET_NAMES.has(name)?"rls-staging environment secret":"rls-staging environment variable";
}
const fail=()=>{throw new Error("Education staging inventory blocked");};

export function requiredConfigurationNames(mode){
 if(!MODES.includes(mode))fail();
 return Object.freeze([...COMMON_KEYS,...(mode==="preflight"?[]:WRITE_KEYS)]);
}
// The approval constants here are ONLY inputs to pure validators; these are
// not passed to any network client, child process, or release workflow.
export function configForOfflineValidation(env,mode){
 const allowed=requiredConfigurationNames(mode);
 const write=mode!=="preflight";
 // Do not copy unrelated runner credentials or write-only fixture fields into preflight.
 const scoped=Object.fromEntries(allowed.map(key=>[key,env[key]]));
 return {
  ...scoped,
  ETERNYX_EDU_RELEASE_MODE:mode,
  ETERNYX_EDU_RELEASE_APPROVAL:"I_APPROVE_EDUCATION_STAGING_RELEASE_CHECKS",
  ETERNYX_EDU_STAGING_READ_APPROVAL:"I_APPROVE_EDUCATION_STAGING_READ_ONLY",
  ETERNYX_EDU_RESULTS_READ_APPROVAL:"I_APPROVE_EDUCATION_STAGING_RESULTS_READ_ONLY",
  ETERNYX_EDU_DB_META_APPROVAL:"I_APPROVE_EDUCATION_STAGING_DB_METADATA_READ_ONLY",
  ETERNYX_EDU_WRITE_MODE:write?"write":"preflight",
  ETERNYX_EDU_CBT_WRITE_APPROVAL:write?"I_APPROVE_FRESH_EDUCATION_STAGING_CBT_ATTEMPT":"",
  ETERNYX_EDU_IRREVERSIBLE_ACK:write?"I_ACKNOWLEDGE_STAGING_ATTEMPT_CANNOT_BE_RETAKEN":"",
  ETERNYX_EDU_REVIEW_MODE:write?"review":"preflight",
  ETERNYX_EDU_REVIEW_WRITE_APPROVAL:write?"I_APPROVE_SYNTHETIC_INSTRUCTOR_REVIEW_WRITE":"",
  ETERNYX_EDU_REVIEW_WRITE_ACK:write?"I_ACKNOWLEDGE_REVIEW_WILL_PERSIST_IN_STAGING":"",
  ETERNYX_EDU_FINALIZE_MODE:write?"finalize":"preflight",
  ETERNYX_EDU_FINALIZE_WRITE_APPROVAL:write?"I_APPROVE_ONE_SYNTHETIC_STAGING_FINAL_GRADE":"",
  ETERNYX_EDU_FINALIZE_IMMUTABLE_ACK:write?"I_ACKNOWLEDGE_OFFICIAL_GRADE_BECOMES_IMMUTABLE":"",
  ETERNYX_EDU_RELEASE_IRREVERSIBLE_ACK:write?
    "I_ACKNOWLEDGE_STAGING_EXAM_REVIEW_AND_GRADE_ARE_IRREVERSIBLE":"",
  ETERNYX_EDU_JOURNEY_APPROVAL:mode==="journey"?
    "I_APPROVE_SINGLE_STAGING_EXAM_FULL_JOURNEY":"",
  // No privileged key is allowed in the preflight config validator.
  ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:write?
    env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"",
 };
}
function valid(fn){
 try{fn();return true;}catch{return false;}
}
export function makeEducationStagingInventory(env,mode){
 const required=requiredConfigurationNames(mode);
 if(!env||typeof env!=="object")fail();
 const sha=env.GITHUB_SHA,id=String(env.GITHUB_RUN_ID||""),
   attempt=String(env.GITHUB_RUN_ATTEMPT||"");
 if(!/^[a-f0-9]{40}$/.test(sha||"")||
  !/^[1-9][0-9]*$/.test(id)||!/^[1-9][0-9]*$/.test(attempt))fail();
 const missing=required.filter(k=>typeof env[k]!=="string"||env[k].trim()==="");
 const withApprovals=configForOfflineValidation(env,mode);
 const complete=missing.length===0;
 const checks={
  required_configuration_present:complete,
  production_reference_isolated:valid(()=>validateStagingRlsReadOnlyConfig(env)),
  release_fixture_contract_valid:complete&&valid(()=>validateEducationReleaseConfig(withApprovals)),
  staging_database_connection_config_valid:complete&&valid(()=>validateEducationDbConfig(withApprovals)),
 };
 const ready=FLAGS.every(k=>checks[k]===true);
 return Object.freeze({
  schema:1,suite:"education-hosted-configuration-inventory",
  source_sha:sha,github_run_id:id,github_run_attempt:attempt,
  run_mode:mode,required_count:required.length,
  missing_configuration_names:missing,
  checks:FLAGS.map(check=>({check,result:checks[check]?"passed":"blocked"})),
  outcome:ready?"configuration_syntax_ready":"configuration_blocked",
  network_checks_performed:false,hosted_staging_verified:false,
  production_tested:false,production_release_approved:false,
 });
}
export function runInventory(env=process.env){
 try{
  // Invalid provenance or malformed mode must never leave an old successful report.
  rmSync(INVENTORY_PATH,{force:true});
  const report=makeEducationStagingInventory(env,env.ETERNYX_EDU_INVENTORY_MODE);
  mkdirSync("test-results",{recursive:true});
  writeFileSync(INVENTORY_PATH,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  const markdown=[
    "### Education staging configuration inventory",
    "Mode: "+report.run_mode+"; result: "+report.outcome,
    "This checks only local configuration and protected credential shape. No network access or live hosted authentication occurred.",
    "Missing configuration names: "+report.missing_configuration_names.length,
    ...report.missing_configuration_names.map(k=>"- \`"+k+"\` — "+configurationLocation(k)),
    ...report.checks.map(c=>"- "+c.check+": "+c.result),
    "Production release approved: NO.",
  ].join("\n")+"\n";
  if(typeof env.GITHUB_STEP_SUMMARY==="string"&&env.GITHUB_STEP_SUMMARY.length>0)
    appendFileSync(env.GITHUB_STEP_SUMMARY,markdown);
  process.stdout.write("Education "+report.run_mode+" offline configuration "+
    report.outcome+"; missing names: "+report.missing_configuration_names.length+
    "; no DB contacted.\n");
  if(report.outcome!=="configuration_syntax_ready")process.exitCode=1;
 }catch{
  process.stderr.write("Education staging inventory blocked; no database contacted.\n");
  process.exitCode=1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runInventory();
}
