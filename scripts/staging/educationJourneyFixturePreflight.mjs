/**
 * One-time Education staging journey: read-only fixture viability forecast.
 * No SQL mutations, no raw identities/answer keys/marks in output evidence.
 * Runs only after separate manual full-journey approval and before ANY writes.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,rmSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {checkJourneyApproval} from "./educationJourneyHandoff.mjs";
import {validateEducationDbConfig} from "./educationHostedDbMetadata.mjs";
import {validateEducationHostedCbtConfig} from "./educationHostedCbtWriteConfig.mjs";
import {validateEducationHostedReviewConfig} from "./educationHostedReviewConfig.mjs";
import {validateEducationTrustedFinalizerConfig} from "./educationTrustedFinalizerConfig.mjs";

export const FIXTURE_CHECKS=Object.freeze([
  "published_approved_exam","exam_not_password_locked","exam_has_safe_test_window",
  "reviewer_is_owned_verified_teacher","reviewer_has_one_unambiguous_grant",
  "instructor_queue_has_spare_capacity",
  "exactly_two_exam_questions","exactly_one_mcq_question",
  "exactly_one_written_question","all_question_points_valid",
  "mcq_has_one_correct_option","mcq_choices_have_valid_labels",
  "selected_mcq_option_belongs_to_question","expected_max_matches_questions",
  "awarded_written_points_valid","expected_grade_matches_fixed_choice_and_review",
  "student_a_is_enrolled","student_b_is_not_enrolled",
  "student_a_has_no_attempt","student_b_has_no_attempt",
  "three_dedicated_auth_identities_exist",
]);
export const FIXTURE_EVIDENCE="test-results/education-journey-fixture-readiness.json";
const fail=()=>{throw new Error("Education one-time staging fixture not ready");};
function runContext(env){
  const sha=env?.GITHUB_SHA,run=String(env?.GITHUB_RUN_ID||""),
    attempt=String(env?.GITHUB_RUN_ATTEMPT||"");
  if(!/^[0-9a-f]{40}$/.test(sha||"")||
     !/^[1-9][0-9]*$/.test(run)||!/^[1-9][0-9]*$/.test(attempt))fail();
  return {sha,run,attempt};
}
export function snapshotJourneyFixture(raw,env){
  checkJourneyApproval(env);
  const p=runContext(env);
  if(!raw || raw.schema!==1 || !raw.checks ||
    typeof raw.checks!=="object" || Array.isArray(raw.checks) ||
    JSON.stringify(Object.keys(raw).sort())!=='["checks","schema"]' ||
    JSON.stringify(Object.keys(raw.checks).sort())!==JSON.stringify([...FIXTURE_CHECKS].sort()) ||
    FIXTURE_CHECKS.some(k=>raw.checks[k]!==true))fail();
  return Object.freeze({
    schema:1,suite:"education-staging-journey-fixture",
    environment:"isolated-supabase-staging",
    source_sha:p.sha,github_run_id:p.run,github_run_attempt:p.attempt,
    read_only:true,expected_checks:FIXTURE_CHECKS.length,
    passed_checks:FIXTURE_CHECKS.length,
    results:FIXTURE_CHECKS.map(check=>({check,result:"passed"})),
    production_tested:false,production_certified:false,
  });
}
export function assertJourneyFixtureEvidence(report,env){
  const p=runContext(env);
  const keys=["schema","suite","environment","source_sha","github_run_id",
    "github_run_attempt","read_only","expected_checks","passed_checks",
    "results","production_tested","production_certified"];
  if(!report||typeof report!=="object"||Array.isArray(report)||
    JSON.stringify(Object.keys(report).sort())!==JSON.stringify(keys.sort())||
    report.schema!==1 || report.suite!=="education-staging-journey-fixture"||
    report.environment!=="isolated-supabase-staging"||
    report.source_sha!==p.sha||report.github_run_id!==p.run||
    report.github_run_attempt!==p.attempt||report.read_only!==true||
    report.expected_checks!==FIXTURE_CHECKS.length||
    report.passed_checks!==FIXTURE_CHECKS.length||
    report.production_tested!==false||report.production_certified!==false||
    !Array.isArray(report.results)||report.results.length!==FIXTURE_CHECKS.length||
    report.results.some((r,i)=>!r||
      JSON.stringify(Object.keys(r).sort())!=='["check","result"]'||
      r.check!==FIXTURE_CHECKS[i]||r.result!=="passed"))fail();
  return true;
}
export function validateJourneyFixturePreflightConfig(env){
  checkJourneyApproval(env);
  const db=validateEducationDbConfig(env);
  const cbt=validateEducationHostedCbtConfig(env);
  const review=validateEducationHostedReviewConfig(env);
  const grade=validateEducationTrustedFinalizerConfig({
    ...env,ETERNYX_EDU_FINALIZE_MODE:"verify",
    ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"",
  });
  if(cbt.mode!=="write"||review.mode!=="review"||
     review.projectRef!==db.host.slice(3,23)||
     grade.expectedMarks.score<review.awarded)fail();
  runContext(env);
  return Object.freeze({
    host:db.host,password:db.password,exam:cbt.fixture,
    accounts:cbt.accounts,instructor:review.instructorAccount,
    awarded:review.awarded,marks:grade.expectedMarks,
  });
}
export function runJourneyFixturePreflight(env=process.env){
  rmSync(FIXTURE_EVIDENCE,{force:true});
  try{
    const c=validateJourneyFixturePreflightConfig(env);
    const variables=[
      ["test_id",c.exam.testId],["mcq_id",c.exam.mcqId],
      ["mcq_option_id",c.exam.mcqOptionId],["essay_id",c.exam.essayId],
      ["student_a_email",c.accounts[0].email],
      ["student_b_email",c.accounts[1].email],
      ["instructor_email",c.instructor.email],
      ["awarded",String(c.awarded)],["expected_score",String(c.marks.score)],
      ["expected_max",String(c.marks.max)],
    ];
    const args=["-X","-q","-A","-t","-w","-v","ON_ERROR_STOP=1",
      ...variables.flatMap(([k,v])=>["-v",k+"="+v]),
      "-h",c.host,"-p","5432","-U","postgres","-d","postgres",
      "-f","scripts/sql/education-hosted-journey-fixture.sql"];
    const done=spawnSync("psql",args,{
      env:{...env,PGHOST:c.host,PGPORT:"5432",PGUSER:"postgres",
        PGPASSWORD:c.password,PGDATABASE:"postgres",
        PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",
        PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=20000"},
      encoding:"utf8",timeout:45000,maxBuffer:256*1024,
    });
    if(done.error||done.status!==0)fail();
    const rows=done.stdout.trim().split(/\r?\n/).filter(Boolean);
    if(rows.length!==1)fail();
    const evidence=snapshotJourneyFixture(JSON.parse(rows[0]),env);
    mkdirSync("test-results",{recursive:true});
    writeFileSync(FIXTURE_EVIDENCE,JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
    process.stdout.write("PASS: "+evidence.passed_checks+
      " independent single-use staging fixture checks; no student writes.\n");
  }catch{
    rmSync(FIXTURE_EVIDENCE,{force:true});
    process.stderr.write("BLOCKED: journey fixture not ready. No Education write authorized.\n");
    process.exitCode=1;
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  runJourneyFixturePreflight();
