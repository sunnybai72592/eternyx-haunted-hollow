/**
 * Single-run READ-ONLY Education staging release proof.
 * Only accepts independently regenerated real browser, student-RLS API, and
 * final-ledger API verdicts from the same protected manual workflow execution.
 *
 * This is an offline evidence validator, not a production release authorization.
 * Hosted backend report writers intentionally do not include run identifiers;
 * the workflow must purge all three prior artifacts before executing them.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EDUCATION_READ_CASES } from "./educationHostedReadOnlyConfig.mjs";
import { RESULTS_CASES } from "./educationHostedResultsConfig.mjs";

export const EDUCATION_UI_API_GATE_PATH =
  "test-results/education-hosted-ui-api-readiness.json";
export const EDUCATION_UI_API_BROWSER_PATH =
  "test-results/education-hosted-browser-readonly.json";
export const EDUCATION_UI_API_OWNER_PATH =
  "test-results/education-hosted-readonly.json";
export const EDUCATION_UI_API_RESULTS_PATH =
  "test-results/education-hosted-final-results.json";

export const EDUCATION_UI_API_ROLE_CASES = Object.freeze([
  "student_a_authenticated_history",
  "student_a_verified_final",
  "student_a_pending_no_score",
  "student_a_running_no_score",
  "student_a_legacy_no_score",
  "student_a_denied_b_result",
  "student_b_authenticated_history",
  "student_b_owned_final",
  "student_b_denied_a_result",
  "instructor_verified_private_workspace",
]);
export const EDUCATION_UI_API_BROWSER_CASES = Object.freeze([
  ...["desktop", "mobile"].flatMap(view =>
    EDUCATION_UI_API_ROLE_CASES.map(c => view + "_" + c)),
  "no_unapproved_remote_writes", "no_unapproved_network_egress",
]);

const keysEqual=(value,keys)=>value && typeof value==="object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const fail=()=>{ throw new Error("Education same-run UI and Auth acceptance blocked"); };

const BROWSER_FIELDS=Object.freeze([
  "schema","suite","source_sha","github_run_id","github_run_attempt",
  "environment","read_only","production_tested",
  "production_release_approved","result","checks",
]);
const API_FIELDS=Object.freeze([
  "schema","suite","environment","configured",
  "distinct_authenticated_students","expected_cases",
  "attempted_cases","passed_cases","results","staged_sql_deployed_by_test",
  "writes_performed","production_tested","production_certified",
  "sessions_signed_out",
]);

export function assertEducationUiApiBrowserReport(report,provenance){
  if(!keysEqual(report,BROWSER_FIELDS) ||
    report.schema!==1 || report.suite!=="education-real-staging-browser-readonly" ||
    report.environment!=="isolated-supabase-staging" ||
    report.source_sha!==provenance.sha ||
    report.github_run_id!==provenance.runId ||
    report.github_run_attempt!==provenance.attempt ||
    report.read_only!==true || report.production_tested!==false ||
    report.production_release_approved!==false ||
    report.result!=="passed" ||
    !Array.isArray(report.checks) ||
    report.checks.length!==EDUCATION_UI_API_BROWSER_CASES.length ||
    report.checks.some((c,i)=>!keysEqual(c,["check","result"]) ||
      c.check!==EDUCATION_UI_API_BROWSER_CASES[i] || c.result!=="passed"))fail();
  return true;
}

function assertEducationReadOnlyApiReport(report,suite,cases){
  if(!keysEqual(report,API_FIELDS) ||
    report.schema!==1 || report.suite!==suite ||
    report.environment!=="isolated-supabase-staging" ||
    report.configured!==true ||
    report.distinct_authenticated_students!==true ||
    report.expected_cases!==cases.length ||
    report.attempted_cases!==cases.length ||
    report.passed_cases!==cases.length ||
    report.staged_sql_deployed_by_test!==false ||
    report.writes_performed!==false ||
    report.production_tested!==false ||
    report.production_certified!==false ||
    report.sessions_signed_out!==true ||
    !Array.isArray(report.results) ||
    report.results.length!==cases.length ||
    report.results.some((r,i)=>!keysEqual(r,["case","result"]) ||
      r.case!==cases[i] || r.result!=="passed"))fail();
  return true;
}

export function assertEducationUiApiGate(browser,owner,finalResults,provenance){
  const p=provenance;
  if(!p || !keysEqual(p,["sha","runId","attempt"]) ||
    !/^[0-9a-f]{40}$/.test(p.sha) ||
    !/^[1-9][0-9]*$/.test(p.runId) ||
    !/^[1-9][0-9]*$/.test(p.attempt))fail();

  assertEducationUiApiBrowserReport(browser,p);
  assertEducationReadOnlyApiReport(owner,
    "education-hosted-readonly",EDUCATION_READ_CASES);
  assertEducationReadOnlyApiReport(finalResults,
    "education-hosted-final-results",RESULTS_CASES);

  return Object.freeze({
    schema:1,
    suite:"education-hosted-ui-api-readiness",
    environment:"isolated-supabase-staging",
    source_sha:p.sha,github_run_id:p.runId,github_run_attempt:p.attempt,
    outcome:"read_only_browser_and_auth_api_passed",
    evidence:Object.freeze([
      Object.freeze({suite:browser.suite,checks:browser.checks.length,verified:true}),
      Object.freeze({suite:owner.suite,checks:owner.results.length,verified:true}),
      Object.freeze({suite:finalResults.suite,checks:finalResults.results.length,verified:true}),
    ]),
    same_workflow_run:true,
    real_staging_read_only:true,
    staged_sql_deployed_by_test:false,
    irreversible_writes_tested:false,
    production_tested:false,
    production_certified:false,
    production_release_approved:false,
  });
}

export function writeEducationUiApiGate(env=process.env){
  rmSync(EDUCATION_UI_API_GATE_PATH,{force:true});
  try{
    if(env.GITHUB_REF!=="refs/heads/main" ||
      env.GITHUB_REPOSITORY!=="sunnybai72592/eternyx-haunted-hollow" ||
      env.ETERNYX_EDU_UI_API_READ_APPROVAL!==
        "I_APPROVE_EDUCATION_SAME_RUN_STAGING_READ_ONLY")fail();
    const provenance={
      sha:env.GITHUB_SHA,runId:String(env.GITHUB_RUN_ID||""),
      attempt:String(env.GITHUB_RUN_ATTEMPT||""),
    };
    const load=file=>JSON.parse(readFileSync(file,"utf8"));
    const verdict=assertEducationUiApiGate(
      load(EDUCATION_UI_API_BROWSER_PATH),
      load(EDUCATION_UI_API_OWNER_PATH),
      load(EDUCATION_UI_API_RESULTS_PATH),provenance);
    mkdirSync("test-results",{recursive:true});
    writeFileSync(EDUCATION_UI_API_GATE_PATH,
      JSON.stringify(verdict,null,2)+"\n",{mode:0o600});
    process.stdout.write(
      "PASS: same-run Education browser + student RLS + final ledger API, staging only; production NOT approved.\n");
    return verdict;
  }catch{
    rmSync(EDUCATION_UI_API_GATE_PATH,{force:true});
    process.stderr.write("BLOCKED: Education real staging UI and Auth evidence incomplete.\n");
    process.exitCode=1;
    return null;
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  writeEducationUiApiGate();
