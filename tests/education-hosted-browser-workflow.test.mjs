import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const workflow=readFileSync(new URL("../.github/workflows/education-hosted-browser-readonly.yml",import.meta.url),"utf8");
const script=readFileSync(new URL("./browser/education_hosted_readonly.py",import.meta.url),"utf8");
function step(label){
 const start=workflow.indexOf("      - name: "+label);
 assert.ok(start>0,label);
 const end=workflow.indexOf("\n      - ",start+8);
 return workflow.slice(start,end<0?undefined:end);
}
test("real staging browser requires protected, explicit, main-only manual execution",()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/approve_read_only_browser:/);
 assert.match(workflow,/default: false/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/github\.repository == 'sunnybai72592\/eternyx-haunted-hollow'/);
 assert.match(workflow,/environment: rls-staging/);
 assert.match(workflow,/group: eternyx-education-hosted-shared-staging/);
 assert.match(workflow,/permissions:\s+contents: read/);
 assert.doesNotMatch(workflow,/\b(?:push|pull_request|schedule):/);
});
test("npm install, local server and browser dependency install never get credentials",()=>{
 for(const name of [
  "Install pinned frontend dependencies without staging credentials",
  "Prepare browser executable without real account credentials",
  "Start local staging-targeted preview with no account credentials"
 ])assert.doesNotMatch(step(name),/\$\{\{\s*secrets\./,name);
 const preflight=step("Validate isolated staging credentials, role and final-result fixture offline");
 assert.match(preflight,/validateEducationResultsReadConfig/);
 assert.match(preflight,/ETERNYX_RLS_TEST_A_PASSWORD: \$\{\{ secrets\.ETERNYX_RLS_TEST_A_PASSWORD \}\}/);
 const build=step("Build frontend against staging only with protected RPC flags");
 assert.match(build,/VITE_SUPABASE_URL: \$\{\{ secrets\.ETERNYX_RLS_STAGING_URL \}\}/);
 assert.match(build,/VITE_SUPABASE_PUBLISHABLE_KEY/);
 assert.doesNotMatch(build,/TEST_A_PASSWORD|TEST_B_PASSWORD|INSTRUCTOR_PASSWORD|SERVICE_ROLE_KEY/);
 const browser=step("Authenticate three real staging roles in desktop and mobile, blocking all writes");
 assert.match(browser,/ETERNYX_RLS_INSTRUCTOR_PASSWORD: \$\{\{ secrets\.ETERNYX_RLS_INSTRUCTOR_PASSWORD \}\}/);
 assert.doesNotMatch(browser,/SERVICE_ROLE_KEY|STAGING_DB_PASSWORD/);
});
test("browser build enables all five coordinated protected backend features",()=>{
 const build=step("Build frontend against staging only with protected RPC flags");
 for(const key of [
  "VITE_CBT_ATOMIC_RPC","VITE_EDUCATION_INSTRUCTOR_RPC",
  "VITE_EDUCATION_PUBLICATION_RPC","VITE_EDUCATION_WRITTEN_REVIEW_RPC",
  "VITE_EDUCATION_VERIFIED_RESULTS_RPC"
 ]) assert.ok(build.includes(key+': "true"'),key);
 assert.ok(workflow.indexOf("Validate isolated staging credentials") <
  workflow.indexOf("Build frontend against staging"));
 assert.ok(workflow.indexOf("Build frontend against staging") <
  workflow.indexOf("Authenticate three real staging roles"));
});
test("real staging Chromium checks all owned statuses and both denied ownership directions",()=>{
 for(const label of ["desktop","mobile"]){
  for(const name of [
   "student_a_authenticated_history","student_a_verified_final",
   "student_a_pending_no_score","student_a_running_no_score",
   "student_a_legacy_no_score","student_a_denied_b_result",
   "student_b_authenticated_history","student_b_owned_final",
   "student_b_denied_a_result","instructor_verified_private_workspace"
  ])assert.ok(script.includes(label+"_"+name),label+"_"+name);
 }
 assert.match(script,/1440.*900/);
 assert.match(script,/390.*844/);
 assert.match(script,/page\.get_by_role\("heading", name="My assessments"/);
 assert.match(script,/get_by_text\("Verified final grade"/);
 assert.match(script,/get_by_text\("Approved instructor access verified/);
 assert.match(script,/get_by_text\(f"\{score\} \/ \{max_score\}", exact=True\)/);
 assert.match(script,/page\.get_by_role\("progressbar"\)\.count\(\) == 0/);
 for(const expected of [
  "ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT",
  "ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT",
  "ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT",
  "ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT",
  "ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT",
  "ETERNYX_EDU_RESULT_A_SCORE","ETERNYX_EDU_RESULT_A_MAX",
  "ETERNYX_EDU_RESULT_B_SCORE","ETERNYX_EDU_RESULT_B_MAX",
 ])assert.ok(script.includes(expected),expected);
 assert.match(script,/browser\.new_context/);
 assert.match(script,/context\.close\(\)/);
});

test("browser prevents third-party read exfiltration and refuses all unapproved writes",()=>{
 assert.match(script,/local = url\.scheme == "http" and host == "127\.0\.0\.1" and port == 4173/);
 assert.match(script,/staging = \(url\.scheme == "https"/);
 assert.match(script,/if not \(local or staging\):/);
 assert.match(script,/unapproved_network_egress/);
 assert.match(script,/if method not in \("GET", "HEAD", "OPTIONS"\):/);
 assert.match(script,/path == "\/auth\/v1\/token"/);
 assert.match(script,/path\.startswith\("\/rest\/v1\/rpc\/"\)/);
 assert.match(script,/"is_admin",/);
 assert.match(script,/visitor_presence/);
 assert.match(script,/if not public_auth:/);
 assert.match(script,/initiator\.hostname == "127\.0\.0\.1"/);
 assert.match(script,/initiator\.port == 4173 and initiator\.path == "\/auth"/);
 assert.match(script,/route\.abort\(\)/);
 assert.match(script,/unexpected_remote_write/);
 assert.doesNotMatch(script,/start_cbt_attempt|save_cbt_answer|submit_cbt_attempt|education_finalize_cbt_grade|\.screenshot\(/);
 assert.doesNotMatch(workflow,/VITE_SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_DB_PASSWORD/);
 assert.match(script,/env\.get\("GITHUB_REF"\) == "refs\/heads\/main"/);
 assert.match(script,/env\.get\("GITHUB_REPOSITORY"\) == "sunnybai72592\/eternyx-haunted-hollow"/);
});
test("actual browser guard has executable offline negative fixtures and zero secrets",()=>{
 const guardFile=readFileSync(new URL("./education_hosted_browser_guard_unit.py",import.meta.url),"utf8");
 for(const marker of ["test_only_exact_local_preview_or_tls_staging_may_be_read",
   "test_allow_only_auth_and_readonly_rpc_posts_to_staging",
   "test_public_signin_analytics_is_blocked_without_masking_private_tracking",
   "test_complete_named_browser_acceptance_contract"
 ])assert.ok(guardFile.includes(marker),marker);
 const preflight=step("Prove staging browser host/method deny rules with synthetic requests");
 assert.match(preflight,/python3 tests\/education_hosted_browser_guard_unit\.py/);
 assert.doesNotMatch(preflight,/\$\{\{\s*secrets\./);
 const python=spawnSync("python3",
  ["tests/education_hosted_browser_guard_unit.py"],
  {encoding:"utf8",timeout:15000});
 if(python.error?.code!=="ENOENT")
  assert.equal(python.status,0,"Actual hosted browser guard negative cases must pass without Playwright");
});

test("evidence is source-run bound, sanitized, and never claims production acceptance",()=>{
 assert.match(script,/github_run_id/);
 assert.match(script,/github_run_attempt/);
 assert.match(script,/production_release_approved": False/);
 assert.match(script,/production_tested": False/);
 assert.match(script,/read_only": True/);
 assert.match(script,/no_unapproved_remote_writes/);
 assert.match(script,/no_unapproved_network_egress/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/test-results\/education-hosted-browser-readonly\.json/);
 assert.doesNotMatch(workflow,/screenshots|traces|video\.webm|dist\//);
});

test("new hosted browser Python runner compiles without using staging credentials",()=>{
 const file=fileURLToPath(new URL("./browser/education_hosted_readonly.py",import.meta.url));
 const result=spawnSync("python3",["-m","py_compile",file],{encoding:"utf8",timeout:15000});
 if(result.error?.code==="ENOENT")return; // Windows contributors may lack Python
 assert.equal(result.status,0,"Education browser runner Python source must compile");
});
