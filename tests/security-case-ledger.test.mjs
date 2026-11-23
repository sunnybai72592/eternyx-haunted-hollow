import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (path) => readFile(new URL("../"+path, import.meta.url), "utf8");
const sqlPath = "scripts/sql/staged-security-case-ledger.sql";
const tables = ["security_case_assets", "security_case_findings", "security_case_finding_evidence", "security_case_finding_history"];

test("staged schema has four owner-protected queryable tables and no production migrations", async () => {
  const sql = await read(sqlPath);
  for (const name of tables) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS public\\."+name+"\\b"));
    assert.match(sql, new RegExp("ALTER TABLE public\\."+name+" ENABLE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("REVOKE ALL ON TABLE public\\."+name+" FROM PUBLIC, anon, authenticated"));
    assert.match(sql, new RegExp("GRANT SELECT ON TABLE public\\."+name+" TO authenticated"));
  }
  assert.match(sql,/STAGED SQL PROPOSAL ONLY/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DISABLE ROW LEVEL SECURITY|GRANT ALL ON TABLE/);
});
test("composite FKs bind engagement, assets, findings and existing private evidence to same owner", async () => {
  const sql = await read(sqlPath);
  assert.match(sql,/pentest_engagements\(owner_id, id\)/);
  assert.match(sql,/REFERENCES public\.pentest_engagements\(owner_id, id\)/);
  assert.match(sql,/REFERENCES public\.security_case_assets\(owner_id, engagement_id, id\)/);
  assert.match(sql,/REFERENCES public\.security_case_findings\(owner_id, engagement_id, id\)/);
  assert.match(sql,/REFERENCES public\.pentest_evidence\(owner_id, engagement_id, id\)/);
  assert.match(sql,/ON DELETE RESTRICT/);
});
test("database authorizes exact non-excluded target for asset and finding writes", async () => {
  const sql = await read(sqlPath);
  assert.match(sql,/SECURITY INVOKER SET search_path = ''/);
  assert.match(sql,/NEW\.target = ANY\(e\.scope_targets\)/);
  assert.match(sql,/NOT \(NEW\.target = ANY\(e\.excluded_targets\)\)/);
  assert.match(sql,/a\.target = ANY\(e\.scope_targets\)/);
  assert.match(sql,/e\.authorization_attested = true/);
  assert.match(sql,/NEW\.owner_id IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
  assert.match(sql,/BEFORE INSERT OR UPDATE\s+ON public\.security_case_assets/);
  assert.match(sql,/BEFORE INSERT OR UPDATE\s+ON public\.security_case_findings/);
});
test("verified and accepted finding states are blocked without supporting text", async () => {
  const sql = await read(sqlPath);
  assert.match(sql,/status <> 'verified' OR/);
  assert.match(sql,/char_length\(btrim\(retest_note\)\) >= 12/);
  assert.match(sql,/char_length\(btrim\(evidence\)\) >= 10/);
  assert.match(sql,/status <> 'accepted' OR char_length\(btrim\(risk_acceptance_note\)\) >= 12/);
});
test("owner and relationship columns cannot be updated through the browser role", async () => {
  const sql = await read(sqlPath);
  const grants = [...sql.matchAll(/GRANT UPDATE \(([\s\S]*?)\)\s+ON TABLE public\.(security_case_assets|security_case_findings) TO authenticated;/g)];
  assert.equal(grants.length, 2);
  for(const [full,columns] of grants) {
    assert.doesNotMatch(columns,/owner_id|engagement_id|asset_id|\bid\b/);
    assert.doesNotMatch(full,/DELETE/);
  }
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.security_case_finding_history TO authenticated/);
});
test("audit history is trigger-written and app users have read-only access", async () => {
  const sql = await read(sqlPath);
  assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.security_case_record_finding_history\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/AFTER INSERT OR UPDATE ON public\.security_case_findings/);
  assert.match(sql,/AFTER INSERT ON public\.security_case_finding_evidence/);
  assert.match(sql,/previous_status/);
  assert.match(sql,/new_status/);
  assert.match(sql,/changed_fields text\[\]/);
});
test("new UI fails closed when schema is absent and never invents success", async () => {
  const [app,hub,page] = await Promise.all([read("src/App.tsx"),read("src/pages/CybersecurityHub.tsx"),read("src/pages/SecurityCaseLedger.tsx")]);
  assert.match(app,/path="\/cybersecurity\/case-ledger" element={<RequireAuth><SecurityCaseLedger \/><\/RequireAuth>}/);
  assert.match(hub,/href: "\/cybersecurity\/case-ledger"/);
  assert.match(hub,/mode: "Deployment-gated"/);
  assert.match(page,/Schema not deployed or accessible/);
  assert.match(page,/from\("security_case_assets"/);
  assert.match(page,/from\("security_case_findings"/);
  assert.match(page,/from\("security_case_finding_history"/);
  assert.match(page,/from\("security_case_finding_evidence"/);
  assert.match(page,/from\("pentest_engagements"/);
  assert.match(page,/from\("pentest_evidence"/);
  assert.match(page,/owner_id: userId/);
  assert.doesNotMatch(page,/service_role|SERVICE_ROLE_KEY|VITE_SUPABASE_SECRET/);
});
test("staging-only SQL audit is read-only and checks privileges", async () => {
  const sql=await read("scripts/sql/read-only-security-case-ledger-audit.sql");
  assert.match(sql,/pg_policies/);
  assert.match(sql,/relrowsecurity/);
  assert.match(sql,/authenticated_can_delete/);
  assert.doesNotMatch(sql,/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\s+(?:TABLE|POLICY|TRIGGER|FUNCTION|INTO|public\.)/i);
});
