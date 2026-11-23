import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('private scheduling schema preserves RLS and applies correct UTC buckets', async () => {
  const sql = await read('supabase/migrations/20261123003000_service_review_planner.sql');
  assert.match(sql, /ALTER TABLE public\.service_request_triage/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS next_action_kind/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS next_review_on date/);
  assert.match(sql, /next_action_kind IN \(/);
  assert.match(sql, /next_review_on BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'/);
  assert.match(sql, /GRANT UPDATE \(next_action_kind, next_review_on\)/);
  assert.match(sql, /GRANT INSERT \(next_action_kind, next_review_on\)/);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.service_admin_review_queue/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /FROM public\.service_admin_attention_queue AS q/);
  assert.match(sql, /WHERE \(SELECT public\.is_admin\(\)\)/);
  assert.match(sql, /REVOKE ALL ON public\.service_admin_review_queue FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.service_admin_review_queue TO authenticated/);
  assert.match(sql, /'unscheduled'/);
  assert.match(sql, /'overdue'/);
  assert.match(sql, /'due_today'/);
  assert.match(sql, /'upcoming'/);
  assert.match(sql, /AT TIME ZONE 'UTC'/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|SECURITY DEFINER|CREATE POLICY.*TO anon/);
});

test('review date validation rejects rollover and invalid user input', async () => {
  const source = await read('src/lib/serviceReviewPlanner.ts');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const module = { exports };
  new Function('module', 'exports', js)(module, exports);
  const check = module.exports.validInternalReviewDate;
  assert.equal(typeof check, 'function');
  for (const date of ['', '2024-02-29', '2026-11-23', '2030-12-31', '2100-12-31']) {
    assert.equal(check(date), true, date);
  }
  for (const date of ['2025-02-29', '2024-13-01', '2024-01-32', 'not-a-date', '2000-01-01', '2101-01-01', '2026-11-23<script>', '2026/11/23']) {
    assert.equal(check(date), false, date);
  }
  assert.equal(module.exports.serviceNextActionLabels.prepare_scope, 'Prepare scope review');
  assert.equal(module.exports.serviceReviewBucketLabels.overdue, 'Past review date');
});

test('admin triage saves real review plans with optimistic locking', async () => {
  const src = await read('src/components/services/ServiceTriagePanel.tsx');
  assert.match(src, /next_action_kind: ServiceNextAction/);
  assert.match(src, /next_review_on: string \| null/);
  assert.match(src, /setNextActionKind/);
  assert.match(src, /setNextReviewOn/);
  assert.match(src, /validInternalReviewDate\(nextReviewOn\)/);
  assert.match(src, /next_action_kind: nextActionKind, next_review_on: nextReviewOn \|\| null/);
  assert.match(src, /\.eq\('updated_at', saved\.updated_at\)/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /onSaved\?\.\(\)/);
  assert.match(src, /Next internal action/);
  assert.match(src, /Internal review date \(UTC\)/);
  assert.match(src, /not customer deadlines, delivery promises or service-level agreements/);
});

test('review queue filters and sorts on the database, never fake local rows', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /from\('service_admin_amendment_queue'\)/);
  assert.match(src, /query\.eq\('review_bucket', reviewBucket\)/);
  assert.match(src, /query\.eq\('next_action_kind', actionFilter\)/);
  assert.match(src, /query\.order\('next_review_on', \{ ascending: true, nullsFirst: false \}\)/);
  assert.match(src, /count: 'exact'/);
  assert.match(src, /\.range\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE - 1\)/);
  assert.match(src, /setReviewBucket\('all'\)/);
  assert.match(src, /setActionFilter\('all'\)/);
  assert.match(src, /setSortOrder\('newest'\)/);
  assert.match(src, /Clear all filters/);
  assert.match(src, /serviceReviewBucketLabels\[item\.review_bucket\]/);
  assert.match(src, /serviceNextActionLabels\[item\.next_action_kind\]/);
  assert.doesNotMatch(src, /mockQueue|mockRecords|Math\.random/);
});

test('admin request URL is UUID-validated and normal access still mandatory', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /new URLSearchParams\(location\.search\)\.get\('request'\)/);
  assert.match(src, /setActiveSearchField\('id'\)/);
  assert.match(src, /setActiveSearch\(selected\)/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /const authorized = !!user && authorizedFor === user\.id/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /encodeURIComponent\(id\)/);
  assert.match(src, /navigate\('\/admin\/service-requests', \{ replace: true \}\)/);
  assert.match(src, /Access still requires a verified administrator session/);
});

test('customer-facing Services page has no internal planning fields', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const scope = await read('src/components/services/ServiceScopeReview.tsx');
  assert.doesNotMatch(owner, /next_review_on|next_action_kind|review_bucket|service_request_triage/);
  assert.doesNotMatch(scope, /next_review_on|next_action_kind|review_bucket|service_request_triage/);
});
