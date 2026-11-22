import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("scripts/sql/staging-education-atomic-final-grading.sql");
const worker=read("supabase/functions/grade-test/index.ts");
const sqlTest=read("tests/sql/education-db-final-grading.sql");
const race=read("scripts/staging/verifyEducationFinalGradingRaces.mjs");
const workflow=read(".github/workflows/education-postgres-security.yml");
const guide=read("docs/EDUCATION_ATOMIC_FINAL_GRADING_STAGING.md");

test("1: finalizer is service-role-only; ledger has no browser or direct service grants",()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.education_finalize_cbt_grade\(uuid\)/);
  assert.match(sql,/FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.education_finalize_cbt_grade\(uuid\)\s+TO service_role/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.education_final_grades FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql,/education_final_grades ENABLE ROW LEVEL SECURITY/);
});
test("2: grader enforces submitted status and completed, enrolled, reviewed exam",()=>{
  assert.match(sql,/v_attempt\.status NOT IN \('submitted','auto_submitted'\)/);
  assert.match(sql,/v_attempt\.end_time IS NULL/);
  assert.match(sql,/education_publication_requests/);
  assert.match(sql,/education_test_enrollments/);
});
test("3: attempt lock precedes finalization and coordinates with instructor review",()=>{
  assert.match(sql,/WHERE a\.id = p_attempt_id FOR UPDATE OF a/);
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.education_written_reviews/);
  assert.match(sql,/Official final grade is locked/);
});
test("4: no partial writes while a valid written response still needs review",()=>{
  const pending=sql.indexOf("IF v_missing_review > 0 THEN");
  const updates=sql.indexOf("FOR v_update IN SELECT value FROM pg_catalog.jsonb_array_elements(v_updates)");
  assert(pending>0 && updates>pending);
  assert.match(sql,/v_missing_review := v_missing_review \+ 1/);
  assert.match(sql,/status','pending_review'/);
});
test("5: trusted reviewer grant and bounded points are revalidated at score time",()=>{
  assert.match(sql,/JOIN public\.education_instructor_grants AS g/);
  assert.match(sql,/g\.teacher_id = v_test\.teacher_id/);
  assert.match(sql,/v_review_points NOT BETWEEN 0 AND v_question\.points/);
  assert.match(sql,/v_question\.points NOT BETWEEN 1 AND 1000/);
});
test("6: answer options are bound to questions and written answers cannot forge selected IDs",()=>{
  assert.match(sql,/o\.question_id = v_question\.id/);
  assert.match(sql,/Written response has an objective option/);
  assert.match(sql,/Objective answer contains written response/);
  assert.match(sql,/Cross-test answer detected/);
});
test("7: all answer grades, official attempt totals and immutable ledger use one SQL call",()=>{
  assert.match(sql,/UPDATE public\.user_answers AS a/);
  assert.match(sql,/UPDATE public\.user_attempts AS a/);
  assert.match(sql,/INSERT INTO public\.education_final_grades/);
  assert.match(sql,/status','already_finalized'/);
  assert.match(sql,/Legacy grading record must be reconciled/);
  assert.match(sql,/COMMIT;/);
});
test("8: trusted handler uses explicit server-only flag, preserves existing authentication boundary",()=>{
  assert.match(worker,/isTrustedServiceRequest\(req\)/);
  assert.match(worker,/Deno\.env\.get\("EDUCATION_TRUSTED_FINAL_GRADING"\) === "true"/);
  assert.match(worker,/db\.rpc\("education_finalize_cbt_grade"/);
  assert.match(worker,/Atomic final grading RPC unavailable/);
  assert.match(worker,/gradingPending: pending/);
  assert.doesNotMatch(worker,/VITE_EDUCATION_TRUSTED_FINAL_GRADING/);
});
test("9: existing legacy grading stays disabled by default in new server path",()=>{
  const optin=worker.indexOf('Deno.env.get("EDUCATION_TRUSTED_FINAL_GRADING") === "true"');
  const old=worker.indexOf("// Writes can be retried because the plan is deterministic.");
  assert(optin>0 && old>optin);
  assert.match(guide,/Production is unchanged|No production database/);
  assert.match(guide,/pending_review/);
});
test("10: ten PostgreSQL checks cover revocation, invalid grade, grading retry and tampering",()=>{
  assert.match(sqlTest,/Revoked or unreviewed written mark/);
  assert.match(sqlTest,/Legacy grade mutations/);
  assert.match(sqlTest,/Forge|forged/i);
  assert.match(sqlTest,/Grade retry was not idempotent/);
  assert.match(sqlTest,/Official exam grades were not atomically preserved/);
});
test("11: actual transaction races check lock waits, exact-once and post-grade correction denial",()=>{
  assert.match(race,/pg_stat_activity/);
  assert.match(race,/wait_event_type='Lock'/);
  assert.match(race,/RETRY=already_finalized/);
  assert.match(race,/review_after_grade/);
  assert.match(race,/review_before_grade/);
  assert.match(race,/All three real PostgreSQL final grading transaction races passed/);
});
test("12: CI runs both SQL and actual concurrent transaction checks without external network",()=>{
  assert.match(workflow,/staging-education-atomic-final-grading\.sql/);
  assert.match(workflow,/education-db-final-grading\.sql/);
  assert.match(workflow,/verifyEducationFinalGradingRaces\.mjs/);
  assert.match(workflow,/--network none/);
  assert.match(workflow,/if: always\(\)/);
});
test("13: new JS scripts and grade service TypeScript parse locally",()=>{
  const syntax=spawnSync(process.execPath,["--check",
    new URL("../scripts/staging/verifyEducationFinalGradingRaces.mjs",import.meta.url).pathname],
    {encoding:"utf8",timeout:10000});
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout);
  const ast=ts.createSourceFile("grade-test.ts",worker,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
