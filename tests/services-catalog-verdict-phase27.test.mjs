import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const SQL = 'docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql';

test('Services Phase 27 audit is explicitly read-only and contains no business-row reads', async () => {
  const sql = await read(SQL);
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  // Ignore literal policy/object names before checking executable SQL verbs.
  const executable = withoutComments.replace(/'(?:''|[^'])*'/g, "''");
  assert.match(executable, /^\s*WITH\s+/i);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|CALL|DO|COPY|PERFORM|EXECUTE)\b/i);
  assert.doesNotMatch(executable, /\b(?:FROM|JOIN)\s+(?:public|auth)\./i);
  assert.match(executable, /\bpg_catalog\.pg_class\b/);
  assert.match(executable, /\bpg_catalog\.pg_policies\b/);
  assert.match(executable, /\bpg_catalog\.pg_trigger\b/);
});

test('Phase 27 evaluates actual required tables and security-invoker views', async () => {
  const sql = await read(SQL);
  for (const name of [
    'service_brief_amendments',
    'service_customer_amendment_queue',
    'service_admin_amendment_queue',
    'service_request_journal',
    'service_requests',
    'service_request_activity',
    'service_scope_reviews',
    'service_scope_responses',
    'service_clarification_questions',
    'service_clarification_answers',
    'service_request_triage',
  ]) {
    assert.ok(sql.includes("'" + name + "'"), 'required Services resource missing: ' + name);
  }
  assert.match(sql, /c\.relkind/);
  assert.match(sql, /relkind IN \('r','p'\)/);
  assert.match(sql, /relkind = 'v'/);
  assert.match(sql, /COALESCE\(c\.relrowsecurity, false\)/);
  assert.match(sql, /'security_invoker=true' = ANY\(c\.reloptions\)/);
});

test('Phase 27 audits actual privileges and RLS instead of trusting resource existence', async () => {
  const sql = await read(SQL);
  assert.match(sql, /has_table_privilege\('anon', c\.oid, 'SELECT'\)/);
  assert.match(sql, /has_table_privilege\('authenticated', c\.oid, 'SELECT'\)/);
  assert.match(sql, /anon_select IS FALSE/);
  assert.match(sql, /authenticated_select IS TRUE/);
  assert.match(sql, /NOT require_rls OR row_security/);
  assert.match(sql, /NOT require_invoker OR invoker/);
});

test('Phase 27 checks exact Phase 13 write/read policies and their protections', async () => {
  const sql = await read(SQL);
  for (const name of [
    'service_brief_amendments_participant_read',
    'service_brief_amendments_owner_insert',
    'service_brief_amendments_admin_review',
  ]) assert.ok(sql.includes(name));
  assert.match(sql, /'authenticated' = ANY\(p\.roles\)/);
  assert.match(sql, /p\.qual IS NOT NULL/);
  assert.match(sql, /p\.with_check IS NOT NULL/);
});

test('Phase 27 requires server-owned triggers to be enabled on the expected source table', async () => {
  const sql = await read(SQL);
  for (const name of [
    'service_brief_amendment_stamp_review',
    'service_brief_amendment_burst_guard',
    'service_clarification_close_stamp',
    'service_clarification_question_burst_guard',
  ]) assert.ok(sql.includes(name));
  assert.match(sql, /t\.tgenabled IN \('O','A'\)/);
  assert.match(sql, /t\.tgname = e\.triggername/);
  assert.match(sql, /c\.relname = e\.tablename/);
  assert.match(sql, /NOT t\.tgisinternal/);
  assert.match(sql, /to_regprocedure\('public\.is_admin\(\)'\)/);
});

test('Phase 27 failure cannot be disguised as a passing empty or partial audit', async () => {
  const sql = await read(SQL);
  assert.match(sql, /COALESCE\(bool_and\(passed IS TRUE\), false\)/);
  assert.match(sql, /COUNT\(\*\) FILTER \(WHERE passed IS NOT TRUE\)/);
  assert.match(sql, /array_agg\(check_id ORDER BY check_id\)/);
  assert.match(sql, /'This is catalog-only evidence/);
});

test('Phase 27 operational notes do not equate SQL availability with verified migrations or acceptance', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_DATABASE_INCIDENT_PHASE27.md');
  assert.match(doc, /SQLSTATE 57014/);
  assert.match(doc, /connection timeout/i);
  assert.match(doc, /Phase 13 before Phase 14/);
  assert.match(doc, /no new migration/i);
  assert.match(doc, /real-account staging/i);
  assert.match(doc, /not production-ready/i);
  assert.match(doc, /catalog_checks_passed/);
});
