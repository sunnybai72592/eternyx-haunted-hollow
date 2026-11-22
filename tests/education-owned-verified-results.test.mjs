import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  projectVerifiedAttempt, projectVerifiedAnswers,
} from "../src/lib/educationVerifiedPresentation.mjs";
import { summarizeAttempt, buildAssessmentReport } from "../src/lib/educationResults.mjs";

const read = p => readFileSync(new URL("../"+p,import.meta.url), "utf8");
const sql=read("scripts/sql/staging-education-owned-verified-results.sql");
const sqlTest=read("tests/sql/education-db-verified-results.sql");
const client=read("src/lib/educationVerifiedResultsRpc.ts");
const page=read("src/pages/TestResults.tsx");
const workflow=read(".github/workflows/education-postgres-security.yml");
const attempt={
  id:"11111111-1111-4111-8111-111111111111",
  user_id:"22222222-2222-4222-8222-222222222222",
  status:"submitted",score:9,max_score:10,end_time:"2026-11-22T12:00:00Z",
  start_time:"2026-11-22T11:40:00Z",
};
const receipt=(score=7)=>({
  attempt_id:attempt.id,grade_status:"finalized",score,max_score:10,
  finalized_at:"2026-11-22T12:01:00Z",
});

test("1: default results preserve legacy display until coordinated staging opt-in",()=>{
  assert.equal(projectVerifiedAttempt(attempt,null,false),attempt);
  assert.match(client,/writtenReviewEnabled/);
  assert.match(client,/VITE_EDUCATION_VERIFIED_RESULTS_RPC === "true"/);
});
test("2: no verified receipt hides even plausible legacy attempt marks",()=>{
  const a=projectVerifiedAttempt(attempt,null,true);
  assert.equal(a.score,null);
  assert.equal(a.max_score,null);
  assert.equal(summarizeAttempt(a).graded,false);
});
test("3: verified final ledger is the sole score source, not the legacy score",()=>{
  const a=projectVerifiedAttempt(attempt,receipt(),true);
  assert.equal(a.score,7);
  assert.equal(a.max_score,10);
  assert.equal(summarizeAttempt(a).percentage,70);
});
test("4: unrelated, invalid or pending receipts cannot promote grades",()=>{
  for(const proof of [
    {...receipt(),attempt_id:"ffffffff-ffff-4fff-8fff-ffffffffffff"},
    {...receipt(),grade_status:"pending_review"},
    {...receipt(),score:-1},
    {...receipt(),score:11},
    {...receipt(),max_score:0},
    {...receipt(),score:Infinity},
  ]) assert.equal(projectVerifiedAttempt(attempt,proof,true).score,null);
});
test("5: even verified-looking receipts cannot score an unfinished attempt",()=>{
  for(const status of ["in_progress","cheated","other"]){
    assert.equal(projectVerifiedAttempt({...attempt,status},receipt(),true).score,null);
  }
  assert.equal(projectVerifiedAttempt({...attempt,end_time:null},receipt(),true).score,null);
});
test("6: pending answer data is masked in both report and visual projection",()=>{
  const answers=[{question_text:"Written response",user_answer:"example",
    points_awarded:2,is_correct:true}];
  const pending=projectVerifiedAnswers(answers,false);
  assert.equal(pending[0].is_correct,null);
  assert.equal(pending[0].points_awarded,null);
  const report=buildAssessmentReport(projectVerifiedAttempt(attempt,null,true),null,pending);
  assert.match(report,/Grading pending/);
  assert.doesNotMatch(report,/Recorded score: 9/);
  assert.deepEqual(projectVerifiedAnswers(answers,true),answers);
});
test("7: server RPC verifies JWT owner and never exposes other account result",()=>{
  assert.match(sql,/WHERE a\.id = p_attempt_id AND a\.user_id = v_user/);
  assert.match(sql,/Attempt unavailable to this account/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.education_student_verified_result\(uuid\)/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.education_student_verified_result\(uuid\)\s+TO authenticated/);
  assert.doesNotMatch(sql,/GRANT EXECUTE.* TO anon/);
});
test("8: no authentic matching ledger means no numerical score",()=>{
  assert.match(sql,/IF NOT FOUND THEN[\s\S]*?'grade_status','pending_review'/);
  assert.match(sql,/v_attempt\.score IS DISTINCT FROM v_grade\.score/);
  assert.match(sql,/v_attempt\.max_score IS DISTINCT FROM v_grade\.max_score/);
  assert.match(sql,/grade_status','finalized'/);
  assert.match(sql,/grade_status','in_progress'/);
});
test("9: read-only receipt cannot change attempts, review records or grade ledger",()=>{
  assert.doesNotMatch(sql,/\bINSERT INTO\b|\bUPDATE public\b|\bDELETE FROM\b/i);
  assert.match(sql,/LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''/);
  assert.match(sql,/publishes no correctness keys/);
});
test("10: client checks receipt identity, bounded scores and rejects malformed pending",()=>{
  assert.match(client,/record\.attempt_id !== attemptId/);
  assert.match(client,/Number\.isSafeInteger\(record\.score\)/);
  assert.match(client,/record\.finalized_at !== null/);
  assert.match(client,/pending_review/);
});
test("11: page withholds correctness SELECT and export before a trusted receipt",()=>{
  assert.match(page,/verifiedStudentResultsEnabled/);
  assert.match(page,/queryKey: \["education-verified-receipt", user\?\.id, attemptId\]/);
  assert.match(page,/readVerifiedStudentGrade\(attemptId!\)/);
  assert.match(page,/const request = gradeRevealed/);
  assert.match(page,/\.select\("question_id,selected_option_id,short_answer_text,questions/);
  assert.match(page,/projectVerifiedAnswers\(answersQuery\.data \?\? \[\], gradeRevealed\)/);
  assert.match(page,/buildAssessmentReport\(displayedAttempt/);
  assert.match(page,/Official grade verification is unavailable/);
});
test("12: disposable Postgres tests prove student isolation, tampering and legacy-grade denial",()=>{
  assert.match(workflow,/--network none/);
  assert.match(workflow,/staging-education-owned-verified-results\.sql/);
  assert.match(workflow,/education-db-verified-results\.sql/);
  assert.match(sqlTest,/Legacy partial score was treated as verified/);
  assert.match(sqlTest,/Unreviewed attempt showed an invented grade/);
  assert.match(sqlTest,/Owned verified receipt leaked data/);
  assert.match(sqlTest,/Inconsistent trusted ledger/);
});
test("13: new TS sources and results view are syntactically valid",()=>{
  for(const [name,content,kind] of [
    ["educationVerifiedResultsRpc.ts",client,ts.ScriptKind.TS],
    ["TestResults.tsx",page,ts.ScriptKind.TSX],
  ]){
    const ast=ts.createSourceFile(name,content,ts.ScriptTarget.Latest,true,kind);
    assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],name);
  }
});
