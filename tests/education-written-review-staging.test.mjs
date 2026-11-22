import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url),"utf8");
const sql = read("scripts/sql/staging-education-written-review.sql");
const fixture = read("tests/sql/education-db-written-review.sql");
const client = read("src/lib/educationWrittenReviewRpc.ts");
const panel = read("src/components/education/EducationWrittenReviewPanel.tsx");
const page = read("src/pages/EducationInstructorStudio.tsx");
const ci = read(".github/workflows/education-postgres-security.yml");

test("verified instructor review is separately enabled and defaults off", () => {
  assert.match(client,/VITE_EDUCATION_WRITTEN_REVIEW_RPC === "true"/);
  assert.match(client,/publicationRpcEnabled/);
  assert.match(client,/if \(!writtenReviewEnabled\)/);
  assert.match(page,/accessQuery\.data\?\.approved === true/);
  assert.match(page,/EducationWrittenReviewPanel key=\{user\.id\}/);
});
test("server holds review marks in a protected, RLS-enabled table", () => {
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.education_written_reviews/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.education_written_reviews FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql,/CREATE POLICY.*education_written_reviews/);
});
test("ownership and approval must be rechecked by both server RPCs", () => {
  assert.equal((sql.match(/FROM public\.education_instructor_grants AS g/g)||[]).length,2);
  assert.equal((sql.match(/t\.id = g\.teacher_id AND t\.user_id = g\.user_id/g)||[]).length,2);
  assert.match(sql,/t\.teacher_id = v_teacher_id/);
  assert.match(sql,/status IN \('submitted','auto_submitted'\)/);
  assert.match(sql,/p\.status = 'approved'/);
});
test("review RPC cannot finalize scores or grade fields directly", () => {
  assert.match(sql,/official_score_updated', false/);
  assert.doesNotMatch(sql,/UPDATE public\.user_attempts|UPDATE public\.user_answers/);
  assert.match(fixture,/falsely finalized a learner grade/);
  assert.match(fixture,/points_awarded FROM public\.user_answers/);
});
test("review uses attempt then answer locks and limits points to question maximum",()=>{
  assert.match(sql,/FOR UPDATE OF ua/);
  assert.match(sql,/FOR UPDATE OF a/);
  assert.match(sql,/p_points > v_possible/);
  assert.match(sql,/p_points IS NULL OR p_points < 0 OR p_points > 1000/);
  assert.match(sql,/btrim\(COALESCE\(v_answer\.short_answer_text,''\)\)/);
});
test("review duplicate request is idempotent, changed score requires deliberate update",()=>{
  assert.match(sql,/ON CONFLICT \(answer_id\) DO UPDATE/);
  assert.match(sql,/WHERE mr\.points_awarded IS DISTINCT FROM EXCLUDED\.points_awarded/);
  assert.match(fixture,/Identical review updated audit timestamp/);
  assert.match(fixture,/Instructor correction was not persisted/);
});
test("anonymous, students, unapproved instructors and other instructors are rejected",()=>{
  assert.match(fixture,/Anonymous|anon/);
  assert.match(fixture,/Student|student/);
  assert.match(fixture,/unapproved instructor/i);
  assert.match(fixture,/Instructor B/);
  assert.match(fixture,/Revoking a verified instructor removes access immediately/);
});
test("staging CI applies isolated review script and executes real role checks",()=>{
  assert.match(ci,/staging-education-written-review\.sql/);
  assert.match(ci,/education-db-written-review\.sql/);
  assert.match(ci,/--network none/);
  assert.match(ci,/Destroy temporary database/);
});
test("browser shows response and bounded rubric without claiming final score",()=>{
  assert.match(panel,/queryKey: \["education-written-review-queue", userId\]/);
  assert.match(panel,/reviewed_points/);
  assert.match(panel,/Number\.isInteger\(points\)/);
  assert.match(panel,/saveWrittenReview\(answerId, points\)/);
  assert.match(panel,/Official grade remains pending/);
  assert.match(panel,/onClick=\{\(\) => void save\(/);
});
test("client validates every server row and never trusts unconfirmed mark",()=>{
  assert.match(client,/validRow/);
  assert.match(client,/rows\.some\(r => !validRow\(r\)\)/);
  assert.match(client,/r\.official_score_updated !== false/);
  assert.match(client,/r\.points_awarded !== points/);
});
test("all React/TypeScript sources parse without syntax errors",()=>{
  for(const [name, source, kind] of [
    ["educationWrittenReviewRpc.ts",client,ts.ScriptKind.TS],
    ["EducationWrittenReviewPanel.tsx",panel,ts.ScriptKind.TSX],
    ["EducationInstructorStudio.tsx",page,ts.ScriptKind.TSX],
  ]){
    const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind);
    assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],name);
  }
});
