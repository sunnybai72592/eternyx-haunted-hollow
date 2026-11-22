import {readFileSync} from "node:fs";
import {REVIEW_STAGE_CASES} from "./educationHostedReviewConfig.mjs";

try{
  const data=JSON.parse(readFileSync("test-results/education-hosted-instructor-final-grade.json","utf8"));
  const keys=[
    "schema","suite","environment","mode","configured",
    "three_distinct_authenticated_accounts","expected_cases",
    "attempted_cases","passed_cases","results",
    "instructor_review_write_attempted","instructor_review_write_confirmed",
    "trusted_finalizer_invoked","education_schema_deployed_by_test",
    "production_tested","production_certified","sessions_signed_out",
  ].sort();
  if(!data || JSON.stringify(Object.keys(data).sort())!==JSON.stringify(keys))
    throw new Error("Unknown or unapproved evidence fields");
  const expected=REVIEW_STAGE_CASES[data.mode];
  if(!expected||data.schema!==1||
    data.suite!=="education-hosted-instructor-final-grade" ||
    data.environment!=="isolated-supabase-staging"||
    data.configured!==true||
    data.three_distinct_authenticated_accounts!==true||
    data.expected_cases!==expected.length||
    data.attempted_cases!==expected.length||
    data.passed_cases!==expected.length||
    data.instructor_review_write_attempted!==(data.mode==="review")||
    data.instructor_review_write_confirmed!==(data.mode==="review")||
    data.trusted_finalizer_invoked!==false||
    data.education_schema_deployed_by_test!==false||
    data.production_tested!==false||data.production_certified!==false||
    data.sessions_signed_out!==true||!Array.isArray(data.results)||
    data.results.length!==expected.length||
    data.results.some((r,i)=>!r||
      JSON.stringify(Object.keys(r).sort())!=='["case","result"]'||
      r.case!==expected[i]||r.result!=="passed"))
      throw new Error("Incomplete or invalid hosted grading evidence");
  process.stdout.write("PASS verified "+data.mode+" staging-only result evidence\n");
}catch{
  process.stderr.write("FAIL missing, fabricated or unsafe Education instructor-grade evidence\n");
  process.exitCode=1;
}
