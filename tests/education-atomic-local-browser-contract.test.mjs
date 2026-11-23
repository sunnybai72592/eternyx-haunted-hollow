import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=readFileSync(new URL("./browser/education_atomic_local.py",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/education-atomic-browser-ci.yml",import.meta.url),"utf8");
const cases=[
 "atomic_attempt_starts_once",
 "real_choice_and_written_autosave",
 "reload_restores_owned_answers",
 "failed_latest_save_remains_retryable",
 "confirm_submit_uses_single_atomic_rpc",
 "verified_pending_result_never_exposes_legacy_score",
 "invalid_exam_metadata_blocks_start",
 "malformed_restored_answers_block_editor",
];

test("offline Chromium integration covers eight real UI transitions on both viewports",()=>{
 for(const item of cases) assert.ok(script.includes('"'+item+'"'),item);
 assert.match(script,/1440.*900/);
 assert.match(script,/390.*844/);
 assert.match(script,/page\.get_by_label\("Your short answer"/);
 assert.match(script,/page\.get_by_role\("button", name="Confirm submission"/);
 assert.match(script,/page\.reload\(\)/);
 assert.match(script,/page\.wait_for_url\(/);
 assert.match(script,/browser\.new_context\(/);
 assert.match(script,/context\.close\(\)/);
 assert.match(script,/fixture\.fail_next_written_save = True/);
});

test("browser exercises actual student save and verified receipt HTTP contract",()=>{
 for(const api of [
 "/rest/v1/rpc/start_cbt_attempt",
 "/rest/v1/rpc/save_cbt_answer",
 "/rest/v1/rpc/submit_cbt_attempt",
 "/rest/v1/rpc/education_student_verified_result",
 "/rest/v1/user_answers",
 "/rest/v1/user_attempts",
 "/rest/v1/options",
 "/auth/v1/token",
 ])assert.ok(script.includes(api),api);
 assert.match(script,/self\.status = "submitted"/);
 assert.match(script,/self\.started \+= 1/);
 assert.match(script,/self\.submitted \+= 1/);
 assert.match(script,/result": "passed"/);
 assert.match(script,/route\.fulfill\(status=503/);
 assert.match(script,/page\.get_by_text\("999 \/ 1000", exact=False\)/);
});

test("network guard cannot call production or arbitrary unmocked API URLs",()=>{
 assert.match(script,/if url\.hostname == "127\.0\.0\.1" and url\.port == 4173:/);
 assert.match(script,/if url\.hostname != REMOTE:/);
 assert.match(script,/raise AssertionError\("Unexpected nonlocal browser host"\)/);
 assert.match(script,/REMOTE = "offline-education\.invalid"/);
 assert.match(script,/self\.unexpected_mutations\.append/);
 assert.doesNotMatch(script,/requests\.get\(|requests\.post\(|urllib\.request|httpx\.|storage_state\(|screenshot\(|page\.on\("console"/);
 assert.doesNotMatch(script,/wcncuarekaofmfurbtbh|supabase\.co|os\.environ\["ETERNYX_RLS_/);
});

test("CI supplies only fake public Vite flags and triggers for Education changes",()=>{
 assert.match(workflow,/name: Education atomic browser integration \(synthetic only\)/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/branches: \[main\]/);
 assert.match(workflow,/src\/pages\/TestInterface\.tsx/);
 assert.match(workflow,/src\/pages\/TestResults\.tsx/);
 assert.match(workflow,/VITE_SUPABASE_URL: https:\/\/offline-education\.invalid/);
 for(const key of [
  "VITE_CBT_ATOMIC_RPC","VITE_EDUCATION_INSTRUCTOR_RPC",
  "VITE_EDUCATION_PUBLICATION_RPC","VITE_EDUCATION_WRITTEN_REVIEW_RPC",
  "VITE_EDUCATION_VERIFIED_RESULTS_RPC",
 ])assert.ok(workflow.includes(key+': "true"'),key);
 assert.match(workflow,/npm run build/);
 assert.match(workflow,/playwright==1\.56\.0/);
 assert.match(workflow,/tests\/browser\/education_atomic_local\.py/);
 assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\.|environment: rls-staging|sb_secret_|VITE_SUPABASE_SERVICE_ROLE/);
});

test("evidence cannot imply real staging or production grade clearance",()=>{
 assert.match(script,/production_tested": False/);
 assert.match(script,/staging_hosted_tested": False/);
 assert.match(script,/local preview with intercepted synthetic API only/);
 assert.match(script,/result": "blocked"/);
 assert.match(script,/result": "passed"/);
 assert.match(script,/REPORT\.write_text\(json\.dumps/);
 assert.doesNotMatch(workflow,/screenshots|traces|har|\.webm/);
});

test("synthetic Chromium runner is valid Python before invoking any browser",()=>{
 const path=fileURLToPath(new URL("./browser/education_atomic_local.py",import.meta.url));
 const c=spawnSync("python3",["-m","py_compile",path],{encoding:"utf8",timeout:10000});
 if(c.error?.code==="ENOENT")return; // Some contributors build on Windows.
 assert.equal(c.status,0,"Synthetic Education browser source must compile");
});

test("private Education, exam, instructor, and result routes never poll visitor presence",()=>{
 const source=readFileSync(new URL("../src/components/home/VisitorPresence.tsx",import.meta.url),"utf8");
 assert.match(source,/privateEducation = path === "\/education"/);
 assert.match(source,/path\.startsWith\("\/education\/"\)/);
 assert.match(source,/path === "\/admin\/education"/);
 assert.match(source,/path\.startsWith\("\/test\/"\)/);
 assert.match(source,/path\.startsWith\("\/test-results\/"\)/);
 assert.match(source,/included = allowed && !locked && !restoring && !privateEducation/);
 assert.match(source,/queryKey: \["visitor-presence", included, privateEducation\]/);
 assert.match(source,/enabled: !privateEducation && \(included \|\| home\)/);
 assert.match(script,/path == "\/rest\/v1\/rpc\/is_admin"/);
 assert.match(script,/fixture\.unexpected_mutations\.clear\(\)/);
 assert.match(workflow,/src\/components\/home\/VisitorPresence\.tsx/);
});
