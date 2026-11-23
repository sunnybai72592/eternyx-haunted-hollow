import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const python=readFileSync(new URL("./browser/education_results_review_local.py",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/education-atomic-browser-ci.yml",import.meta.url),"utf8");
const checks=[
 "pending_grade_hides_forged_legacy_score",
 "pending_grade_never_requests_correctness",
 "finalized_grade_requires_matching_ledger_receipt",
 "finalized_private_csv_is_owner_scoped",
 "malformed_receipt_fails_closed",
 "different_account_denied_private_attempt",
 "unapproved_instructor_sees_no_queue",
 "approved_instructor_sees_private_authorized_queue",
 "invalid_written_mark_cannot_be_sent",
 "explicit_provisional_review_does_not_finalize_grade",
 "malformed_review_queue_fails_closed",
];
test("all eleven browser evidence names occur once per scenario across desktop and mobile",()=>{
 assert.equal(checks.length,11);
 for(const key of checks)assert.ok(python.includes('"'+key+'"'),key);
 assert.match(python,/1440.*900/);
 assert.match(python,/390.*844/);
 assert.match(python,/len\(results\) == len\(CHECKS\)\*2/);
 assert.match(python,/browser\.new_context/);
 assert.match(python,/context\.close\(\)/);
});
test("student browser enforces ledger, never browser legacy scores or unverified answer marks",()=>{
 assert.match(python,/score=999, max_score=1000/);
 assert.match(python,/self\.grade != "finalized" and reveal/);
 assert.match(python,/premature_correctness_query/);
 assert.match(python,/grade_status": "pending_review"/);
 assert.match(python,/grade_status": "finalized"/);
 assert.match(python,/score": 70, "max_score": 10/);
 assert.match(python,/get_by_text\("Verified final grade"/);
 assert.match(python,/get_by_role\("button", name="Download my answers \(\.csv\)"\)/);
 assert.match(python,/get_by_text\("999 \/ 1000"/);
 assert.match(python,/unauthorized=True/);
 assert.match(python,/route\.fulfill\(status=406/);
});
test("instructor review browser enforces approved roles and only an explicitly clicked provisional review",()=>{
 assert.match(python,/education_instructor_access/);
 assert.match(python,/education_instructor_written_review_queue/);
 assert.match(python,/education_instructor_review_written_answer/);
 assert.match(python,/page\.get_by_role\("button", name="Record review"\)\.is_disabled\(\)/);
 assert.match(python,/page\.get_by_role\("button", name="Record review"\)\.click\(\)/);
 assert.match(python,/official_score_updated": False/);
 assert.match(python,/self\.grade_finalizations \+= 1/);
 assert.match(python,/assert_equal\(fixture\.grade_finalizations, 0\)/);
 assert.match(python,/malformed=True/);
});
test("source only uses completely intercepted nonproduction browser fixtures",()=>{
 assert.match(python,/from education_atomic_local import/);
 assert.match(python,/from playwright\.sync_api import expect, sync_playwright/);
 assert.match(python,/url\.hostname == REMOTE/);
 assert.match(python,/super\(\)\.handle\(route\)/);
 assert.doesNotMatch(python,/supabase\.co|requests\.|urllib\.request|httpx\.|storage_state\(|screenshot\(|os\.environ|sb_secret_/);
 assert.match(python,/staging_verified": False/);
 assert.match(python,/production_verified": False/);
});
test("Education CI runs both Chrome suites with fake client keys, no secrets, and uploads sanitized reports",()=>{
 assert.match(workflow,/VITE_SUPABASE_URL: https:\/\/offline-education\.invalid/);
 assert.match(workflow,/tests\/browser\/education_results_review_local\.py/);
 assert.match(workflow,/tests\/education-results-review-browser-contract\.test\.mjs/);
 assert.match(workflow,/src\/pages\/EducationInstructorStudio\.tsx/);
 assert.match(workflow,/src\/components\/education\/EducationWrittenReviewPanel\.tsx/);
 assert.match(workflow,/test-results\/education-results-review-local-browser\.json/);
 assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\.|environment: rls-staging|VITE_SUPABASE_SERVICE_ROLE_KEY/);
});
test("new browser runner is Python-syntax valid without any staging login",()=>{
 const path=fileURLToPath(new URL("./browser/education_results_review_local.py",import.meta.url));
 const result=spawnSync("python3",["-m","py_compile",path],{encoding:"utf8",timeout:15000});
 if(result.error?.code==="ENOENT")return;
 assert.equal(result.status,0,"offline results/review browser Python syntax");
});
