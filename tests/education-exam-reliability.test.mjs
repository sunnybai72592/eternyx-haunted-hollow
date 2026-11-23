import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { examDeadline, examSecondsRemaining, examClock, validExamId, answeredExamCount } from "../src/lib/educationExam.mjs";
const source=readFileSync(new URL("../src/pages/TestInterface.tsx",import.meta.url),"utf8");

test("1: fixed deadline derives from persisted database start timestamp",()=>{
  assert.equal(examDeadline("2026-11-22T00:00:00Z",30),Date.parse("2026-11-22T00:30:00Z"));
  assert.equal(examDeadline("bad",30),null);
  assert.equal(examDeadline("2026-11-22T00:00:00Z",0),null);
});
test("2: remaining time recomputes from absolute clock after reload or tab switch",()=>{
  const d=examDeadline("2026-11-22T00:00:00Z",30);
  assert.equal(examSecondsRemaining(d,Date.parse("2026-11-22T00:10:01Z")),1199);
  assert.equal(examSecondsRemaining(d,Date.parse("2026-11-22T01:00:00Z")),0);
  assert.equal(examSecondsRemaining(null),null);
  assert.equal(examClock(65),"1:05");
});
test("3: invalid route IDs cannot start an examination",()=>{
  assert.ok(validExamId("11111111-1111-4111-8111-111111111111"));
  assert.equal(validExamId("test"),false);
  assert.equal(validExamId(undefined),false);
  assert.match(source,/enabled = !authLoading && isAuthenticated && !!user\?\.id && validTestId/);
});
test("4: exam reads only explicit fields, never correctness flags",()=>{
  assert.match(source,/\.select\("id,question_text,question_type,points,order_index"\)/);
  assert.match(source,/\.select\("id,option_text"\)/);
  assert.doesNotMatch(source,/\.select\('\*'\)|\.select\("\*"\)/);
  assert.doesNotMatch(source,/is_correct/);
});
test("5: true-false uses configured UUID option rows rather than string pseudo-IDs",()=>{
  assert.match(source,/\["multiple_choice", "true_false"\]/);
  assert.match(source,/option\.id/);
  assert.doesNotMatch(source,/RadioGroupItem value="true"|RadioGroupItem value="false"/);
});
test("6: resume only an authenticated user's in-progress attempt",()=>{
  assert.match(source,/\.eq\("user_id", user!\.id\)\.eq\("test_id", testId!\)/);
  assert.match(source,/\.eq\("status", "in_progress"\)\.maybeSingle\(\)/);
  assert.match(source,/\.select\("id,start_time,status"\)/);
  assert.match(source,/queryKey: \["education-active-exam-attempt", user\?\.id, testId\]/);
});
test("7: answer counts exclude empty short-answer text and blank choices",()=>{
  const map=new Map([
    ["a",{questionId:"a",shortAnswer:"  "}],
    ["b",{questionId:"b",shortAnswer:"A"}],
    ["c",{questionId:"c",selectedOptionId:"uuid"}]
  ]);
  assert.equal(answeredExamCount(map),2);
});
test("8: a single submit guard prevents overlapping attempts and scopes writes",()=>{
  assert.match(source,/if \(submittingRef\.current/);
  assert.match(source,/submittingRef\.current = true/);
  assert.match(source,/onConflict: "attempt_id,question_id"/);
  assert.match(source,/\.eq\("id", attemptId\)\.eq\("user_id", user\.id\)\.eq\("status", "in_progress"\)/);
});
test("9: expiry cannot repeatedly fire a network submission every second",()=>{
  assert.match(source,/expirySubmitRequested\.current = true/);
  assert.match(source,/!expirySubmitRequested\.current && !submittingRef\.current/);
  assert.match(source,/window\.clearInterval\(interval\)/);
});
test("10: visibility does not falsely accuse cheating or forcibly submit",()=>{
  assert.match(source,/visibilitychange/);
  assert.match(source,/This alone is not proof of a screen lock or misconduct/);
  assert.doesNotMatch(source,/Test paused: Tab hidden or screen lock detected/);
});
test("11: failed submission and zero-question exams render safe states",()=>{
  assert.match(source,/This assessment has no available questions/);
  assert.match(source,/Submission could not be confirmed/);
  assert.match(source,/readOwnedSubmissionStatus/);
  assert.match(source,/!exam\.questions\.length/);
});
test("12: no server-side integrity promises; readable accessible navigation",()=>{
  assert.match(source,/must be enforced by an atomic server-side submission service/);
  assert.match(source,/aria-label="Exam question navigation"/);
  assert.match(source,/role="timer"/);
  assert.match(source,/Confirm submission/);
});
test("13: test-taking TSX remains syntactically valid",()=>{
  const ast=ts.createSourceFile("TestInterface.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
