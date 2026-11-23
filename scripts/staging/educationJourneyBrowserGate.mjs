/**
 * ONE freshly created, reviewed and finalized staging CBT attempt must be
 * visible to its owner (and invisible to a different student) in the actual UI.
 *
 * The private attempt target never appears in artifacts or workflow summaries.
 * Only a 0600 local file bridges the already-verified backend journey to Chrome.
 */
import {mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {verifyJourneyHandoff,checkJourneyApproval} from "./educationJourneyHandoff.mjs";
import {EDUCATION_RELEASE_STAGES} from "./educationReleaseGate.mjs";
import {DATABASE_CHECKS} from "./educationHostedDbMetadata.mjs";
import {FIXTURE_CHECKS} from "./educationJourneyFixturePreflight.mjs";

export const PRIVATE_FRESH_JOURNEY_TARGET =
  "test-results/education-journey-ui-target-private.json";
export const FRESH_JOURNEY_BROWSER_EVIDENCE =
  "test-results/education-hosted-fresh-journey-browser.json";
export const FRESH_JOURNEY_COMBINED_EVIDENCE =
  "test-results/education-hosted-fresh-journey-ui-backend.json";
export const FRESH_JOURNEY_BROWSER_CASES=Object.freeze([
  "desktop_student_a_new_final_grade",
  "desktop_student_b_cannot_read_new_attempt",
  "mobile_student_a_new_final_grade",
  "mobile_student_b_cannot_read_new_attempt",
  "no_unapproved_network_writes",
  "no_external_browser_egress",
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=()=>{throw new Error("Education fresh-journey UI handoff or proof blocked");};
const strict=(o,keys)=>o && typeof o==="object" && !Array.isArray(o) &&
  JSON.stringify(Object.keys(o).sort())===JSON.stringify([...keys].sort());
const provenance=(env)=>({
  sha:env?.GITHUB_SHA,
  runId:String(env?.GITHUB_RUN_ID??""),
  attempt:String(env?.GITHUB_RUN_ATTEMPT??""),
});
function validProvenance(p){
  if(!strict(p,["sha","runId","attempt"]) ||
    !/^[a-f0-9]{40}$/.test(p.sha) ||
    !/^[1-9][0-9]*$/.test(p.runId) ||
    !/^[1-9][0-9]*$/.test(p.attempt))fail();
  return true;
}
function approvedMarks(env){
  const fields=["ETERNYX_EDU_FINALIZE_EXPECTED_SCORE","ETERNYX_EDU_FINALIZE_EXPECTED_MAX",
    "ETERNYX_EDU_RESULT_A_SCORE","ETERNYX_EDU_RESULT_A_MAX"];
  if(fields.some(k=>typeof env?.[k]!=="string" ||
    !/^(0|[1-9][0-9]{0,5})$/.test(env[k])))fail();
  const [score,max,resultScore,resultMax]=fields.map(k=>Number(env[k]));
  if(max<1 || max>100000 || score>max || score!==resultScore || max!==resultMax)fail();
  return {score,max};
}
export function makeFreshJourneyTarget(env,handoff){
  checkJourneyApproval(env);
  verifyJourneyHandoff(env,handoff);
  const p=provenance(env);validProvenance(p);
  const marks=approvedMarks(env);
  return Object.freeze({
    schema:1,source_sha:p.sha,github_run_id:p.runId,
    github_run_attempt:p.attempt,
    fresh_attempt_id:handoff.attemptId,
    expected_score:marks.score,expected_max:marks.max,
  });
}
export function assertFreshJourneyTarget(target,env){
  if(!strict(target,["schema","source_sha","github_run_id",
      "github_run_attempt","fresh_attempt_id","expected_score","expected_max"]) ||
    target.schema!==1 || !uuid.test(target.fresh_attempt_id) ||
    target.source_sha!==env?.GITHUB_SHA ||
    target.github_run_id!==String(env?.GITHUB_RUN_ID) ||
    target.github_run_attempt!==String(env?.GITHUB_RUN_ATTEMPT) ||
    env?.ETERNYX_EDU_RELEASE_MODE!=="journey" ||
    env?.GITHUB_REF!=="refs/heads/main" ||
    env?.GITHUB_REPOSITORY!=="sunnybai72592/eternyx-haunted-hollow" ||
    env?.ETERNYX_EDU_JOURNEY_APPROVAL!=="I_APPROVE_SINGLE_STAGING_EXAM_FULL_JOURNEY")fail();
  const m=approvedMarks(env);
  if(target.expected_score!==m.score || target.expected_max!==m.max ||
    [
      env.ETERNYX_EDU_REVIEW_ATTEMPT_ID,env.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT,
      env.ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT,env.ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT,
      env.ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT,env.ETERNYX_EDU_STAGING_ATTEMPT_ID,
    ].includes(target.fresh_attempt_id))fail();
  return true;
}
export function saveFreshJourneyTarget(env,handoff){
  const target=makeFreshJourneyTarget(env,handoff);
  assertFreshJourneyTarget(target,env);
  mkdirSync("test-results",{recursive:true});
  writeFileSync(PRIVATE_FRESH_JOURNEY_TARGET,JSON.stringify(target)+"\n",
    {mode:0o600,flag:"wx"});
  return true;
}
export function assertFreshJourneyBrowserEvidence(r,p){
  validProvenance(p);
  const names=["schema","suite","environment","source_sha","github_run_id",
    "github_run_attempt","result","read_only","fresh_attempt_verified",
    "production_tested","production_release_approved","checks"];
  if(!strict(r,names) || r.schema!==1 ||
    r.suite!=="education-hosted-fresh-journey-browser" ||
    r.environment!=="isolated-supabase-staging" ||
    r.source_sha!==p.sha || r.github_run_id!==p.runId ||
    r.github_run_attempt!==p.attempt || r.result!=="passed" ||
    r.read_only!==true || r.fresh_attempt_verified!==true ||
    r.production_tested!==false || r.production_release_approved!==false ||
    !Array.isArray(r.checks) ||
    r.checks.length!==FRESH_JOURNEY_BROWSER_CASES.length ||
    r.checks.some((c,i)=>!strict(c,["check","result"]) ||
      c.check!==FRESH_JOURNEY_BROWSER_CASES[i] || c.result!=="passed"))fail();
  return true;
}
export function assertFreshJourneyCombinedGate(browser,backend,p){
  assertFreshJourneyBrowserEvidence(browser,p);
  const stages=EDUCATION_RELEASE_STAGES.journey;
  const bfields=["schema","suite","environment","mode","source_sha",
    "github_run_id","github_run_attempt","outcome",
    "single_new_attempt_lifecycle_verified","verified_stages",
    "database_metadata_gate","journey_fixture_gate",
    "production_tested","production_certified","production_release_approved"];
  if(!strict(backend,bfields) ||
    backend.schema!==1 || backend.suite!=="education-hosted-release-readiness" ||
    backend.environment!=="isolated-supabase-staging" || backend.mode!=="journey" ||
    backend.source_sha!==p.sha || backend.github_run_id!==p.runId ||
    backend.github_run_attempt!==p.attempt ||
    backend.outcome!=="staging_single_attempt_journey_passed" ||
    backend.single_new_attempt_lifecycle_verified!==true ||
    backend.production_tested!==false || backend.production_certified!==false ||
    backend.production_release_approved!==false ||
    !strict(backend.database_metadata_gate,["status","checks"]) ||
    backend.database_metadata_gate.status!=="passed" ||
    backend.database_metadata_gate.checks!==DATABASE_CHECKS.length ||
    !strict(backend.journey_fixture_gate,["status","checks"]) ||
    backend.journey_fixture_gate.status!=="passed" ||
    backend.journey_fixture_gate.checks!==FIXTURE_CHECKS.length ||
    !Array.isArray(backend.verified_stages) ||
    backend.verified_stages.length!==stages.length ||
    backend.verified_stages.some((s,i)=>!strict(s,["stage","passed_cases","status"]) ||
      s.stage!==stages[i].id || s.passed_cases!==stages[i].cases.length ||
      s.status!=="passed"))fail();
  return Object.freeze({
    schema:1,suite:"education-hosted-fresh-journey-ui-backend",
    environment:"isolated-supabase-staging",
    source_sha:p.sha,github_run_id:p.runId,github_run_attempt:p.attempt,
    outcome:"same_fresh_attempt_browser_and_backend_verified",
    browser_checks:FRESH_JOURNEY_BROWSER_CASES.length,
    backend_stages:stages.length,
    same_fresh_attempt_verified:true,
    irreversible_staging_backend_writes_tested:true,
    browser_read_only:true,
    production_tested:false,production_certified:false,
    production_release_approved:false,
  });
}
export function writeFreshJourneyCombinedGate(env=process.env){
  rmSync(FRESH_JOURNEY_COMBINED_EVIDENCE,{force:true});
  try{
    if(env.GITHUB_REF!=="refs/heads/main" ||
      env.GITHUB_REPOSITORY!=="sunnybai72592/eternyx-haunted-hollow" ||
      env.ETERNYX_EDU_RELEASE_MODE!=="journey" ||
      env.ETERNYX_EDU_JOURNEY_APPROVAL!=="I_APPROVE_SINGLE_STAGING_EXAM_FULL_JOURNEY")
      fail();
    const read=path=>JSON.parse(readFileSync(path,"utf8"));
    const verdict=assertFreshJourneyCombinedGate(
      read(FRESH_JOURNEY_BROWSER_EVIDENCE),
      read("test-results/education-hosted-release-readiness.json"),provenance(env));
    writeFileSync(FRESH_JOURNEY_COMBINED_EVIDENCE,JSON.stringify(verdict,null,2)+"\n",
      {mode:0o600});
    process.stdout.write("PASS: same fresh staging attempt completed backend and visible owner-only browser review; production NO-GO.\n");
    return verdict;
  }catch{
    rmSync(FRESH_JOURNEY_COMBINED_EVIDENCE,{force:true});
    process.stderr.write("BLOCKED: fresh journey browser or backend evidence incomplete.\n");
    process.exitCode=1;
    return null;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  writeFreshJourneyCombinedGate();
