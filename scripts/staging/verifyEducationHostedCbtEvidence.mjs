/**
 * Independent, offline validator for sanitized hosted CBT rehearsal evidence.
 * This can never turn a preflight into proof that write-path checks passed.
 */
import { readFileSync } from "node:fs";
import { CBT_STAGING_CASES } from "./educationHostedCbtWriteConfig.mjs";

try{
  const evidence=JSON.parse(readFileSync("test-results/education-hosted-cbt-write.json","utf8"));
  const fields=[
    "schema","suite","environment","mode","configured",
    "distinct_authenticated_students","expected_cases","attempted_cases",
    "passed_cases","results","education_writes_attempted",
    "synthetic_attempt_confirmed","automatic_cleanup_performed",
    "hosted_sql_deployed_by_test","production_tested",
    "production_certified","sessions_signed_out",
  ].sort();
  if(!evidence || JSON.stringify(Object.keys(evidence).sort())!==JSON.stringify(fields))
    throw new Error("Unrecognized evidence fields");
  const expected=CBT_STAGING_CASES[evidence.mode];
  if(!expected ||
     evidence.schema!==1 ||
     evidence.suite!=="education-hosted-cbt-student-write" ||
     evidence.environment!=="isolated-supabase-staging" ||
     evidence.configured!==true ||
     evidence.distinct_authenticated_students!==true ||
     evidence.expected_cases!==expected.length ||
     evidence.attempted_cases!==expected.length ||
     evidence.passed_cases!==expected.length ||
     evidence.automatic_cleanup_performed!==false ||
     evidence.hosted_sql_deployed_by_test!==false ||
     evidence.production_tested!==false ||
     evidence.production_certified!==false ||
     evidence.sessions_signed_out!==true ||
     evidence.education_writes_attempted!==(evidence.mode==="write") ||
     evidence.synthetic_attempt_confirmed!==(evidence.mode==="write") ||
     !Array.isArray(evidence.results) ||
     evidence.results.length!==expected.length ||
     evidence.results.some((entry,i)=>
       !entry || JSON.stringify(Object.keys(entry).sort())!=='["case","result"]' ||
       entry.case!==expected[i] || entry.result!=="passed"))
     throw new Error("Unverified or incomplete synthetic CBT evidence");

  process.stdout.write("PASS fully sanitized "+evidence.mode+
    " Education hosted acceptance (not production certification)\n");
}catch{
  process.stderr.write("FAIL missing, incorrect, incomplete or unsafe Education staging CBT evidence\n");
  process.exitCode=1;
}
