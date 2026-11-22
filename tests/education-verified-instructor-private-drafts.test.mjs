import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  emptyQuestionBank, newQuestion, validateQuestionBank,
  exportQuestionBankJson, parseQuestionBankJson,
} from "../src/lib/educationQuestionBank.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("scripts/sql/staging-education-verified-instructors.sql");
const api = read("src/lib/educationInstructorRpc.ts");
const page = read("src/pages/EducationInstructorStudio.tsx");
const guide = read("docs/EDUCATION_VERIFIED_INSTRUCTOR_STAGING.md");

test("1: approval grants are protected by a separately RLS-enabled table", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.education_instructor_grants/);
  assert.match(sql, /user_id uuid PRIMARY KEY REFERENCES auth\.users/);
  assert.match(sql, /teacher_id uuid NOT NULL UNIQUE REFERENCES public\.teachers/);
  assert.match(sql, /ALTER TABLE public.education_instructor_grants ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public.education_instructor_grants FROM PUBLIC, anon, authenticated/);
});

test("2: only established trusted admins may approve and revoke educators", () => {
  assert.match(sql, /public\.admin_approve_education_instructor\(/);
  assert.match(sql, /public\.admin_revoke_education_instructor\(/);
  assert.ok((sql.match(/NOT public\.is_admin\(\)/g) ?? []).length >= 2);
  assert.match(sql, /FROM auth\.users AS u WHERE u\.id = p_user_id/);
  assert.match(sql, /DELETE FROM public.education_instructor_grants AS g WHERE g.user_id = p_user_id/);
});

test("3: self-selected role and profile metadata cannot grant instructor access", () => {
  const executableSql = sql.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
  assert.doesNotMatch(executableSql, /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE)\s+public\.user_roles\b|\bprofiles\.role\b|raw_user_meta_data|auth\.jwt\(\)/i);
  assert.match(sql, /FROM public\.education_instructor_grants AS g/);
  assert.match(sql, /t\.user_id = g\.user_id/);
  assert.match(sql, /WHERE g\.user_id = \(SELECT auth\.uid\(\)\)/);
});

test("4: direct browser test/question/answer-key writes are denied in staging", () => {
  for (const table of ["tests", "questions", "options"]) {
    assert.match(sql, new RegExp("REVOKE INSERT, UPDATE, DELETE ON public\\." + table + " FROM PUBLIC, anon, authenticated"));
  }
  assert.match(sql, /REVOKE UPDATE \(id, question_id, option_text, is_correct\)/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE) ON public\.(?:tests|questions|options) TO authenticated/);
});

test("5: functions explicitly revoke PUBLIC/anon grants and validate signed-in caller", () => {
  for (const name of [
    "admin_approve_education_instructor","admin_revoke_education_instructor",
    "education_instructor_access","education_instructor_create_draft","education_instructor_list_drafts"
  ]) assert.ok(sql.includes("public." + name + "("));
  assert.ok((sql.match(/SECURITY DEFINER SET search_path = ''/g) ?? []).length >= 5);
  assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION public\./gm) ?? []).length, 5);
  assert.ok((sql.match(/FROM PUBLIC, anon, authenticated/g) ?? []).length >= 5);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.education_instructor_create_draft\(jsonb\) TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION .* TO anon/);
});

test("6: private draft saves never activate or publish a test", () => {
  assert.match(sql, /INSERT INTO public\.tests/);
  assert.match(sql, /\(title, description, duration_minutes, teacher_id, is_active, is_published\)/);
  assert.match(sql, /VALUES \(v_title, v_description, v_duration, v_teacher_id, false, false\)/);
  assert.match(sql, /'status', 'private_draft'/);
  assert.doesNotMatch(sql, /UPDATE public\.tests SET is_published = true/);
});

test("7: server validates version, payload size and bounded bank metadata", () => {
  assert.match(sql, /p_bank->>'version' IS DISTINCT FROM '1'/);
  assert.match(sql, /pg_catalog\.octet_length\(p_bank::text\) > 256000/);
  assert.match(sql, /pg_catalog\.jsonb_array_length\(v_questions\) NOT BETWEEN 1 AND 100/);
  assert.match(sql, /pg_catalog\.char_length\(v_title\) NOT BETWEEN 3 AND 160/);
  assert.match(sql, /v_duration NOT BETWEEN 1 AND 1440/);
});

test("8: server verifies question format, duplicates and appropriate points", () => {
  assert.match(sql, /v_q_id = ANY\(v_ids\)/);
  assert.match(sql, /COALESCE\(v_type, ''\) NOT IN \('multiple_choice','true_false','short_answer'\)/);
  assert.match(sql, /v_points NOT BETWEEN 1 AND 1000/);
  assert.match(sql, /pg_catalog\.char_length\(v_text\) NOT BETWEEN 3 AND 2000/);
  assert.match(sql, /INSERT INTO public\.questions \(test_id, question_text, question_type, points, order_index\)/);
});

test("9: answer-choice correctness cannot be client-forged with invalid format", () => {
  assert.match(sql, /v_option_id = ANY\(v_choice_ids\)/);
  assert.match(sql, /pg_catalog\.jsonb_typeof\(v_option->'correct'\) <> 'boolean'/);
  assert.match(sql, /v_correct_count <> 1/);
  assert.match(sql, /v_type = 'true_false'/);
  assert.match(sql, /pg_catalog\.jsonb_array_length\(v_options\) NOT BETWEEN 2 AND 8/);
  assert.match(sql, /pg_catalog\.char_length\(v_choice_text\) NOT BETWEEN 1 AND 500/);
});

test("10: server draft listings are metadata-only and caller-owned", () => {
  assert.match(sql, /public\.education_instructor_list_drafts\(\)/);
  assert.match(sql, /WHERE teacher_id = v_teacher_id AND is_published IS FALSE AND is_active IS FALSE/);
  assert.match(sql, /ORDER BY created_at DESC LIMIT 50/);
  const listFn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.education_instructor_list_drafts"));
  assert.doesNotMatch(listFn, /'is_correct'|'option_text'|'points_awarded'/);
});

test("11: frontend requires both separate staged feature flags", () => {
  assert.match(api, /atomicCbtEnabled &&/);
  assert.match(api, /VITE_EDUCATION_INSTRUCTOR_RPC === "true"/);
  assert.match(api, /exportQuestionBankJson\(bank, true\)/);
  assert.doesNotMatch(api, /SUPABASE_SECRET|SERVICE_ROLE|apikey:|auth\.admin/);
});

test("12: server responses require verified shape before success", () => {
  assert.match(api, /typeof data\.approved !== "boolean"/);
  assert.match(api, /item\.status !== "private_draft"/);
  assert.match(api, /data\.status !== "private_draft"/);
  assert.match(api, /Number\.isInteger\(data\.question_count\)/);
  assert.match(api, /uuid\.test\(data\.id\)/);
});

test("13: unapproved users are blocked from the upload controls", () => {
  assert.match(page, /accessQuery\.data\?\.approved === false/);
  assert.match(page, /accessQuery\.data\?\.approved === true/);
  assert.match(page, /if \(!instructorRpcEnabled \|\| !accessQuery\.data\?\.approved \|\| !readiness\.valid \|\| serverSaving\) return/);
  assert.match(page, /disabled=\{!readiness\.valid \|\| serverSaving \|\| !!loadingDraftId\}/);
  assert.match(page, /No draft was uploaded/);
});

test("14: account-specific query keys and explicit remote upload feedback", () => {
  assert.match(page, /queryKey: \["education-instructor-access", user\?\.id\]/);
  assert.match(page, /queryKey: \["education-instructor-private-drafts", user\?\.id\]/);
  assert.match(page, /await createInstructorDraft\(bank\)/);
  assert.match(page, /queryClient\.invalidateQueries/);
  assert.match(page, /inactive and unpublished/);
  assert.match(page, /instructorRpcEnabled && \(/);
  assert.match(page, /Local Question Bank Studio/);
});

test("15: local authoring export/import still works without staging RPCs", () => {
  const q = newQuestion("multiple_choice","my-question");
  q.text="Which metal is used for cathodic protection?";
  q.options[0].text="Magnesium";
  q.options[0].correct=true;
  q.options[1].text="Glass";
  const bank={...emptyQuestionBank(),title:"CP Practice",questions:[q]};
  assert.equal(validateQuestionBank(bank).valid,true);
  assert.deepEqual(parseQuestionBankJson(exportQuestionBankJson(bank,true)),bank);
  assert.match(page,/Save draft JSON/);
  assert.match(page,/Export validated bank/);
  assert.match(page,/nothing is automatically saved/);
});

test("16: rollout documentation clearly blocks production authorization claims", () => {
  assert.match(guide,/NOT DEPLOYED/);
  assert.match(guide,/self-selected label is not authorization/);
  assert.match(guide,/two students/i);
  assert.match(guide,/not.*implement.*publishing/i);
  assert.match(guide,/No production database mutations/);
});

test("17: instructor client and authoring page parse as TypeScript/TSX", () => {
  for (const [path,content,kind] of [
    ["src/lib/educationInstructorRpc.ts",api,ts.ScriptKind.TS],
    ["src/pages/EducationInstructorStudio.tsx",page,ts.ScriptKind.TSX]
  ]) {
    const ast=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,kind);
    assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
  }
});

test("18: staging SQL has exactly one complete transaction and no duplicated function definitions", () => {
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION public\./gm) ?? []).length, 5);
  const trailing = sql.split("\nCOMMIT;\n")[1] ?? "";
  assert.ok(trailing.split("\n").every(line => !line.trim() || line.trimStart().startsWith("--")));
  assert.doesNotMatch(sql.split("\nCOMMIT;\n")[1], /\bINSERT INTO\b|\bCREATE OR REPLACE FUNCTION\b/i);
});
