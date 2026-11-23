#!/usr/bin/env node
/**
 * ETERNYX Services Phase 31 — fail-closed OPERATOR ATTESTATION gate before
 * manually approved read-only Supabase staging acceptance.
 *
 * IMPORTANT: These JSON fields are operator assertions, not cryptographic
 * proof of the deployed SQL. This module cannot connect to, mutate or deploy
 * any Supabase database; the independent real-account acceptance follows it.
 */
const PRODUCTION_PROJECT_REF = 'wcncuarekaofmfurbtbh';
const REF = /^[a-z]{20}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CATALOG_CHECKS = 64;
const SCHEMA = 'eternyx-services-staging-operator-evidence-v1';

function fail(code) {
  throw new Error('services_staging_evidence_' + code);
}
function record(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function exactBool(v) {
  return v === true;
}
export function verifyServicesStagingEvidence(env, now = new Date()) {
  if (!record(env)) fail('missing_environment');
  if (env.SERVICES_PREFLIGHT_CONFIRM !== 'READ_ONLY_STAGING_ACCEPTANCE') {
    fail('approval_missing');
  }
  const target = env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF;
  if (typeof target !== 'string' || !REF.test(target) ||
      target === PRODUCTION_PROJECT_REF) fail('target_not_staging');
  // We do not infer the ref from URL fragments, user-info, alternate hosts,
  // query strings, ports or custom domains.
  if (env.SERVICES_PREFLIGHT_URL !== 'https://' + target + '.supabase.co') {
    fail('url_target_mismatch');
  }
  const raw = env.SERVICES_STAGING_RELEASE_EVIDENCE;
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 12_000) {
    fail('missing_or_oversized_snapshot');
  }
  let evidence;
  try { evidence = JSON.parse(raw); }
  catch { fail('invalid_snapshot_json'); }
  if (!record(evidence) || evidence.schema !== SCHEMA ||
      evidence.projectRef !== target ||
      evidence.projectRef === PRODUCTION_PROJECT_REF) {
    fail('foreign_or_invalid_snapshot');
  }
  const captured = evidence.capturedAt;
  if (typeof captured !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(captured)) {
    fail('missing_utc_capture_time');
  }
  const time = Date.parse(captured);
  const age = now instanceof Date ? now.getTime() - time : NaN;
  if (!Number.isFinite(time) || !Number.isFinite(age) ||
      age > MAX_AGE_MS || age < -MAX_FUTURE_SKEW_MS) {
    fail('stale_or_future_snapshot');
  }
  if (!record(evidence.database) ||
      evidence.database.sqlRoundTripConfirmed !== true ||
      evidence.database.connectionStableForManualChecks !== true) {
    fail('sql_connection_not_verified');
  }
  const c = evidence.catalog;
  if (!record(c) || c.catalog_checks_passed !== true ||
      c.checks_evaluated !== CATALOG_CHECKS ||
      c.checks_failed !== 0 ||
      !Array.isArray(c.failed_check_ids) ||
      c.failed_check_ids.length !== 0) {
    fail('catalog_not_verified');
  }
  const m = evidence.operatorMigrationReview;
  // Version history alone cannot identify WHICH SQL executed at collided
  // timestamps. Require explicit, separately performed catalog and actual
  // managed-history comparison. These remain human operator attestations.
  if (!record(m) ||
      !exactBool(m.actualManagedHistoryInspected) ||
      !exactBool(m.allThirteenServicesSourcesReconciled) ||
      !exactBool(m.elevenHistoricalCollisionVersionsReviewed) ||
      !exactBool(m.phase13BeforePhase14Verified) ||
      !exactBool(m.noHistoryRewrites) ||
      !exactBool(m.independentCatalogCompared) ||
      m.unresolvedServiceSchemaGaps !== 0 ||
      m.unresolvedServiceMigrationAmbiguities !== 0) {
    fail('migration_history_not_reconciled');
  }
  // Never disclose snapshot, target, user identifiers or secret values.
  return {
    gate: 'services-staging-operator-attestation-v1',
    accepted: true,
    stagingTargetMatched: true,
    catalogEvidenceDeclared: true,
    historyAndCollisionReviewDeclared: true,
    evidenceKind: 'operator_supplied_not_independently_authenticated',
    remoteMigrationsDeployedByGate: false,
    liveRealAccountAcceptancePassed: false,
    productionDeploymentAuthorized: false,
  };
}
const invoked = process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('/services-staging-release-evidence.mjs');
if (invoked) {
  try {
    const result = verifyServicesStagingEvidence(process.env);
    process.stdout.write('PASS Services protected staging operator-evidence preflight\n');
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    // All codes are static; never log raw JSON, project refs or API data.
    const code = err instanceof Error && /^services_staging_evidence_[a-z_]+$/.test(err.message)
      ? err.message : 'services_staging_evidence_unavailable';
    process.stderr.write('BLOCKED ' + code + '\n');
    process.exitCode = 1;
  }
}
