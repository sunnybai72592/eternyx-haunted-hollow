import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {educationAttemptNavigation} from "../src/lib/educationAttemptNavigation.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const exam=read("src/pages/TestInterface.tsx");
const catalog=read("src/pages/Education.tsx");
const results=read("src/pages/TestResults.tsx");
const resultEvidence=read("src/lib/educationResultEvidence.mjs");
const review=read("src/components/education/EducationWrittenReviewPanel.tsx");
const guide=read("docs/EDUCATION_CBT_RELIABILITY_MILESTONE.md");
const testId="10000000-0000-4000-8000-000000000001";
const owner="10000000-0000-4000-8000-000000000002";
const other="10000000-0000-4000-8000-000000000003";
const attemptId="10000000-0000-4000-8000-000000000004";
const owned=status=>({id:attemptId,test_id:testId,user_id:owner,status});

test("1. A fresh exam opens exactly the authenticated requested test",()=>{
 assert.deepEqual(educationAttemptNavigation(testId,null,true,owner),{
  label:"Open assessment",path:"/test/"+testId,status:"available",
 });
});
test("2. An in-progress exam resumes rather than creating a new result route",()=>{
 assert.deepEqual(educationAttemptNavigation(testId,owned("in_progress"),true,owner),{
  label:"Continue assessment",path:"/test/"+testId,status:"in_progress",
 });
});
test("3. Submitted and auto-submitted exams open their existing attempt results",()=>{
 for(const state of ["submitted","auto_submitted","cheated"]){
  const a=educationAttemptNavigation(testId,owned(state),true,owner);
  assert.equal(a.status,"submitted");
  assert.equal(a.path,"/test-results/"+attemptId);
  assert.equal(a.label,"View submitted results");
 }
});
test("4. Failed owner attempt check blocks an irreversible new test start",()=>{
 assert.equal(educationAttemptNavigation(testId,null,false,owner).path,null);
 assert.equal(educationAttemptNavigation(testId,owned("submitted"),false,owner).path,null);
});
test("5. Attempts owned by another account are not exposed to this learner",()=>{
 assert.equal(educationAttemptNavigation(testId,owned("submitted"),true,other).path,null);
});
test("6. Attempts for a different assessment are not treated as ours",()=>{
 assert.equal(educationAttemptNavigation(other,owned("submitted"),true,owner).path,null);
});
test("7. Invalid attempt and test UUIDs fail closed without navigation",()=>{
 assert.equal(educationAttemptNavigation("not-a-uuid",null,true,owner).path,null);
 assert.equal(educationAttemptNavigation(testId,{...owned("submitted"),id:"broken"},true,owner).path,null);
 assert.equal(educationAttemptNavigation(testId,null,true,"bad-id").path,null);
});
test("8. Unknown legacy attempt statuses cannot be mistaken for a new exam",()=>{
 for(const status of ["graded","pending","","expired",undefined]){
  assert.equal(educationAttemptNavigation(testId,owned(status),true,owner).path,null);
 }
});
test("9. Catalog always scopes attempt lookup to signed-in user and fails closed on API error",()=>{
 assert.match(catalog,/queryKey: \["education-owned-attempt-list", user\?\.id\]/);
 assert.match(catalog,/\.eq\("user_id", user!\.id\)/);
 assert.match(catalog,/\.filter\(row => row\.user_id === user!\.id\)/);
 assert.match(catalog,/attemptCheckReady/);
 assert.match(catalog,/Existing attempts could not be verified/);
 assert.match(catalog,/educationAttemptNavigation\(test\.id, previous, attemptCheckReady, user\?\.id\)/);
 assert.match(catalog,/action\.path/);
});
test("10. Student catalog offers resume, submitted result and disabled status rather than blind start",()=>{
 assert.match(catalog,/action\.label/);
 assert.match(catalog,/Attempt status unavailable/);
 assert.match(catalog,/Checking your existing exam attempts/);
 assert.match(catalog,/Retry attempt check/);
});
test("11. Atomic student autosave is scoped to one user and one attempt",()=>{
 assert.match(exam,/createEducationAnswerSaveQueue/);
 assert.match(exam,/saveQueueScopeRef\.current = scope/);
 assert.match(exam,/saveQueueRef\.current\?\.dispose\(\)/);
 assert.match(exam,/restoredAttemptRef\.current = null/);
 assert.match(exam,/setAnswers\(new Map\(\)\)/);
});
test("12. Autosave uses a single serial latest-write queue, not the obsolete batching chain",()=>{
 assert.match(exam,/saveQueueRef\.current\.enqueue\(nextAnswer\)/);
 assert.match(exam,/queue\.flush\(\)/);
 assert.doesNotMatch(exam,/pendingAnswersRef|answerSaveChainRef|batch\.slice\(i\)/);
});
test("13. Submission confirms saved answers and refreshes owned catalog status",()=>{
 assert.match(exam,/await flushPendingAnswers\(\)/);
 assert.match(exam,/if \(atomicCbtEnabled && !restoreReady && !deadlinePassed\)/);
 assert.match(exam,/educationExamAffectedQueryKeys\(ownerId\)/);
 assert.match(exam,/refreshOwnedExamViews\(user\.id\)/);
 assert.match(exam,/status\)\)/);
});
test("14. Failed saves remain explicitly visible and can be retried by learner",()=>{
 assert.match(exam,/setAnswerSaveStatus\("unsaved"\)/);
 assert.match(exam,/setAnswerSaveFailed\(true\)/);
 assert.match(exam,/Unsaved answers:/);
 assert.match(exam,/Retry saving/);
 assert.match(exam,/aria-live="polite"/);
});
test("15. Browser reconnection retries only before original server deadline",()=>{
 assert.match(exam,/window\.addEventListener\("online", reconnect\)/);
 assert.match(exam,/Date\.now\(\) >= deadline/);
 assert.match(exam,/window\.removeEventListener\("online", reconnect\)/);
});
test("16. Expiry shows a manual submission retry without extending deadline",()=>{
 assert.match(exam,/Retry submission/);
 assert.match(exam,/submitExam\(true\)/);
 assert.match(exam,/late answer edits cannot be accepted/);
});
test("17. Results do not expose saved option database UUIDs to students or exports",()=>{
 assert.match(resultEvidence,/Selected option recorded/);
 assert.match(results,/normalizeEducationResultEvidence\(/);
 assert.doesNotMatch(results,/user_answer: answer\.short_answer_text \|\| answer\.selected_option_id/);
});
test("18. Results provide manual grade recheck without polling",()=>{
 assert.match(results,/Check latest result/);
 assert.match(results,/verifiedQuery\.refetch\(\)/);
 assert.match(results,/attemptQuery\.refetch\(\)/);
 assert.match(results,/answersQuery\.refetch\(\)/);
 assert.doesNotMatch(results,/refetchInterval:|setInterval\(/);
});
test("19. Official final timestamp only appears in verified mode",()=>{
 assert.match(results,/verifiedStudentResultsEnabled && gradeRevealed/);
 assert.match(results,/Finalized \{formatAssessmentDate\(verifiedQuery\.data\?\.finalized_at\)\}/);
 assert.match(results,/Legacy grading mode: this recorded score has not been independently verified/);
});
test("20. Instructor written review defaults to pending and exposes reviewed filter",()=>{
 assert.match(review,/useState<"pending" \| "reviewed" \| "all">\("pending"\)/);
 assert.match(review,/filter: reviewFilter, search, assessment, sort/);
 assert.match(review,/filterWrittenReviewQueue\(query\.data \?\? \[\], \{/);
 assert.match(review,/reviewedCount/);
 assert.match(review,/pendingCount/);
});
test("21. An instructor must confirm a change to a previously recorded mark",()=>{
 assert.match(review,/previous !== null && previous !== checked\.points/);
 assert.match(review,/checkWrittenReviewDraft\(raw, max, previous\)/);
 assert.match(review,/window\.confirm\("Replace this provisional written-review mark/);
 assert.match(review,/saved as review evidence|Official grade remains pending/);
});
test("22. Instructor edits clear stale draft overrides after the server confirms save",()=>{
 assert.match(review,/delete next\[answerId\]/);
 assert.match(review,/invalidateQueries\(\{ queryKey: \["education-written-review-queue", userId\] \}\)/);
});
test("23. This milestone does not enable staging gates or deploy a migration",()=>{
 assert.doesNotMatch(exam,/VITE_CBT_ATOMIC_RPC\s*=\s*"true"/);
 assert.doesNotMatch(catalog,/VITE_EDUCATION_VERIFIED_RESULTS_RPC\s*=\s*"true"/);
 assert.match(guide,/not deployed|NOT DEPLOYED/i);
 assert.match(guide,/server.*enforce/i);
 assert.match(guide,/production/i);
});
