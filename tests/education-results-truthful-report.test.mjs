import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { summarizeAttempt, formatAssessmentDate, assessmentDuration, buildAssessmentReport } from "../src/lib/educationResults.mjs";
const source=readFileSync(new URL("../src/pages/TestResults.tsx",import.meta.url),"utf8");
const attempt={id:"11111111-1111-4111-8111-111111111111",test_id:"22222222-2222-4222-8222-222222222222",user_id:"33333333-3333-4333-8333-333333333333",status:"submitted",score:8,max_score:10,start_time:"2026-01-01T00:00:00Z",end_time:"2026-01-01T00:08:23Z",is_mobile_locked:false};

test("1: recorded scores use server values and do not invent a passing threshold",()=>{
  assert.deepEqual(summarizeAttempt(attempt),{status:"submitted",completed:true,graded:true,score:8,maxScore:10,percentage:80,headline:"Score recorded"});
  assert.doesNotMatch(source,/scorePercentage >= 60|Test Passed!|NOT PASSED/);
});
test("2: missing or ungraded scores are pending, not failed",()=>{
  const s=summarizeAttempt({...attempt,score:null,max_score:null});
  assert.equal(s.graded,false);
  assert.equal(s.headline,"Grading pending");
  assert.equal(s.percentage,null);
});
test("3: in-progress attempts cannot report scores even if fields are present",()=>{
  const s=summarizeAttempt({...attempt,status:"in_progress"});
  assert.equal(s.completed,false);
  assert.equal(s.graded,false);
  assert.throws(()=>buildAssessmentReport({...attempt,status:"in_progress"},null));
});
test("4: invalid scoring values cannot become achievements",()=>{
  for(const vals of [[-1,10],[12,10],[5,0],[Infinity,10],[5,null]]) {
    assert.equal(summarizeAttempt({...attempt,score:vals[0],max_score:vals[1]}).graded,false);
  }
});
test("5: timestamps and durations handle incomplete or reversed records",()=>{
  assert.equal(assessmentDuration(attempt.start_time,attempt.end_time),"8m 23s");
  assert.equal(assessmentDuration(attempt.end_time,attempt.start_time),"Not available");
  assert.equal(assessmentDuration(attempt.start_time,null),"Not available");
  assert.equal(formatAssessmentDate(null),"Not available");
});
test("6: text report includes actual server status and recorded points",()=>{
  const report=buildAssessmentReport(attempt,{title:"Coating inspection"},[{question_text:"DFT?",user_answer:"120 microns",is_correct:null}]);
  assert.match(report,/Coating inspection/);
  assert.match(report,/Recorded score: 8 \/ 10 \(80\.0%\)/);
  assert.match(report,/Grading: Pending/);
  assert.match(report,/not an official certificate/);
});
test("7: ungraded report never claims a fail",()=>{
  const report=buildAssessmentReport({...attempt,score:null,max_score:null},null,[]);
  assert.match(report,/Grading pending/);
  assert.match(report,/Pass\/fail: Not declared/);
});
test("8: sensitive attempt reads are scoped to logged-in user and cached per user",()=>{
  assert.match(source,/queryKey: \["education-attempt", user\?\.id, attemptId\]/);
  assert.match(source,/\.eq\("id", attemptId!\)\.eq\("user_id", user!\.id\)/);
  assert.match(source,/const enabled = !authLoading && isAuthenticated && !!user\?\.id && validAttemptId/);
  assert.match(source,/queryKey: \["education-attempt", user\?\.id, attemptId\],[\s\S]*?enabled,/);
  assert.match(source,/summary\.completed/);
});
test("9: reports are local downloads not alerts, PDFs or fake results",()=>{
  assert.match(source,/new Blob\(\[text\]/);
  assert.match(source,/downloadReport\(annotateEducationTextReport\(text, provenance\), attemptQuery\.data\.id\)/);
  assert.match(source,/Download report \(\.txt\)/);
  assert.doesNotMatch(source,/coming soon|alert\(/);
});
test("10: non-final results do not expose question breakdown and retake isn't falsely promised",()=>{
  assert.match(source,/\{summary\.completed && \(/);
  assert.match(source,/Retakes depend on the exam service/);
  assert.match(source,/educationAnswerReviewLabel\(answer, gradeRevealed\)/);
  assert.match(source,/const effectiveFilter = gradeRevealed \? answerFilter/);
});
test("11: test results page parses as TSX",()=>{
  const ast=ts.createSourceFile("TestResults.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
