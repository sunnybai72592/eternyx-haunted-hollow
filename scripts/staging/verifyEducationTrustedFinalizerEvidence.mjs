/**
 * Separate mode-specific, no-network verifier of hosted grade evidence.
 * Evidence is only staging proof and contains NO marks or private identifiers.
 */
import {readFileSync} from "node:fs";
import {TRUSTED_FINALIZER_CASES} from "./educationTrustedFinalizerConfig.mjs";

try{
 const e=JSON.parse(readFileSync("test-results/education-trusted-finalization.json","utf8"));
 const fields=[
  "schema","suite","environment","mode","configured",
  "three_distinct_authenticated_accounts","expected_cases",
  "attempted_cases","passed_cases","results",
  "privileged_rpc_attempted","privileged_rpc_confirmed",
  "schema_deployed_by_test","fixture_cleanup_performed",
  "production_tested","production_certified","sessions_signed_out",
 ].sort();
 if(!e||JSON.stringify(Object.keys(e).sort())!==JSON.stringify(fields))
  throw new Error("Unexpected evidence schema");
 const expected=TRUSTED_FINALIZER_CASES[e.mode];
 if(!expected||
  e.schema!==1||e.suite!=="education-hosted-trusted-finalization"||
  e.environment!=="isolated-supabase-staging"||
  e.configured!==true||e.three_distinct_authenticated_accounts!==true||
  e.expected_cases!==expected.length||e.attempted_cases!==expected.length||
  e.passed_cases!==expected.length||
  e.privileged_rpc_attempted!==(e.mode==="finalize")||
  e.privileged_rpc_confirmed!==(e.mode==="finalize")||
  e.schema_deployed_by_test!==false||
  e.fixture_cleanup_performed!==false||
  e.production_tested!==false||e.production_certified!==false||
  e.sessions_signed_out!==true||!Array.isArray(e.results)||
  e.results.length!==expected.length||
  e.results.some((c,i)=>!c||
   JSON.stringify(Object.keys(c).sort())!=='["case","result"]'||
   c.case!==expected[i]||c.result!=="passed"))
  throw new Error("Unverified, incomplete or incorrect final-grade evidence");
 process.stdout.write("PASS sanitized Education "+e.mode+" staging evidence, NOT production certification\n");
}catch{
 process.stderr.write("FAIL rejected unsafe or incomplete synthetic Education finalization evidence\n");
 process.exitCode=1;
}
