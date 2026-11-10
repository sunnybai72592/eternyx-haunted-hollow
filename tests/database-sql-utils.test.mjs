import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSqlScript, buildSqlReviewReport } from "../src/lib/databaseSqlUtils.mjs";

test("flags unbounded UPDATE and DELETE as critical", () => {
  const result = analyzeSqlScript({ sql: "UPDATE users SET active = false;\nDELETE FROM sessions;" });
  const ids = result.findings.map(item => item.id);
  assert.ok(ids.includes("UPDATE_WITHOUT_WHERE"));
  assert.ok(ids.includes("DELETE_WITHOUT_WHERE"));
  assert.equal(result.summary.critical, 2);
});

test("detects destructive DDL and broad privileges", () => {
  const result = analyzeSqlScript({ sql: "DROP TABLE public.users;\nGRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_role;" });
  assert.ok(result.findings.some(item => item.id === "DESTRUCTIVE_DROP"));
  assert.ok(result.findings.some(item => item.id === "GRANT_ALL_PRIVILEGES"));
});

test("ignores risky-looking text inside comments and quoted strings", () => {
  const sql = "-- DROP TABLE users;\nSELECT 'DELETE FROM users' AS note;\n/* UPDATE users SET admin = true; */";
  const result = analyzeSqlScript({ sql });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "SELECT_WITHOUT_LIMIT");
});

test("detects security definer and dynamic SQL patterns", () => {
  const result = analyzeSqlScript({ sql: "CREATE FUNCTION public.run_sql() RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'SELECT 1'; END; $$;" });
  assert.ok(result.findings.some(item => item.id === "SECURITY_DEFINER"));
  assert.ok(result.findings.some(item => item.id === "DYNAMIC_SQL"));
});

test("reports query-quality hints and explicit transaction boundary", () => {
  const result = analyzeSqlScript({ sql: "BEGIN;\nSELECT * FROM audit_events;\nCOMMIT;" });
  assert.equal(result.statementCount, 3);
  assert.ok(result.findings.some(item => item.id === "SELECT_STAR"));
  assert.ok(result.findings.some(item => item.id === "SELECT_WITHOUT_LIMIT"));
  assert.ok(!result.findings.some(item => item.id === "NO_EXPLICIT_TRANSACTION"));
});

test("rejects empty and oversized SQL inputs", () => {
  assert.throws(() => analyzeSqlScript({ sql: " " }), /Paste a SQL script/);
  assert.throws(() => analyzeSqlScript({ sql: "x".repeat(250001) }), /250,000/);
});

test("builds a report with explicit static-analysis boundaries", () => {
  const result = analyzeSqlScript({ sql: "DELETE FROM users WHERE id = 10;" });
  const report = buildSqlReviewReport(result);
  assert.match(report, /Database & SQL Review/);
  assert.match(report, /does not parse or execute SQL/);
});
