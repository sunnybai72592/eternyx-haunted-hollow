import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  newQuestion, validateQuestionBank, parseQuestionBankJson,
  exportQuestionBankJson,
} from "../src/lib/educationQuestionBank.mjs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const base = read("scripts/sql/staging-education-verified-instructors.sql");
const sql = read("scripts/sql/staging-education-instructor-draft-recovery.sql");
const api = read("src/lib/educationInstructorRpc.ts");
const studio = read("src/pages/EducationInstructorStudio.tsx");
const guide = read("docs/EDUCATION_INSTRUCTOR_DRAFT_REVISIONS.md");

test("1: staged instructor SQL duration and points checks have complete regex delimiters", () => {
  assert.ok(base.includes("COALESCE(p_bank->>'duration_minutes', '') !~ '^[0-9]{1,4}$' THEN"));
  assert.ok(base.includes("COALESCE(v_question->>'points', '') !~ '^[0-9]{1,4}$'"));
  const lines = base.split("\n").filter(l => l.includes("!~ '^[0-9]{1,4}"));
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l.includes("$'")));
});

test("2: base and recovery staging SQL are each one complete transaction", () => {
  for(const [name, source, count] of [["base",base,5],["recovery",sql,1]]) {
    assert.equal((source.match(/^BEGIN;$/gm) || []).length, 1, name);
    assert.equal((source.match(/^COMMIT;$/gm) || []).length, 1, name);
    assert.equal((source.match(/^CREATE OR REPLACE FUNCTION public\./gm) || []).length, count, name);
    assert.equal((source.match(/^AS \$fn\$$/gm) || []).length, count, name);
    assert.equal((source.match(/^\$fn\$;$/gm) || []).length, count, name);
    assert.equal(source.split("\nCOMMIT;\n").length, 2);
  }
});

test("3: draft retrieval is explicitly stage-only and not an auto-run migration", () => {
  assert.match(sql, /STAGING ONLY/);
  assert.match(sql, /Do NOT deploy this script to production/);
  assert.match(guide, /NOT DEPLOYED/);
  assert.match(guide, /Public CBT security remains BLOCKED/);
});

test("4: load function requires authenticated user and verified instructor grant", () => {
  assert.match(sql, /FUNCTION public\.education_instructor_load_draft\(p_test_id uuid\)/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /IF \(SELECT auth\.uid\(\)\) IS NULL OR p_test_id IS NULL/);
  assert.match(sql, /FROM public\.education_instructor_grants AS g/);
  assert.match(sql, /JOIN public\.teachers AS t ON t\.id = g\.teacher_id AND t\.user_id = g\.user_id/);
  assert.match(sql, /WHERE g\.user_id = \(SELECT auth\.uid\(\)\)/);
});

test("5: loads must own the precise private test and cannot reveal started exams", () => {
  assert.match(sql, /test\.id = p_test_id AND test\.teacher_id = v_teacher_id/);
  assert.match(sql, /test\.is_active IS FALSE AND test\.is_published IS FALSE/);
  assert.match(sql, /NOT EXISTS \([\s\S]*?FROM public\.user_attempts AS a WHERE a\.test_id = test\.id/);
  assert.match(sql, /Private draft not accessible/);
});

test("6: answer keys are returned only in this instructor RPC, not learner routes", () => {
  assert.match(sql, /'correct', v_option\.is_correct/);
  assert.match(sql, /SELECT o\.id, o\.option_text, o\.is_correct/);
  assert.doesNotMatch(studio, /\.from\(["']options["']\)|\.select\(["']is_correct["']\)/);
  assert.match(studio, /loadInstructorDraft\(draftId\)/);
  assert.match(guide, /This RPC is instructor-only/);
});

test("7: question ordering and true/false labels are preserved when reconstructing drafts", () => {
  assert.match(sql, /ORDER BY q\.order_index ASC, q\.id ASC/);
  assert.match(sql, /pg_catalog\.lower\(o\.option_text\) = 'true' THEN 0/);
  assert.match(sql, /pg_catalog\.lower\(o\.option_text\) = 'false' THEN 1/);
  assert.match(sql, /ELSE 2[\s\S]{0,70}o\.id ASC/);
  assert.match(guide, /stable UUID order/);
});

test("8: server returns a bounded versioned bank, never an executable mutation", () => {
  assert.match(sql, /'version', 1/);
  assert.match(sql, /'duration_minutes', v_test\.duration_minutes/);
  assert.match(sql, /'questions', v_questions/);
  assert.match(sql, /jsonb_array_length\(v_questions\) NOT BETWEEN 1 AND 100/);
  assert.match(sql, /pg_catalog\.octet_length\(v_bank::text\) > 256000/);
  assert.match(sql, /'status', 'private_draft'/);
  assert.doesNotMatch(sql, /DELETE FROM public\.|UPDATE public\.|INSERT INTO public\./);
});

test("9: student and anonymous cannot execute recovery function", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.education_instructor_load_draft\(uuid\)/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.education_instructor_load_draft\(uuid\)/);
  assert.match(sql, /TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION .* TO anon/);
});

test("10: frontend retrieval is staging gated and validates the exact requested ID", () => {
  assert.match(api, /if \(!instructorRpcEnabled\) throw new Error/);
  assert.match(api, /if \(!uuid\.test\(draftId\)\)/);
  assert.match(api, /"education_instructor_load_draft", \{ p_test_id: draftId \}/);
  assert.match(api, /data\.id !== draftId/);
  assert.match(api, /data\.status !== "private_draft"/);
  assert.match(api, /parseQuestionBankJson\(JSON\.stringify\(data\.bank\)\)/);
});

test("11: malformed or unknown bank data is rejected before entering authoring state", () => {
  const question = newQuestion("multiple_choice","11111111-1111-4111-8111-111111111111");
  question.text="Which is an anode material?";
  question.options[0].text="Magnesium";question.options[0].correct=true;
  question.options[1].text="Plastic";
  const bank = {version:1,title:"Corrosion training",description:"Field practice",duration_minutes:20,questions:[question]};
  assert.equal(validateQuestionBank(bank).valid,true);
  const restored=parseQuestionBankJson(exportQuestionBankJson(bank,true));
  assert.deepEqual(restored,bank);
  assert.throws(()=>parseQuestionBankJson(JSON.stringify({...bank, questions:[{...question,options:[{id:"bad",text:"x",correct:"yes"}]}]})));
});

test("12: the UI requires approval and prompts before losing local unsaved edits", () => {
  assert.match(studio, /if \(!instructorRpcEnabled \|\| !accessQuery\.data\?\.approved \|\| loadingDraftId \|\| serverSaving\) return/);
  assert.match(studio, /window\.confirm\("Load this private instructor draft\?/);
  assert.match(studio, /Export local JSON first if needed/);
  assert.match(studio, /Load for revision/);
  assert.match(studio, /loadingDraftId === draft\.id/);
});

test("13: loading a private draft restores every editor dimension and error state", () => {
  assert.match(studio, /const draft = await loadInstructorDraft\(draftId\)/);
  assert.match(studio, /resetEditor\(draft\.bank as Bank\)/);
  assert.match(studio, /setActiveId\(draft\.bank\.questions\[0\]\?\.id \?\? null\)/);
  assert.match(studio, /setMode\("edit"\)/);
  assert.match(studio, /Private draft could not be loaded/);
  assert.match(studio, /setLoadingDraftId\(null\)/);
});

test("14: saving a revision explicitly creates a new private draft instead of overwriting", () => {
  assert.match(studio, /await createInstructorDraft\(bank\)/);
  assert.match(studio, /Save as new private draft/);
  assert.match(studio, /the original is preserved/);
  assert.match(guide, /The original server draft is never overwritten or deleted/);
  assert.doesNotMatch(studio, /updateInstructorDraft|deleteInstructorDraft/);
});

test("15: switching accounts clears server-loaded answer keys from UI state", () => {
  assert.match(studio, /currentUserRef\.current === user\?\.id/);
  assert.match(studio, /useLayoutEffect\(\(\) => \{/);
  assert.match(studio, /resetEditor\(emptyQuestionBank\(\) as Bank\)/);
  assert.match(studio, /setSourceDraftId\(null\)/);
  assert.match(studio, /Editor cleared after the account changed/);
  assert.match(studio, /historyController\.reset\(next\)/);
});

test("16: local JSON editing is available with staging disabled", () => {
  assert.match(api, /atomicCbtEnabled &&/);
  assert.match(api, /VITE_EDUCATION_INSTRUCTOR_RPC === "true"/);
  assert.match(studio, /Save draft JSON/);
  assert.match(studio, /Export validated bank/);
  assert.match(studio, /handleImport/);
  assert.match(studio, /instructorRpcEnabled && \(/);
});

test("17: source records only revision lineage, not mutable server editing", () => {
  assert.match(studio, /sourceDraftId\.slice\(0, 8\)/);
  assert.match(studio, /Revisions are saved as new drafts, never in place/);
  assert.match(studio, /setSourceDraftId\(created\.id\)/);
  assert.match(studio, /setSourceDraftId\(null\)/);
});

test("18: release notes explicitly deny production readiness and flag security obligations", () => {
  assert.match(guide, /isolated staging database/);
  assert.match(guide, /two approved instructors, two students/);
  assert.match(guide, /student query to options\.is_correct/);
  assert.match(guide, /No live Supabase changes/);
});

test("19: changed TypeScript and TSX files still parse", () => {
  for(const [file,source,kind] of [
    ["educationInstructorRpc.ts",api,ts.ScriptKind.TS],
    ["EducationInstructorStudio.tsx",studio,ts.ScriptKind.TSX],
  ]) {
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind);
    assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
  }
});
