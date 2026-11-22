import { readFileSync } from "node:fs";
import { RESULTS_CASES } from "./educationHostedResultsConfig.mjs";

try {
  const evidence=JSON.parse(readFileSync("test-results/education-hosted-final-results.json","utf8"));
  const allowed=[
    "schema","suite","environment","configured","distinct_authenticated_students",
    "expected_cases","attempted_cases","passed_cases","results",
    "staged_sql_deployed_by_test","writes_performed","production_tested",
    "production_certified","sessions_signed_out",
  ].sort();
  if(!evidence || JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(allowed) ||
     evidence.schema !== 1 || evidence.suite !== "education-hosted-final-results" ||
     evidence.environment !== "isolated-supabase-staging" ||
     evidence.configured !== true || evidence.distinct_authenticated_students !== true ||
     evidence.expected_cases !== RESULTS_CASES.length ||
     evidence.attempted_cases !== RESULTS_CASES.length ||
     evidence.passed_cases !== RESULTS_CASES.length ||
     evidence.staged_sql_deployed_by_test !== false ||
     evidence.writes_performed !== false ||
     evidence.production_tested !== false ||
     evidence.production_certified !== false ||
     evidence.sessions_signed_out !== true ||
     !Array.isArray(evidence.results) ||
     evidence.results.length !== RESULTS_CASES.length ||
     evidence.results.some((r,i)=>
       !r || JSON.stringify(Object.keys(r).sort())!=='["case","result"]' ||
       r.case!==RESULTS_CASES[i] || r.result!=="passed")) {
    throw new Error("Not an exact successful staging result suite");
  }
  process.stdout.write("PASS 26-case sanitized hosted final results acceptance (not production)\n");
}catch{
  process.stderr.write("FAIL missing, incomplete or unsafe hosted final-result evidence\n");
  process.exitCode=1;
}
