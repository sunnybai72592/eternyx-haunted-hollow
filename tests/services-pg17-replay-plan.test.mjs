import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SERVICES_REPLAY_FILES, validateServicesReplay, planServicesReplay,
} from '../scripts/services-pg17-replay-plan.mjs';

const read = p => readFile(new URL('../'+p, import.meta.url),'utf8');

test('Services PG17 replay plan contains exactly 13 allowlisted ordered source migrations',async()=>{
  assert.equal(validateServicesReplay(),true);
  assert.equal(SERVICES_REPLAY_FILES.length,13);
  const report=await planServicesReplay();
  assert.equal(report.migrationCount,13);
  assert.deepEqual(report.files,SERVICES_REPLAY_FILES);
  assert.equal(report.historyCollisionsAcknowledged,11);
  assert.equal(report.sourceIntegrityPassed,true);
  assert.equal(report.remoteDatabaseConnected,false);
  assert.equal(report.deployedSchemaVerified,false);
  assert.equal(report.operatorStagingAuthorized,false);
  assert.equal(report.productionDeploymentAuthorized,false);
  assert.match(report.mode,/network_isolated/);
});

test('PG17 planner rejects reordered, duplicate, non-Service and nonallowlisted names',()=>{
  const wrong=[
    [],
    [...SERVICES_REPLAY_FILES.slice().reverse()],
    [...SERVICES_REPLAY_FILES.slice(0,12),SERVICES_REPLAY_FILES[11]],
    [...SERVICES_REPLAY_FILES.slice(0,1),'../../production.sql',...SERVICES_REPLAY_FILES.slice(2)],
    [...SERVICES_REPLAY_FILES.slice(0,12),'20261123050000_automation_template_gallery.sql'],
  ];
  for(const files of wrong)assert.throws(()=>validateServicesReplay(files));
});

test('disposable SQL bootstrap creates only empty synthetic auth prerequisites',async()=>{
  const sql=await read('docs/sql/eternyx/services-phase29-disposable-bootstrap.sql');
  assert.match(sql,/CREATE ROLE anon NOLOGIN/);
  assert.match(sql,/CREATE ROLE authenticated NOLOGIN/);
  assert.match(sql,/CREATE SCHEMA auth/);
  assert.match(sql,/CREATE TABLE auth\.users/);
  assert.match(sql,/CREATE TABLE public\.admin_users/);
  assert.match(sql,/CREATE FUNCTION auth\.uid\(\)/);
  assert.match(sql,/CREATE FUNCTION public\.is_admin\(\)/);
  assert.doesNotMatch(sql,/\b(?:INSERT|COPY|CREATE EXTENSION|CREATE DATABASE|DROP|ALTER SYSTEM)\b/i);
});

test('real PG17 assertion query checks RLS, security-invoker views and private guards',async()=>{
  const sql=await read('docs/sql/eternyx/services-phase29-disposable-catalog-assert.sql');
  for(const name of [
    'service_brief_amendments','service_customer_amendment_queue',
    'service_admin_amendment_queue','service_request_journal',
    'service_clarification_questions','service_triage_history',
    'service_requests_delivery_gate','service_brief_amendment_burst_guard',
  ])assert.ok(sql.includes(name),name);
  assert.match(sql,/c\.relrowsecurity/);
  assert.match(sql,/security_invoker=true/);
  assert.match(sql,/has_table_privilege\('anon'/);
  assert.match(sql,/has_table_privilege\('authenticated'/);
  assert.match(sql,/t\.tgenabled IN \('O','A'\)/);
  assert.match(sql,/RAISE EXCEPTION/);
  assert.doesNotMatch(sql,/\b(?:INSERT INTO|DROP TABLE|ALTER TABLE|UPDATE public|DELETE FROM public)\b/i);
});

test('GitHub workflow truly runs Docker PostgreSQL 17 offline and does not contain remote credentials',async()=>{
  const yaml=await read('.github/workflows/services-pg17-disposable-replay.yml');
  assert.match(yaml,/pull_request:/);
  assert.match(yaml,/permissions:\s*contents: read/);
  assert.match(yaml,/docker run --detach --rm --network none/);
  assert.match(yaml,/postgres:17-alpine/);
  assert.match(yaml,/psql -X -1 -v ON_ERROR_STOP=1/);
  assert.match(yaml,/services-phase29-disposable-bootstrap\.sql/);
  assert.match(yaml,/services-phase29-disposable-catalog-assert\.sql/);
  assert.match(yaml,/node scripts\/services-pg17-replay-plan\.mjs --list/);
  assert.match(yaml,/test "\$index" -eq 13/);
  assert.doesNotMatch(yaml,/\bsecrets\.|\bsupabase\s+db\s+(push|reset)|curl.*supabase/);
});

test('Phase 29 does not assert live recovery or migration deployment from CI',async()=>{
  const doc=await read('docs/ETERNYX_SERVICES_PG17_REPLAY_PHASE29.md');
  assert.match(doc,/Phase 13 before Phase 14/);
  assert.match(doc,/connection/i);
  assert.match(doc,/not a production release/i);
  assert.match(doc,/real-account staging/i);
  assert.match(doc,/no new migration/i);
});
