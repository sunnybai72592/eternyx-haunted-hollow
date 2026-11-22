import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("scripts/sql/staging-education-cbt-atomic-security.sql");
const client = read("src/lib/educationCbtRpc.ts");
const exam = read("src/pages/TestInterface.tsx");
const guide = read("docs/EDUCATION_CBT_STAGING_ROLLOUT.md");

test("1: staged SQL is explicitly not an automatically deployed migration", () => {
  assert.match(sql, /STAGING \/ REVIEW ONLY/);
  assert.match(sql, /NOT automatically run migrations/);
  assert.match(guide, /NOT DEPLOYED/);
  assert.match(guide, /production release BLOCKED/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("2: students have no SELECT privilege for the correct-answer column", () => {
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.options FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE SELECT \(is_correct\) ON public\.options FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT \(id, question_id, option_text\) ON public\.options TO authenticated/);
  assert.doesNotMatch(sql, /GRANT SELECT \(.*is_correct/);
});

test("3: protect attempt scores, status, and timestamps from direct client writes", () => {
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.user_attempts FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE INSERT \(user_id, test_id, start_time, end_time, status, score, max_score/);
  assert.match(sql, /REVOKE UPDATE \(user_id, test_id, start_time, end_time, status, score, max_score/);
  assert.match(sql, /GRANT SELECT \(id, user_id, test_id, start_time, end_time, status,/);
});

test("4: prevent students writing answer grading flags or point awards", () => {
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.user_answers/);
  assert.match(sql, /REVOKE INSERT \(attempt_id, question_id, selected_option_id, short_answer_text,/);
  assert.match(sql, /REVOKE UPDATE \(attempt_id, question_id, selected_option_id, short_answer_text,/);
  assert.match(sql, /is_correct, points_awarded\)/);
  assert.doesNotMatch(sql, /GRANT UPDATE /);
});

test("5: secure options require an active owned non-expired attempt", () => {
  assert.match(sql, /DROP POLICY IF EXISTS "Users can view options for their attempts"/);
  assert.match(sql, /CREATE POLICY "Users can view options for their attempts"/);
  assert.match(sql, /AND a\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /AND a\.status = 'in_progress'/);
  assert.match(sql, /clock_timestamp\(\) < a\.start_time/);
});

test("6: each exposed RPC authenticates using auth.uid, not client user ID", () => {
  for (const fn of ["start_cbt_attempt", "save_cbt_answer", "submit_cbt_attempt"]) {
    assert.match(sql, new RegExp("CREATE OR REPLACE FUNCTION public\\." + fn + "\\("));
  }
  assert.equal((sql.match(/v_user uuid := \(SELECT auth\.uid\(\)\)/g) ?? []).length, 3);
  assert.equal((sql.match(/SECURITY DEFINER SET search_path = ''/g) ?? []).length, 3);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_cbt_answer\(uuid, uuid, uuid, text\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_cbt_attempt\(uuid\) TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION .* TO anon/);
});

test("7: start uses real active test duration and avoids phantom attempts", () => {
  assert.match(sql, /t\.is_active IS TRUE/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.questions/);
  assert.match(sql, /v_attempt\.status IS DISTINCT FROM 'in_progress'/);
  assert.match(sql, /VALUES \(v_user, p_test_id, 'in_progress'\)/);
  assert.match(sql, /Attempt already completed or expired/);
});

test("8: student save and submit both serialize with a row lock", () => {
  assert.ok((sql.match(/FOR UPDATE OF a;/g) ?? []).length >= 3);
  assert.match(sql, /WHERE a\.id = p_attempt_id AND a\.user_id = v_user/);
  assert.match(sql, /ON CONFLICT \(attempt_id, question_id\)/);
  assert.match(sql, /v_now >= v_attempt\.start_time/);
});

test("9: server validates selected options belong to the attempt's question", () => {
  assert.match(sql, /q\.id = p_question_id AND q\.test_id = v_attempt\.test_id/);
  assert.match(sql, /o\.id = p_selected_option_id AND o\.question_id = p_question_id/);
  assert.match(sql, /v_type IN \('multiple_choice', 'true_false'\)/);
  assert.match(sql, /Unsupported question type/);
});

test("10: written answers are length-limited and mutually exclusive with option IDs", () => {
  assert.match(sql, /p_selected_option_id IS NOT NULL OR/);
  assert.match(sql, /pg_catalog\.char_length\(COALESCE\(p_short_answer_text, ''\)\) > 5000/);
  assert.match(sql, /Invalid written answer/);
});

test("11: clearing answers deletes previous saves and graded fields never come from client", () => {
  assert.match(sql, /DELETE FROM public\.user_answers AS a/);
  assert.match(sql, /is_correct = NULL,/);
  assert.match(sql, /points_awarded = NULL/);
  assert.match(sql, /RETURN pg_catalog\.jsonb_build_object\('status', 'cleared'\)/);
});

test("12: server submission owns final status and refuses null timing", () => {
  assert.match(sql, /v_status := CASE WHEN v_now >= v_attempt\.start_time/);
  assert.match(sql, /THEN 'auto_submitted' ELSE 'submitted' END/);
  assert.match(sql, /SET status = v_status, end_time = v_now/);
  assert.match(sql, /v_attempt\.start_time IS NULL THEN/);
  assert.match(sql, /RETURN pg_catalog\.jsonb_build_object\('id', p_attempt_id, 'status', v_status\)/);
});

test("13: production remains on legacy path until the feature flag is explicitly enabled", () => {
  assert.match(client, /import\.meta\.env\.VITE_CBT_ATOMIC_RPC === "true"/);
  assert.match(exam, /if \(atomicCbtEnabled\) \{\s+return await startCbtAttempt\(testId!\)/);
  assert.match(exam, /Legacy path is retained only while the coordinated server rollout is/);
  assert.match(guide, /Never enable the flag without/);
});

test("14: server-backed autosaves are debounced and retryable", () => {
  assert.match(exam, /pendingAnswersRef\.current\.set\(question\.id, nextAnswer\)/);
  assert.match(exam, /answerSaveChainRef\.current\.then\(async \(\) =>/);
  assert.match(exam, /pendingAnswersRef\.current\.set\(missed\.questionId, missed\)/);
  assert.match(exam, /flushPendingAnswers\(\)/);
  assert.match(exam, /question\.question_type === "short_answer" \? 700 : 150/);
});

test("15: refresh recovery scopes previously saved answers to this account's attempt", () => {
  assert.match(exam, /queryKey: \["education-saved-answers", user\?\.id, attemptQuery\.data\?\.id\]/);
  assert.match(exam, /\.eq\("attempt_id", attemptQuery\.data!\.id\)/);
  assert.match(exam, /setAnswers\(new Map\(restoredAnswersQuery\.data\.map/);
  assert.match(exam, /restoredAttemptRef\.current === attemptQuery\.data\.id/);
  assert.match(exam, /restoredAnswersQuery\.isSuccess/);
});

test("16: the atomic submission path requires an affirmative server outcome", () => {
  assert.match(exam, /const result = await submitCbtAttempt\(attemptId\)/);
  assert.match(exam, /if \(!\["submitted", "auto_submitted"\]\.includes\(result\.status\)\)/);
  assert.match(exam, /if \(!dueToExpiry\) throw error/);
  assert.match(client, /This answer was not saved: attempt ended or expired/);
});

test("17: browsers only send question text and selected IDs, never keys or secrets", () => {
  assert.match(client, /"save_cbt_answer", \{/);
  assert.match(client, /p_selected_option_id: answer\.selectedOptionId \|\| null/);
  assert.match(client, /p_short_answer_text: answer\.shortAnswer \|\| null/);
  assert.doesNotMatch(client, /is_correct|service_role|SUPABASE_SECRET/);
});

test("18: the rollout document explicitly blocks teacher breakage and live deployment", () => {
  assert.match(guide, /CreateTest\.tsx/);
  assert.match(guide, /direct .*options\.select\('\*'\)/);
  assert.match(guide, /teacher authoring/i);
  assert.match(guide, /Two-student authorization tests/);
  assert.match(guide, /isolated PostgreSQL integration test/);
  assert.match(guide, /No production database or function deployment/);
});

test("19: new TypeScript client and exam page parse", () => {
  for (const [name, content, kind] of [
    ["educationCbtRpc.ts", client, ts.ScriptKind.TS],
    ["TestInterface.tsx", exam, ts.ScriptKind.TSX],
  ]) {
    const ast = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true, kind);
    assert.deepEqual(ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  }
});

test("20: deadline timestamps are captured only after locking each attempt", () => {
  assert.equal((sql.match(/v_now := clock_timestamp\(\);/g) ?? []).length, 3);
  assert.equal((sql.match(/v_now timestamptz;/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /v_now timestamptz := clock_timestamp\(\)/);
  assert.match(sql, /FOR UPDATE OF a;[\s\S]{0,350}v_now := clock_timestamp\(\)/);
});

test("21: staging admission excludes unpublished and unverified password-protected exams", () => {
  const hub = read("src/pages/Education.tsx");
  assert.match(sql, /AND t\.is_published IS TRUE/);
  assert.match(sql, /pg_catalog\.nullif\(pg_catalog\.btrim\(t\.access_password_hash\), ''\) IS NULL/);
  assert.match(hub, /atomicCbtEnabled \? activeTests\.eq\("is_published", true\) : activeTests/);
  assert.match(guide, /password-based test admission/);
});
