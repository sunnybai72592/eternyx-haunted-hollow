import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeAssessmentAnswerGrading,
  buildAssessmentReport,
} from "../src/lib/educationResults.mjs";
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("tests/sql/education-db-full-journey.sql");
const ci=read(".github/workflows/education-postgres-security.yml");
const guide=read("docs/EDUCATION_COMPLETE_ASSESSMENT_REHEARSAL.md");
const complete={id:"11111111-1111-4111-8111-111111111111",
  user_id:"22222222-2222-4222-8222-222222222222",
  status:"submitted",score:6,max_score:10,
  start_time:"2026-11-22T15:00:00Z",end_time:"2026-11-22T15:19:00Z",
  is_mobile_locked:false};

test("1. E2E creates synthetic distinct students only inside disposable PostgreSQL",()=>{
  assert.match(sql,/INSERT INTO auth\.users\(id\) VALUES/);
  assert.match(sql,/000000000030/);
  assert.match(sql,/000000000031/);
  assert.match(ci,/--network none/);
  assert.match(ci,/education-db-full-journey\.sql/);
  assert.doesNotMatch(ci,/supabase db push|supabase functions deploy/);
});
test("2. Verified instructor drafts a genuine three-type graded question bank",()=>{
  assert.match(sql,/education_instructor_access\(\)/);
  assert.match(sql,/education_instructor_create_draft\(/);
  assert.match(sql,/"type":"multiple_choice"/);
  assert.match(sql,/"type":"true_false"/);
  assert.match(sql,/"type":"short_answer"/);
  assert.match(sql,/education_instructor_load_draft/);
});
test("3. Teacher cannot self-approve, admin decides, then enrollment is explicit",()=>{
  assert.match(sql,/education_request_publication/);
  assert.match(sql,/education_admin_review_publication/);
  assert.match(sql,/education_admin_enroll_student/);
  assert.match(sql,/E2E unpublished draft exposed in learner catalog/);
});
test("4. An unenrolled learner cannot discover or start the assessment",()=>{
  assert.match(sql,/E2E unenrolled Student B saw protected exam/);
  assert.match(sql,/SELECT public\.start_cbt_attempt\(/);
  assert.match(sql,/education_ci_expect_denied/);
});
test("5. Student starts once and persists MCQ, wrong TF and written responses",()=>{
  assert.match(sql,/duplicate start did not reuse the same attempt/);
  assert.match(sql,/option_text='Magnesium'/);
  assert.match(sql,/option_text='False'/);
  assert.match(sql,/education_student_enrolled_catalog/);
  assert.match(sql,/public\.save_cbt_answer\(/);
});
test("6. Client answer keys and grading column writes remain unauthorized",()=>{
  assert.match(sql,/SELECT is_correct FROM public\.options/);
  assert.match(sql,/UPDATE public\.user_answers SET points_awarded=999/);
  assert.match(sql,/E2E foreign reviewer read private written response/);
});
test("7. Foreign student cannot save, submit or inspect another student's attempt",()=>{
  assert.match(sql,/000000000031/);
  assert.match(sql,/E2E student/);
  assert.match(sql,/education_student_verified_result/);
  assert.match(sql,/SELECT public\.submit_cbt_attempt\(/);
});
test("8. Submission is idempotent; late answer mutation is denied",()=>{
  assert.match(sql,/submission was not idempotent/);
  assert.match(sql,/already_submitted/);
  assert.match(sql,/E2E late answer write was accepted/);
});
test("9. Before human review, trusted grader makes absolutely no partial writes",()=>{
  assert.match(sql,/status'<>'pending_review'/);
  assert.match(sql,/pending_manual_review/);
  assert.match(sql,/public\.education_final_grades/);
  assert.match(sql,/E2E pending essay triggered partial grade writes/);
});
test("10. The owning instructor reviews one real essay, foreign educator sees none",()=>{
  assert.match(sql,/education_instructor_written_review_queue/);
  assert.match(sql,/education_instructor_review_written_answer/);
  assert.match(sql,/v_answer:=v_review::uuid/);
  assert.match(sql,/E2E authorized human mark was not recorded/);
});
test("11. Trusted finalizer computes exactly 6/10 and retries without rewriting",()=>{
  assert.match(sql,/6 \/ 10/);
  assert.match(sql,/education_finalize_cbt_grade/);
  assert.match(sql,/status'<>'finalized'/);
  assert.match(sql,/already_finalized/);
  assert.match(sql,/v_result->>'score'/);
});
test("12. Final response breakdown is precise and essay is not labeled correct or incorrect",()=>{
  assert.match(sql,/q\.question_type='short_answer'/);
  assert.match(sql,/a\.points_awarded=1 AND a\.is_correct IS NULL/);
  assert.match(sql,/a\.points_awarded=5 AND a\.is_correct IS TRUE/);
  assert.match(sql,/a\.points_awarded=0 AND a\.is_correct IS FALSE/);
});
test("13. Finished learner receipt is owned and is only five safe fields",()=>{
  assert.match(sql,/grade_status'<>'finalized'/);
  assert.match(sql,/jsonb_object_keys\(r\)/);
  assert.match(sql,/public\.education_ci_expect_denied\(/);
  assert.match(sql,/E2E verified learner receipt not 6\/10/);
});
test("14. Later instructor grade edits and admin enrollment revocations are rejected",()=>{
  assert.match(sql,/After official finalization, instructor corrections cannot rewrite marks/);
  assert.match(sql,/education_admin_revoke_enrollment/);
  assert.match(sql,/education_ci_expect_invalid/);
});
test("15. Human-reviewed written report gives points, never invented objective correctness",()=>{
  assert.equal(describeAssessmentAnswerGrading(
    {is_correct:null,points_awarded:1,points:2},true),
    "Grading: Written response reviewed · 1 / 2 points");
  const report=buildAssessmentReport(complete,{title:"CP E2E"},[
    {question_text:"Explain polarization",user_answer:"Polarization shifts steel potential",
      is_correct:null,points_awarded:1,points:2},
  ]);
  assert.match(report,/Recorded score: 6 \/ 10 \(60\.0%\)/);
  assert.match(report,/Grading: Written response reviewed · 1 \/ 2 points/);
  assert.doesNotMatch(report,/Grading: Incorrect/);
  assert.match(report,/not an official certificate/);
});
test("16. Pending/invalid grading values never leak subjective marks to reports",()=>{
  for(const bad of [
    {is_correct:null,points_awarded:5,points:2},
    {is_correct:null,points_awarded:-1,points:2},
    {is_correct:null,points_awarded:1.5,points:2},
    {is_correct:null,points_awarded:1,points:null},
  ]) assert.equal(describeAssessmentAnswerGrading(bad,true),"Grading: Pending");
  assert.equal(describeAssessmentAnswerGrading(
    {is_correct:null,points_awarded:1,points:2},false),"Grading: Pending");
  const report=buildAssessmentReport({...complete,score:null,max_score:null},
    {title:"CP E2E"},[{question_text:"Essay",user_answer:"sample",
      is_correct:null,points_awarded:1,points:2}]);
  assert.doesNotMatch(report,/Written response reviewed/);
  assert.match(report,/Grading: Pending/);
});
test("17. Objective marks print earned score only when valid and already final",()=>{
  assert.equal(describeAssessmentAnswerGrading(
    {is_correct:true,points_awarded:5,points:5},true),
    "Grading: Correct · 5 / 5 points");
  assert.equal(describeAssessmentAnswerGrading(
    {is_correct:false,points_awarded:0,points:3},true),
    "Grading: Incorrect · 0 / 3 points");
  assert.equal(describeAssessmentAnswerGrading(
    {is_correct:true,points_awarded:5,points:5},false),
    "Grading: Pending");
});
test("18. New journey runs after current grade, privacy and concurrency acceptance",()=>{
  const predecessor=ci.indexOf("education-db-verified-results.sql");
  const e2e=ci.indexOf("education-db-full-journey.sql");
  const cleanup=ci.indexOf("Destroy temporary database");
  assert(predecessor>0 && e2e>predecessor && cleanup>e2e);
  assert.match(ci,/if: always\(\)/);
});
test("19. Release docs distinguish disposable rehearsal from unexecuted hosted validation",()=>{
  assert.match(guide,/NOT DEPLOYED/);
  assert.match(guide,/real Supabase Auth/i);
  assert.match(guide,/manual/i);
  assert.match(guide,/production/i);
});
