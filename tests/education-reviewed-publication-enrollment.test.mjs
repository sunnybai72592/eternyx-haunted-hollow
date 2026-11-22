import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = p => readFileSync(new URL("../" + p, import.meta.url),"utf8");
const sql = read("scripts/sql/staging-education-publication-enrollment.sql");
const atomic = read("scripts/sql/staging-education-cbt-atomic-security.sql");
const rpc = read("src/lib/educationPublicationRpc.ts");
const hub = read("src/pages/Education.tsx");
const instructor = read("src/pages/EducationInstructorStudio.tsx");
const admin = read("src/pages/EducationPublicationAdmin.tsx");
const routes = read("src/App.tsx");
const overview = read("src/pages/AdminOverview.tsx");
const doc = read("docs/EDUCATION_STAGED_PUBLICATION_ENROLLMENT.md");

test("1: all new database changes remain staging-only and are one transaction", () => {
  assert.match(sql, /STAGING ONLY/);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length,1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length,1);
  assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION public\./gm) || []).length,7);
  assert.match(doc, /NO live Supabase operations/);
});

test("2: publication and enrollment tables deny direct browser role access", () => {
  for (const name of ["education_publication_requests","education_test_enrollments"]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS public\\."+name));
    assert.match(sql, new RegExp("ALTER TABLE public\\."+name+" ENABLE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("REVOKE ALL ON public\\."+name+" FROM PUBLIC, anon, authenticated"));
  }
  assert.match(sql,/PRIMARY KEY \(test_id, user_id\)/);
  assert.match(sql,/CHECK \(status IN \('pending','approved','rejected'\)\)/);
});

test("3: instructor publication request requires approved grant and matching teacher ownership",()=>{
  assert.match(sql,/FUNCTION public.education_request_publication\(p_test_id uuid\)/);
  assert.match(sql,/FROM public.education_instructor_grants AS g/);
  assert.match(sql,/JOIN public.teachers AS t ON t.id = g.teacher_id AND t.user_id = g.user_id/);
  assert.match(sql,/t.id = p_test_id AND t.teacher_id = v_teacher_id/);
  assert.match(sql,/education_publication_ready\(p_test_id\)/);
  assert.match(sql,/RETURN pg_catalog.jsonb_build_object\('test_id', p_test_id, 'status', 'pending'\)/);
});

test("4: ready check excludes unpublished invalid drafts and already started exams",()=>{
  assert.match(sql,/t.is_active IS FALSE AND t.is_published IS FALSE/);
  assert.match(sql,/duration_minutes BETWEEN 1 AND 1440/);
  assert.match(sql,/nullif\(pg_catalog.btrim\(t.access_password_hash\), ''\) IS NULL/);
  assert.match(sql,/NOT EXISTS \(SELECT 1 FROM public.user_attempts AS a WHERE a.test_id = t.id\)/);
  assert.match(sql,/v_count NOT BETWEEN 1 AND 100/);
});

test("5: objective answer keys and written question forms are validated on server",()=>{
  assert.match(sql,/q.question_type NOT IN \('multiple_choice','true_false','short_answer'\)/);
  assert.match(sql,/q.points NOT BETWEEN 1 AND 1000/);
  assert.match(sql,/o.is_correct IS TRUE\) <> 1/);
  assert.match(sql,/q.question_type = 'short_answer' AND EXISTS/);
  assert.match(sql,/pg_catalog.lower\(pg_catalog.btrim\(o.option_text\)\) = 'true'/);
  assert.match(sql,/pg_catalog.lower\(pg_catalog.btrim\(o.option_text\)\) = 'false'/);
});

test("6: admin decisions are independently authorized, serialized and audit recorded",()=>{
  assert.match(sql,/FUNCTION public.education_admin_review_publication/);
  assert.ok((sql.match(/NOT public.is_admin\(\)/g) || []).length >=4);
  assert.match(sql,/WHERE t.id = p_test_id FOR UPDATE OF t/);
  assert.match(sql,/r.status = 'pending' FOR UPDATE OF r/);
  assert.match(sql,/reviewed_at = clock_timestamp\(\), reviewed_by = \(SELECT auth.uid\(\)\)/);
  assert.match(sql,/SET is_active = true, is_published = true/);
});

test("7: approval requires current approved instructor and not just prior request",()=>{
  assert.match(sql,/FROM public.education_instructor_grants AS g/);
  assert.match(sql,/WHERE g.teacher_id = v_request.teacher_id/);
  assert.match(sql,/v_test.teacher_id IS DISTINCT FROM v_request.teacher_id/);
  assert.match(sql,/Draft is not eligible for approval/);
});

test("8: only admin can enroll an existing auth user in approved published exam",()=>{
  assert.match(sql,/FUNCTION public.education_admin_enroll_student/);
  assert.match(sql,/FROM auth.users AS u WHERE u.id = p_user_id/);
  assert.match(sql,/t.is_published IS TRUE AND t.is_active IS TRUE/);
  assert.match(sql,/r.status = 'approved'/);
  assert.match(sql,/ON CONFLICT \(test_id, user_id\) DO NOTHING/);
});

test("9: revocation is impossible once student starts an attempt",()=>{
  assert.match(sql,/FUNCTION public.education_admin_revoke_enrollment/);
  assert.match(sql,/FROM public.user_attempts AS a/);
  assert.match(sql,/a.test_id = p_test_id AND a.user_id = p_user_id/);
  assert.match(sql,/Enrollment cannot be changed after starting an attempt/);
  assert.match(sql,/DELETE FROM public.education_test_enrollments AS e/);
});

test("10: only enrolled students receive allowed catalog metadata, never answers",()=>{
  const start=sql.indexOf("CREATE OR REPLACE FUNCTION public.education_student_enrolled_catalog()");
  const end=sql.indexOf("-- Narrow legacy question browsing policy",start);
  const block=sql.slice(start,end);
  assert.match(block,/JOIN public.education_test_enrollments AS e ON e.test_id = t.id/);
  assert.match(block,/e.user_id = \(SELECT auth.uid\(\)\)/);
  assert.match(block,/t.is_published IS TRUE AND t.is_active IS TRUE/);
  assert.doesNotMatch(block,/is_correct|answer_key|points_awarded/);
  assert.match(block,/LIMIT 100/);
});

test("11: student question RLS drops legacy active-test-only public access",()=>{
  assert.match(sql,/DROP POLICY IF EXISTS "Users can view questions for their attempts" ON public.questions/);
  assert.match(sql,/CREATE POLICY "Students can view enrolled published questions"/);
  assert.match(sql,/e.test_id = questions.test_id AND e.user_id = \(SELECT auth.uid\(\)\)/);
  assert.match(sql,/t.is_active IS TRUE AND t.is_published IS TRUE/);
});

test("12: staged atomic CBT requires approved request and enrolled user before starting",()=>{
  assert.match(atomic,/FROM public.education_test_enrollments AS e/);
  assert.match(atomic,/JOIN public.education_publication_requests AS r ON r.test_id = e.test_id/);
  assert.match(atomic,/e.test_id = t.id AND e.user_id = v_user AND r.status = 'approved'/);
  assert.match(doc,/atomic start RPC now requires an approved publication request AND a matching student enrollment/);
});

test("13: internal readiness has no browser EXECUTE grant; all public RPCs explicitly revoke anonymous EXECUTE",()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION public.education_publication_ready\(uuid\)/);
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public.education_publication_ready/);
  for(const name of ["education_request_publication","education_admin_publication_queue","education_admin_review_publication","education_admin_enroll_student","education_admin_revoke_enrollment","education_student_enrolled_catalog"]) {
    assert.match(sql,new RegExp("REVOKE ALL ON FUNCTION public\\."+name+"\\("));
    assert.match(sql,new RegExp("GRANT EXECUTE ON FUNCTION public\\."+name+"\\("));
  }
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION .* TO anon/);
});

test("14: browser requires three staging flags, and every RPC result is checked",()=>{
  assert.match(rpc,/instructorRpcEnabled &&/);
  assert.match(rpc,/VITE_EDUCATION_PUBLICATION_RPC === "true"/);
  assert.match(rpc,/if \(!publicationRpcEnabled\) throw new Error/);
  assert.match(rpc,/if \(result\?\.test_id !== testId \|\| result\?\.status !== "pending"\)/);
  assert.match(rpc,/result\?\.status !== \(approve \? "approved" : "rejected"\)/);
  assert.match(rpc,/if \(typeof result !== "boolean"\)/);
});

test("15: staged Education catalog is account-scoped and validates server metadata",()=>{
  assert.match(hub,/if \(publicationRpcEnabled\) return await listEnrolledEducationTests\(\)/);
  assert.match(hub,/queryKey: \["education-active-tests", user\?\.id\]/);
  assert.match(rpc,/normalizeEducationTest/);
  assert.match(rpc,/Invalid enrolled assessment metadata/);
});

test("16: only approved instructor UI requests a review, never publishes",()=>{
  assert.match(instructor,/if \(!publicationRpcEnabled \|\| !accessQuery.data\?\.approved/);
  assert.match(instructor,/await requestEducationPublication\(draftId\)/);
  assert.match(instructor,/Request publication review/);
  assert.match(instructor,/will not make it available to students/);
  assert.doesNotMatch(instructor,/reviewEducationPublication\(/);
});

test("17: admin UI checks admin role before showing actionable review/enrollment",()=>{
  assert.match(admin,/supabase.rpc\("is_admin"\)/);
  assert.match(admin,/publicationRpcEnabled && isAdmin/);
  assert.match(admin,/reviewEducationPublication\(id, approve\)/);
  assert.match(admin,/enrollEducationStudent\(testId.trim\(\), studentId.trim\(\)\)/);
  assert.match(admin,/revokeEducationEnrollment\(testId.trim\(\), studentId.trim\(\)\)/);
  assert.match(admin,/window.confirm\(/);
});

test("18: admin route and navigation are staged behind feature switch",()=>{
  assert.match(routes,/path="\/admin\/education" element=\{<RequireAuth><EducationPublicationAdmin \/><\/RequireAuth>\}/);
  assert.match(overview,/publicationRpcEnabled && <div/);
  assert.match(overview,/to="\/admin\/education"/);
  assert.match(doc,/all three/);
});

test("19: all new TypeScript or TSX sources parse",()=>{
  for(const [name,source,kind] of [
    ["educationPublicationRpc.ts",rpc,ts.ScriptKind.TS],
    ["EducationPublicationAdmin.tsx",admin,ts.ScriptKind.TSX],
    ["EducationInstructorStudio.tsx",instructor,ts.ScriptKind.TSX],
    ["Education.tsx",hub,ts.ScriptKind.TSX],
  ]) {
    const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind);
    assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],name);
  }
});

test("20: exam start and enrollment revocation lock the same row", () => {
  assert.match(atomic,/PERFORM 1 FROM public.education_test_enrollments AS e/);
  assert.match(atomic,/FOR SHARE OF e/);
  assert.match(sql,/PERFORM 1 FROM public.education_test_enrollments AS e/);
  assert.match(sql,/FOR UPDATE OF e/);
  assert.match(sql,/IF NOT FOUND THEN RETURN false; END IF/);
});
