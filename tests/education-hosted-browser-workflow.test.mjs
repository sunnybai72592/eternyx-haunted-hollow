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
test("read-only Playwright exercises verified student and instructor UI in two real viewports",()=>{
 for(const label of ["desktop","mobile"]){
  for(const name of [
   "student_a_authenticated_history","student_a_verified_final",
   "student_b_denied_a_result","instructor_verified_private_workspace"
  ])assert.ok(script.includes(label+"_"+name),label+"_"+name);
 }
 assert.match(script,/1440.*900/);
 assert.match(script,/390.*844/);
 assert.match(script,/page\.get_by_role\("heading", name="My assessments"/);
 assert.match(script,/get_by_text\("Verified final grade"/);
 assert.match(script,/get_by_text\("Approved instructor access verified/);
 assert.match(script,/browser\.new_context/);
 assert.match(script,/context\.close\(\)/);
});
test("browser aborts all unauthorized staging mutations including profile auto-create",()=>{
 assert.match(script,/if host\.endswith\("\.supabase\.co"\) and host != staging_host:/);
 assert.match(script,/if method not in \("GET", "HEAD", "OPTIONS"\):/);
 assert.match(script,/host == staging_host and/);
 assert.match(script,/path == "\/auth\/v1\/token"/);
 assert.match(script,/path\.startswith\("\/rest\/v1\/rpc\/"\)/);
 assert.match(script,/route\.abort\(\)/);
 assert.match(script,/unexpected_remote_write/);
 assert.doesNotMatch(script,/start_cbt_attempt|save_cbt_answer|submit_cbt_attempt|education_finalize_cbt_grade|\.screenshot\(/);
 assert.doesNotMatch(workflow,/VITE_SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_DB_PASSWORD/);
});
test("evidence is source-run bound, sanitized, and never claims production acceptance",()=>{
 assert.match(script,/github_run_id/);
 assert.match(script,/github_run_attempt/);
 assert.match(script,/production_release_approved": False/);
 assert.match(script,/production_tested": False/);
 assert.match(script,/read_only": True/);
 assert.match(script,/no_unapproved_remote_writes/);
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
