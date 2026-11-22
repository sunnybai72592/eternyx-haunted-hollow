import { readFileSync } from "node:fs";
import { EDUCATION_READ_CASES } from "./educationHostedReadOnlyConfig.mjs";

try {
  const data = JSON.parse(readFileSync("test-results/education-hosted-readonly.json", "utf8"));
  const allowed = [
    "schema","suite","environment","configured","distinct_authenticated_students",
    "expected_cases","attempted_cases","passed_cases","results",
    "staged_sql_deployed_by_test","writes_performed","production_tested",
    "production_certified","sessions_signed_out",
  ];
  if (!data || Object.keys(data).sort().join() !== allowed.sort().join() ||
      data.schema !== 1 || data.suite !== "education-hosted-readonly" ||
      data.environment !== "isolated-supabase-staging" ||
      data.configured !== true || data.distinct_authenticated_students !== true ||
      data.expected_cases !== EDUCATION_READ_CASES.length ||
      data.attempted_cases !== EDUCATION_READ_CASES.length ||
      data.passed_cases !== EDUCATION_READ_CASES.length ||
      data.staged_sql_deployed_by_test !== false ||
      data.writes_performed !== false ||
      data.production_tested !== false ||
      data.production_certified !== false ||
      data.sessions_signed_out !== true ||
      !Array.isArray(data.results) ||
      data.results.length !== EDUCATION_READ_CASES.length ||
      data.results.some((r,i) =>
        !r || Object.keys(r).sort().join() !== "case,result" ||
        r.case !== EDUCATION_READ_CASES[i] || r.result !== "passed")) {
    throw new Error("Incomplete or unsafe staging evidence");
  }
  process.stdout.write("PASS sanitized Education staging evidence (not production certification)\n");
} catch {
  process.stderr.write("FAIL sanitized Education staging evidence missing, incomplete, or failed\n");
  process.exitCode = 1;
}
