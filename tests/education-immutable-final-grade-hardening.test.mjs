import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const staged=read("scripts/sql/staging-education-immutable-final-grade-records.sql");
const tests=read("tests/sql/education-db-immutable-final-grades.sql");
const workflow=read(".github/workflows/education-postgres-security.yml");
const guide=read("docs/EDUCATION_IMMUTABLE_FINAL_GRADE_HARDENING.md");
const block=(table,action)=>new RegExp(
  "BEFORE "+action+" ON public\\."+table.replaceAll("_","_"));
test("1. Staging hardening is review-only, transactional and never a production migration",()=>{
  assert.match(staged,/STAGING\/REVIEW ONLY/);
  assert.match(staged,/BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(workflow,/supabase db push|supabase functions deploy/);
  assert.match(guide,/NOT DEPLOYED/);
});
test("2. Official grade ledger rejects UPDATE and DELETE regardless of caller",()=>{
  assert.match(staged,/education_block_final_grade_ledger_rewrite/);
  assert.match(staged,/BEFORE UPDATE OR DELETE ON public\.education_final_grades/);
  assert.match(staged,/append-only/);
  assert.match(staged,/ERRCODE = '22023'/);
});
test("3. Finalized attempt records forbid both grade edits and status rollback",()=>{
  assert.match(staged,/education_block_finalized_attempt_change/);
  assert.match(staged,/BEFORE UPDATE OR DELETE ON public\.user_attempts/);
  assert.match(staged,/Official|Finalized Education attempt/);
  assert.match(tests,/SET score=999/);
  assert.match(tests,/SET status='in_progress'/);
});
test("4. Post-finalized answer records cannot be inserted, modified or deleted",()=>{
  assert.match(staged,/BEFORE INSERT OR UPDATE OR DELETE ON public\.user_answers/);
  assert.match(staged,/Finalized Education answer cannot be modified/);
  assert.match(tests,/Attempted illegal late insertion/);
});
test("5. Answer changes wait for attempt lock to close finalization race",()=>{
  assert.match(staged,/FOR UPDATE OF a/);
  assert.match(staged,/WHERE a\.id = v_attempt_id/);
  assert.match(staged,/education_final_grades AS f/);
});
test("6. Attempt and answer identity reassignment is denied",()=>{
  assert.match(staged,/NEW\.id IS DISTINCT FROM OLD\.id/);
  assert.match(staged,/NEW\.attempt_id IS DISTINCT FROM OLD\.attempt_id/);
  assert.match(staged,/ownership cannot be reassigned/);
});
test("7. No-op privileged UPDATE is rejected to prevent audit tampering",()=>{
  assert.match(tests,/SET score=score/);
  assert.match(tests,/SET points_awarded=points_awarded/);
});
test("8. Bulk ledger, attempt and answer TRUNCATE paths all have guards",()=>{
  for(const triggerName of [
    "education_block_grade_truncate",
    "education_block_attempt_truncate",
    "education_block_answer_truncate",
  ])assert.ok(staged.includes("CREATE TRIGGER "+triggerName));
  assert.match(staged,/BEFORE TRUNCATE ON public\.education_final_grades/);
  assert.match(staged,/BEFORE TRUNCATE ON public\.user_attempts/);
  assert.match(staged,/BEFORE TRUNCATE ON public\.user_answers/);
  assert.match(tests,/TRUNCATE TABLE public\.user_attempts CASCADE/);
  assert.match(tests,/TRUNCATE TABLE public\.user_answers CASCADE/);
});
test("9. Existing verified-instructor review freeze is retained and exercised",()=>{
  assert.match(tests,/UPDATE public\.education_written_reviews/);
  assert.match(tests,/DELETE FROM public\.education_written_reviews/);
  assert.match(tests,/INSERT INTO public\.education_written_reviews/);
  assert.doesNotMatch(staged,/DROP TRIGGER.*education_lock_final_review/);
});
test("10. Trigger owner helpers are not callable by student, anon or service role",()=>{
  assert.match(staged,/REVOKE ALL ON FUNCTION public\.education_block_final_grade_ledger_rewrite\(\)/);
  assert.match(staged,/FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(tests,/has_function_privilege\('authenticated'/);
  assert.match(tests,/has_function_privilege\('service_role'/);
});
test("11. PostgreSQL fixtures assert all six triggers exist and are enabled",()=>{
  assert.match(tests,/pg_catalog\.pg_trigger/);
  assert.match(tests,/t\.tgenabled='O'/);
  assert.match(tests,/n\.nspname='public'/);
});
test("12. Tamper helper only accepts exact deliberate integrity rejection code",()=>{
  assert.match(tests,/CREATE OR REPLACE FUNCTION public\.education_ci_expect_locked/);
  assert.match(tests,/EXCEPTION WHEN SQLSTATE '22023' THEN/);
  assert.match(tests,/DROP FUNCTION public\.education_ci_expect_locked\(text\)/);
});
test("13. Disposable SQL CI installs hardening before new legitimate finalization and tests tamper after",()=>{
  const first=workflow.indexOf("education-db-verified-results.sql");
  const stagedAt=workflow.indexOf("staging-education-immutable-final-grade-records.sql");
  const journey=workflow.indexOf("education-db-full-journey.sql");
  const hardenedTests=workflow.indexOf("education-db-immutable-final-grades.sql");
  const destroy=workflow.indexOf("Destroy temporary database");
  assert(first>0&&stagedAt>first&&journey>stagedAt&&hardenedTests>journey&&destroy>hardenedTests);
  assert.match(workflow,/--network none/);
  assert.match(workflow,/if: always\(\)/);
});
test("14. The legitimate service role can retry without rewriting the official grade",()=>{
  assert.match(tests,/SET ROLE service_role/);
  assert.match(tests,/already_finalized/);
  assert.match(tests,/Official exam|official score/);
});
test("15. Owner-student verified receipt remains exactly five keys and correct",()=>{
  assert.match(tests,/education_student_verified_result/);
  assert.match(tests,/jsonb_object_keys\(r\)/);
  assert.match(tests,/r->>'score'<>'7'/);
});
test("16. An unfinalized active attempt remains editable; locks are not global",()=>{
  assert.match(tests,/is_mobile_locked = NOT is_mobile_locked/);
  assert.match(tests,/status='in_progress'/);
});
test("17. Integrity test checks grades remain unchanged after deliberate tamper",()=>{
  assert.match(tests,/FROM public\.education_final_grades\)<>6/);
  assert.match(tests,/WHERE attempt_id=pg_catalog\.current_setting\('eternyx\.locked_b'\)::uuid\)<>6/);
  assert.match(tests,/23 immutable-final-grade SQL checks passed/);
});
test("18. No production or account-wide erasure is silently authorized",()=>{
  assert.match(guide,/retention|erasure/i);
  assert.match(guide,/superuser/i);
  assert.match(guide,/staging/i);
  assert.match(guide,/production/i);
  assert.doesNotMatch(staged,/SET\s+session_replication_role|DISABLE TRIGGER|TRUNCATE public\./);
});
test("19. Source-controlled SQL and workflow contain no embedded privileged keys",()=>{
  assert.doesNotMatch(staged,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY/);
  assert.doesNotMatch(tests,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY/);
});
test("20. Every source script has meaningful statements, not placeholder assertions",()=>{
  for(const token of ["CREATE TRIGGER","FOR EACH ROW","BEFORE TRUNCATE","FOR EACH STATEMENT","RAISE EXCEPTION"])
    assert.ok(staged.includes(token),token);
  assert((tests.match(/SELECT public\.education_ci_expect_locked\(/g)||[]).length>=18);
});
