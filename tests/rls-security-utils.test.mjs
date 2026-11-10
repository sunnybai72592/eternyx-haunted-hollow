import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRlsPolicies, buildRlsSecurityReport } from "../src/lib/rlsSecurityUtils.mjs";

test("detects public tables without visible RLS enablement", () => {
  const result = analyzeRlsPolicies({ sql: "CREATE TABLE public.profiles (id uuid primary key);" });
  assert.ok(result.findings.some(item => item.id === "RLS_NOT_ENABLED_IN_SCRIPT"));
});

test("recognizes enabled RLS and policies", () => {
  const sql = "CREATE TABLE public.profiles (id uuid primary key); ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY profile_owner ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);";
  const result = analyzeRlsPolicies({ sql });
  assert.equal(result.rlsEnabledCount, 1);
  assert.equal(result.policyCount, 1);
  assert.ok(!result.findings.some(item => item.id === "POLICY_WITHOUT_RLS_ENABLE"));
});

test("flags policies that target PUBLIC or anon", () => {
  const sql = "ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY; CREATE POLICY docs_public ON public.documents FOR SELECT TO anon USING (true);";
  const result = analyzeRlsPolicies({ sql });
  assert.ok(result.findings.some(item => item.id === "POLICY_BROAD_ROLE"));
});

test("flags unconditional predicates and ALL command policies", () => {
  const sql = "ALTER TABLE public.records ENABLE ROW LEVEL SECURITY; CREATE POLICY records_all ON public.records FOR ALL TO authenticated USING (true) WITH CHECK (true);";
  const result = analyzeRlsPolicies({ sql });
  const ids = result.findings.map(item => item.id);
  assert.ok(ids.includes("POLICY_UNCONDITIONAL_PREDICATE"));
  assert.ok(ids.includes("POLICY_FOR_ALL_COMMANDS"));
});

test("flags policies that appear before RLS is enabled", () => {
  const result = analyzeRlsPolicies({ sql: "CREATE POLICY own_rows ON public.items FOR SELECT TO authenticated USING (auth.uid() = owner_id);" });
  assert.ok(result.findings.some(item => item.id === "POLICY_WITHOUT_RLS_ENABLE"));
});

test("detects public and anonymous write grants", () => {
  const result = analyzeRlsPolicies({ sql: "GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO anon;" });
  assert.ok(result.findings.some(item => item.id === "BROAD_ANONYMOUS_GRANT" && item.severity === "critical"));
});

test("detects broad public read grants", () => {
  const result = analyzeRlsPolicies({ sql: "GRANT SELECT ON TABLE public.announcements TO PUBLIC;" });
  assert.ok(result.findings.some(item => item.id === "BROAD_ANONYMOUS_READ_GRANT"));
});

test("ignores SQL keywords inside comments and string literals", () => {
  const sql = "-- CREATE TABLE public.fake (id int);\nSELECT 'GRANT ALL TO anon;';\nCREATE TABLE public.real_table (id int);";
  const result = analyzeRlsPolicies({ sql });
  assert.equal(result.tableCount, 1);
  assert.ok(result.findings.some(item => item.id === "RLS_NOT_ENABLED_IN_SCRIPT"));
});

test("handles dollar-quoted function bodies without splitting on internal semicolons", () => {
  const sql = "CREATE FUNCTION public.noop() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1; PERFORM 2; END; $$; CREATE TABLE public.events (id int);";
  const result = analyzeRlsPolicies({ sql });
  assert.equal(result.tableCount, 1);
  assert.ok(result.findings.some(item => item.id === "RLS_NOT_ENABLED_IN_SCRIPT"));
});

test("rejects empty and oversized input", () => {
  assert.throws(() => analyzeRlsPolicies({ sql: " " }), /Paste a schema/);
  assert.throws(() => analyzeRlsPolicies({ sql: "x".repeat(250001) }), /250,000/);
});

test("builds a report with explicit static-analysis limitations", () => {
  const result = analyzeRlsPolicies({ sql: "CREATE TABLE public.profiles (id uuid);" });
  const report = buildRlsSecurityReport(result);
  assert.match(report, /Supabase & PostgreSQL RLS Security Review/);
  assert.match(report, /does not connect to Supabase or PostgreSQL/);
});
