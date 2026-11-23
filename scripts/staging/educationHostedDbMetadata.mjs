/**
 * Actual hosted staging PostgreSQL release metadata check.
 * No mutation, database user rows, user identifiers or raw SQL outputs.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,rmSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {validateStagingRlsReadOnlyConfig} from "./stagingRlsConfig.mjs";

export const DATABASE_CHECKS=Object.freeze([
  "rls_tests",
  "rls_questions",
  "rls_options",
  "rls_user_attempts",
  "rls_user_answers",
  "rls_education_final_grades",
  "rls_education_written_reviews",
  "no_anon_answer_key",
  "no_student_answer_key",
  "no_student_attempt_score_update",
  "no_student_attempt_max_update",
  "no_student_attempt_status_update",
  "no_student_attempt_insert",
  "no_student_answer_grade_update",
  "no_student_answer_points_update",
  "no_student_answer_direct_update",
  "no_student_answer_grade_insert",
  "no_student_ledger_select",
  "no_anon_ledger_select",
  "atomic_start_rpc",
  "atomic_save_rpc",
  "atomic_submit_rpc",
  "trusted_final_grade_rpc",
  "no_student_attempt_score_insert",
  "no_student_attempt_max_insert",
  "no_student_attempt_time_update",
  "no_student_attempt_time_insert",
  "no_student_answer_correct_insert",
  "no_student_answer_text_insert",
  "no_student_answer_option_update",
  "finalized_review_lock_enabled"
]);
const APPROVAL="I_APPROVE_EDUCATION_STAGING_DB_METADATA_READ_ONLY";
const resultPath="test-results/education-hosted-db-metadata.json";

export function validateEducationDbConfig(env){
  if(!env || env.ETERNYX_EDU_DB_META_APPROVAL!==APPROVAL)
    throw new Error("Staging Education metadata check requires explicit approval");
  const c=validateStagingRlsReadOnlyConfig(env);
  const pwd=env.ETERNYX_EDU_STAGING_DB_PASSWORD;
  if(typeof pwd!=="string"||pwd.length<12||pwd.length>1024)
    throw new Error("Staging-only database credential required");
  return Object.freeze({host:"db."+c.projectRef+".supabase.co",password:pwd});
}
export function validateEducationDbSnapshot(raw,provenance){
  if(!raw||raw.schema!==1||!raw.checks||Array.isArray(raw.checks) ||
    JSON.stringify(Object.keys(raw.checks).sort())!==JSON.stringify([...DATABASE_CHECKS].sort()) ||
    DATABASE_CHECKS.some(k=>raw.checks[k]!==true) ||
    !provenance||!/^[0-9a-f]{40}$/.test(provenance.sha||"") ||
    !/^[1-9][0-9]*$/.test(String(provenance.runId||"")) ||
    !/^[1-9][0-9]*$/.test(String(provenance.attempt||"")))
      throw new Error("Hosted Education database authorization metadata did not pass");
  return Object.freeze({
    schema:1,suite:"education-hosted-db-metadata",
    environment:"isolated-supabase-staging",
    source_sha:provenance.sha,github_run_id:String(provenance.runId),
    github_run_attempt:String(provenance.attempt),
    expected_checks:DATABASE_CHECKS.length,passed_checks:DATABASE_CHECKS.length,
    results:DATABASE_CHECKS.map(check=>({check,result:"passed"})),
    read_only:true,production_tested:false,production_certified:false,
  });
}

/**
 * The combined readiness verdict must reject stale, missing and fabricated
 * audit attachments even if an upstream workflow step was marked successful.
 * This validates a fixed, sanitized shape; no raw catalog/private values.
 */
export function assertEducationDbEvidence(report, provenance){
  const fields=[
    "schema","suite","environment","source_sha","github_run_id",
    "github_run_attempt","expected_checks","passed_checks","results",
    "read_only","production_tested","production_certified",
  ];
  if(!report || typeof report!=="object" || Array.isArray(report) ||
    JSON.stringify(Object.keys(report).sort())!==JSON.stringify(fields.sort()) ||
    !provenance || !/^[0-9a-f]{40}$/.test(provenance.sha||"") ||
    !/^[1-9][0-9]*$/.test(String(provenance.runId||"")) ||
    !/^[1-9][0-9]*$/.test(String(provenance.attempt||"")) ||
    report.schema!==1 || report.suite!=="education-hosted-db-metadata" ||
    report.environment!=="isolated-supabase-staging" ||
    report.source_sha!==provenance.sha ||
    report.github_run_id!==String(provenance.runId) ||
    report.github_run_attempt!==String(provenance.attempt) ||
    report.expected_checks!==DATABASE_CHECKS.length ||
    report.passed_checks!==DATABASE_CHECKS.length ||
    report.read_only!==true || report.production_tested!==false ||
    report.production_certified!==false || !Array.isArray(report.results) ||
    report.results.length!==DATABASE_CHECKS.length ||
    report.results.some((row,i)=>!row ||
      JSON.stringify(Object.keys(row).sort())!=='["check","result"]' ||
      row.check!==DATABASE_CHECKS[i] || row.result!=="passed"))
    throw new Error("Missing, malformed or stale Education database audit evidence");
  return true;
}

export async function runEducationDbMetadataAudit(env=process.env){
  rmSync(resultPath,{force:true});
  try{
    const c=validateEducationDbConfig(env);
    const done=spawnSync("psql",[
      "-X","-q","-A","-t","-w","-v","ON_ERROR_STOP=1",
      "-h",c.host,"-p","5432","-U","postgres","-d","postgres",
      "-f","scripts/sql/education-hosted-db-metadata.sql",
    ],{
      env:{...env,PGHOST:c.host,PGPORT:"5432",PGUSER:"postgres",
        PGPASSWORD:c.password,PGDATABASE:"postgres",PGSSLMODE:"require",
        PGCONNECT_TIMEOUT:"10",PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=20000"},
      encoding:"utf8",timeout:45000,maxBuffer:256*1024,
    });
    if(done.error||done.status!==0)throw new Error("Audit could not complete");
    const rows=done.stdout.trim().split(/\r?\n/).filter(Boolean);
    if(rows.length!==1)throw new Error("Unexpected response format");
    const report=validateEducationDbSnapshot(JSON.parse(rows[0]),{
      sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,
    });
    mkdirSync("test-results",{recursive:true});
    writeFileSync(resultPath,JSON.stringify(report,null,2)+"\n",{mode:0o600});
    process.stdout.write("PASS isolated staging database security metadata: "+
      report.passed_checks+" checks. Production is not certified.\n");
  }catch{
    rmSync(resultPath,{force:true});
    process.stderr.write("BLOCKED: isolated staging Education DB metadata gate failed or is unconfigured.\n");
    process.exitCode=1;
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  await runEducationDbMetadataAudit();
