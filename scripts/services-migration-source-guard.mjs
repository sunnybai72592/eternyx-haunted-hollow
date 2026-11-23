#!/usr/bin/env node
/**
 * Services Phase 28: local, no-network, no-write source-integrity gate.
 * Reuses the EXISTING, Git-blob-pinned cross-pillar collision baseline;
 * it never treats a source PASS as deployed/approved database schema.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from './automation-migration-collision-forensics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PHASE_13 = '20261123040000_service_brief_amendments.sql';
export const PHASE_14 = '20261123050000_service_request_journal.sql';

const checks = [
  ['phase13_table', 13, /CREATE\s+TABLE\s+public\.service_brief_amendments\s*\(/i],
  ['phase13_rls_enabled', 13, /ALTER\s+TABLE\s+public\.service_brief_amendments\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i],
  ['phase13_revoke', 13, /REVOKE\s+ALL\s+ON\s+public\.service_brief_amendments\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*;/i],
  ['phase13_owner_select', 13, /GRANT\s+SELECT\s+ON\s+public\.service_brief_amendments\s+TO\s+authenticated\s*;/i],
  ['phase13_limited_insert', 13, /GRANT\s+INSERT\s*\(\s*request_id\s*,\s*author_id\s*,\s*category\s*,\s*summary\s*,\s*details\s*\)\s+ON\s+public\.service_brief_amendments\s+TO\s+authenticated\s*;/i],
  ['phase13_limited_update', 13, /GRANT\s+UPDATE\s*\(\s*status\s*\)\s+ON\s+public\.service_brief_amendments\s+TO\s+authenticated\s*;/i],
  ['phase13_owner_insert_policy', 13, /CREATE\s+POLICY\s+"service_brief_amendments_owner_insert"/i],
  ['phase13_admin_review_policy', 13, /CREATE\s+POLICY\s+"service_brief_amendments_admin_review"/i],
  ['phase13_participant_read_policy', 13, /CREATE\s+POLICY\s+"service_brief_amendments_participant_read"/i],
  ['phase13_review_trigger', 13, /CREATE\s+TRIGGER\s+service_brief_amendment_stamp_review\s+BEFORE\s+UPDATE/i],
  ['phase13_rate_guard_trigger', 13, /CREATE\s+TRIGGER\s+service_brief_amendment_burst_guard\s+BEFORE\s+INSERT/i],
  ['phase13_owner_queue', 13, /CREATE\s+VIEW\s+public\.service_customer_amendment_queue\s+WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i],
  ['phase13_admin_queue', 13, /CREATE\s+VIEW\s+public\.service_admin_amendment_queue\s+WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i],
  ['phase13_admin_queue_guard', 13, /WHERE\s*\(\s*SELECT\s+public\.is_admin\s*\(\s*\)\s*\)/i],
  ['phase14_invoker_journal', 14, /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.service_request_journal\s+WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i],
  ['phase14_authenticated_select', 14, /GRANT\s+SELECT\s+ON\s+public\.service_request_journal\s+TO\s+authenticated\s*;/i],
  ['phase14_anonymous_revoked', 14, /REVOKE\s+ALL\s+ON\s+public\.service_request_journal\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*;/i],
  ['phase14_owner_guard', 14, /WHERE\s+EXISTS\s*\([\s\S]*?r\.user_id\s*=\s*\(\s*SELECT\s+auth\.uid\s*\(\s*\)\s*\)\s+OR\s+\(\s*SELECT\s+public\.is_admin\s*\(\s*\)\s*\)/i],
];
const streams = [
  'service_request_activity', 'service_scope_reviews',
  'service_scope_responses', 'service_clarification_questions',
  'service_clarification_answers', 'service_brief_amendments',
];

// Only remove single-line SQL comments for static checks, never execute SQL.
export function uncomment(sql) {
  if (typeof sql !== 'string') throw new Error('source_invalid');
  return sql.replace(/--[^\r\n]*/g, '');
}

export function auditServicesSource({ phase13, phase14, forensics }) {
  const defects = [];
  const fail = (code) => defects.push(code);
  const p13 = uncomment(phase13), p14 = uncomment(phase14);
  if (!forensics || forensics.sourceBaselineValid !== true ||
      !Array.isArray(forensics.sourceDefects) ||
      forensics.sourceDefects.length !== 0 ||
      !Array.isArray(forensics.collisions)) fail('historical_collision_baseline_changed');

  for (const [version, filename] of [
    ['20261123040000', PHASE_13], ['20261123050000', PHASE_14],
  ]) {
    const group = forensics?.collisions?.find(g => g.version === version);
    if (!group || !Array.isArray(group.files) ||
        !group.files.some(f => f.name === filename && /^[0-9a-f]{40}$/.test(f.gitBlobSha))) {
      fail('missing_pinned_collision_' + version);
    }
  }
  if (!(PHASE_13.slice(0, 14) < PHASE_14.slice(0, 14))) {
    fail('service_migration_order_invalid');
  }

  for (const [id, phase, required] of checks) {
    if (!required.test(phase === 13 ? p13 : p14)) fail(id);
  }
  for (const table of streams) {
    if (!new RegExp('\\bpublic\\.' + table + '\\b', 'i').test(p14)) {
      fail('phase14_missing_source_' + table);
    }
  }
  // Each amendment yields TWO independently useful events: initial
  // customer submission and subsequent admin acknowledgement. Merely
  // finding the source table once could hide a removed journal branch.
  const amendmentReads = p14.match(/FROM\\s+public\\.service_brief_amendments\\s+a\\b/gi) ?? [];
  if (amendmentReads.length !== 2) fail('phase14_amendment_branches_incomplete');

  // Ban accidental owner/admin-private stream unioning, even if the table
  // is only referenced by a new branch of the journal.
  if (/\bpublic\.service_request_triage\b/i.test(p14)) {
    fail('phase14_internal_triage_source_forbidden');
  }
  if (/\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\bTO\s+(?:PUBLIC|anon)\s*;/i.test(p14)
      || /\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\bTO\s+(?:PUBLIC|anon)\s*;/i.test(p13)) {
    fail('public_or_anon_grant_forbidden');
  }

  return {
    schema: 'eternyx-services-migration-source-gate-v1',
    mode: 'local_source_only',
    sourceSafetyPassed: defects.length === 0,
    defects,
    collisionVersionCount: forensics?.collisionVersionCount ?? null,
    servicePhase13File: PHASE_13,
    servicePhase14File: PHASE_14,
    remoteSqlConnected: false,
    verifiedAppliedMigrationHistory: false,
    realAccountAcceptancePerformed: false,
    stagingDeploymentAuthorized: false,
    productionDeploymentAuthorized: false,
    next: 'Restore SQL connectivity, reconcile the real migration history, run the read-only catalog verdict, and separately complete protected A/B/admin/anonymous staging acceptance.',
  };
}

export async function auditRepository(root = ROOT) {
  const forensics = await generateReport({ repoRoot: root });
  const dir = path.join(root, 'supabase/migrations');
  const [phase13, phase14] = await Promise.all([
    readFile(path.join(dir, PHASE_13), 'utf8'),
    readFile(path.join(dir, PHASE_14), 'utf8'),
  ]);
  return auditServicesSource({ phase13, phase14, forensics });
}

const invoked = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  auditRepository().then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.sourceSafetyPassed ? 0 : 1;
  }).catch(() => {
    // No raw source errors / remote identifiers in CI.
    process.stderr.write('Services migration source audit failed to collect verified inputs\n');
    process.exitCode = 2;
  });
}
