import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildTrustedGradingPlan } from "../supabase/functions/_shared/cbt-grading.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const grade = read("supabase/functions/grade-test/index.ts");
const worker = read("supabase/functions/auto-submit-tests/index.ts");
const audit = read("scripts/sql/read-only-cbt-answer-key-audit.sql");
const guide = read("docs/EDUCATION_CBT_SECURITY_RELEASE_GATE.md");

const questions = [
  { id: "q-one", question_type: "multiple_choice", points: 5 },
  { id: "q-two", question_type: "true_false", points: 3 },
  { id: "q-three", question_type: "short_answer", points: 2 },
];
const option = (id, question_id, is_correct) => ({ id, question_id, is_correct });
const answer = (id, question_id, selected_option_id = null, short_answer_text = null) =>
  ({ id, question_id, selected_option_id, short_answer_text });

test("1: maximum score always includes unanswered questions", () => {
  const plan = buildTrustedGradingPlan(questions, [answer("a", "q-one", "good")],
    [option("good", "q-one", true)]);
  assert.equal(plan.maxScore, 10);
  assert.equal(plan.score, 5);
  assert.equal(plan.percentage, 50);
  assert.equal(plan.questionCount, 3);
  assert.equal(plan.answeredCount, 1);
});

test("2: correct and wrong objective answers receive only their configured points", () => {
  const plan = buildTrustedGradingPlan(questions.slice(0, 2), [
    answer("a", "q-one", "good"), answer("b", "q-two", "wrong"),
  ], [option("good", "q-one", true), option("wrong", "q-two", false)]);
  assert.equal(plan.score, 5);
  assert.equal(plan.maxScore, 8);
  assert.deepEqual(plan.updates, [
    { id: "a", is_correct: true, points_awarded: 5 },
    { id: "b", is_correct: false, points_awarded: 0 },
  ]);
});

test("3: missing responses score zero without shrinking the denominator", () => {
  const plan = buildTrustedGradingPlan(questions, [], []);
  assert.equal(plan.score, 0);
  assert.equal(plan.maxScore, 10);
  assert.equal(plan.percentage, 0);
  assert.deepEqual(plan.updates, []);
});

test("4: blank submitted objective answers are not falsely labeled incorrect", () => {
  const plan = buildTrustedGradingPlan([questions[0]], [answer("a", "q-one")], []);
  assert.deepEqual(plan.updates, [{ id: "a", is_correct: null, points_awarded: 0 }]);
  assert.equal(plan.score, 0);
});

test("5: genuine written responses are pending manual review, never auto-failed", () => {
  const forged = { ...answer("essay", "q-three", null, "Explain corrosion"), is_correct: true, points_awarded: 2 };
  const plan = buildTrustedGradingPlan(questions, [forged], []);
  assert.equal(plan.gradingPending, true);
  assert.equal(plan.pendingManualReview, 1);
  assert.equal(plan.score, null);
  assert.equal(plan.percentage, null);
  assert.equal(plan.maxScore, 10);
  assert.deepEqual(plan.updates, [{ id: "essay", is_correct: null, points_awarded: null }]);
});

test("6: empty written answers receive no fabricated manual-review credit", () => {
  const plan = buildTrustedGradingPlan([questions[2]], [answer("essay", "q-three", null, "  ")], []);
  assert.equal(plan.gradingPending, false);
  assert.equal(plan.score, 0);
  assert.deepEqual(plan.updates, [{ id: "essay", is_correct: null, points_awarded: 0 }]);
});

test("7: forged client-side correctness and points are ignored for objective questions", () => {
  const forged = { ...answer("a", "q-one", "wrong"), is_correct: true, points_awarded: 999999 };
  const plan = buildTrustedGradingPlan([questions[0]], [forged], [option("wrong", "q-one", false)]);
  assert.equal(plan.score, 0);
  assert.deepEqual(plan.updates, [{ id: "a", is_correct: false, points_awarded: 0 }]);
});

test("8: selecting an option belonging to another question cannot be graded", () => {
  assert.throws(() => buildTrustedGradingPlan([questions[0]],
    [answer("a", "q-one", "borrowed")], [option("borrowed", "q-two", true)]), /does not belong/);
  assert.throws(() => buildTrustedGradingPlan([questions[0]],
    [answer("a", "q-one", "missing")], []), /does not belong/);
});

test("9: unknown, duplicate and mixed-type answers cannot enter grading plan", () => {
  assert.throws(() => buildTrustedGradingPlan([questions[0]], [answer("a", "unrelated")], []), /Invalid submitted answer/);
  assert.throws(() => buildTrustedGradingPlan([questions[0]], [answer("a", "q-one"), answer("b", "q-one")], []), /Invalid submitted answer/);
  assert.throws(() => buildTrustedGradingPlan([questions[2]], [answer("a", "q-three", "other")], []), /written question/);
  assert.throws(() => buildTrustedGradingPlan([questions[0]], [answer("a", "q-one", "good", "forged text")],
    [option("good", "q-one", true)]), /objective question/);
});

test("10: invalid question banks are rejected instead of generating a score", () => {
  for (const q of [[], [{...questions[0], points: -1}], [{...questions[0], points: 1.5}],
    [{...questions[0], question_type: "unsafe"}], [questions[0], questions[0]]]) {
    assert.throws(() => buildTrustedGradingPlan(q, [], []));
  }
});

test("11: grading plans are deterministic across retries", () => {
  const a = [answer("a", "q-one", "correct"), answer("b", "q-two", "false")];
  const options = [option("correct", "q-one", true), option("false", "q-two", false)];
  assert.deepEqual(buildTrustedGradingPlan(questions, a, options),
    buildTrustedGradingPlan(questions, a, options));
});

test("12: trusted handler guards caller, validates submission and preserves status timestamps", () => {
  assert.match(grade, /isTrustedServiceRequest\(req\)/);
  assert.match(grade, /"auto_submitted", "submitted"/);
  assert.match(grade, /\.from\("questions"\)\.select\("id,question_type,points"\)/);
  assert.match(grade, /\.select\("id,question_id,is_correct"\)\.in\("id", optionIds\)/);
  assert.match(grade, /\.update\(\{ score: plan\.score, max_score: plan\.maxScore \}\)/);
  assert.doesNotMatch(grade, /status: "submitted", end_time:/);
  assert.match(grade, /gradingPending: plan\.gradingPending/);
});

test("13: trusted worker recovers manual submissions and retryable auto-submitted attempts", () => {
  assert.match(worker, /\.in\("status", \["submitted", "auto_submitted"\]\)/);
  assert.match(worker, /\.is\("max_score", null\)/);
  assert.match(worker, /new Set\(\[/);
  assert.match(worker, /gradingFailureCount: gradingFailures/);
  assert.match(worker, /manualReviewPendingCount: manualReviewPending/);
  assert.match(worker, /isTrustedServiceRequest\(req\)/);
  assert.match(worker, /apikey: key/);
});

test("14: answer keys and grading field grants remain an explicit release blocker", () => {
  assert.match(audit, /has_column_privilege\('authenticated', 'public.options', 'is_correct', 'SELECT'\)/);
  assert.match(audit, /'points_awarded', 'UPDATE'/);
  assert.match(audit, /'public.user_attempts', 'max_score', 'INSERT'/);
  assert.doesNotMatch(audit, /\bALTER\s+TABLE\b|\bCREATE\s+POLICY\b|\bREVOKE\b|\bGRANT\b/i);
  assert.match(guide, /Status: BLOCKED/);
  assert.match(guide, /could not be confirmed/);
  assert.match(guide, /manual-review service/);
});

test("15: service Edge Function sources parse as TypeScript", () => {
  for (const [name, content] of [["grade-test", grade], ["auto-submit-tests", worker]]) {
    const ast = ts.createSourceFile(name + ".ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.deepEqual(ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  }
});
