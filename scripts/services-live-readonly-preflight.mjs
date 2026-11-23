#!/usr/bin/env node
/**
 * ETERNYX Services Phase 20 — manually invoked, read-only staging acceptance.
 *
 * IMPORTANT:
 * - Uses three real, dedicated STAGING credentials and existing fixture IDs.
 * - Creates short-lived Supabase Auth sessions (auth sign-in side effect).
 * - Never creates/changes/deletes a Service business record.
 * - Fail-closed on missing config, incomplete fixtures, 500s or timeouts.
 * - Emits fixed, non-sensitive check names only; no tokens, addresses or rows.
 *
 * For a complete release gate this must be paired with the SQL Editor catalog
 * audit documented in docs/ETERNYX_SERVICES_RELEASE_GATE_PHASE20.md.
 */
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'wcncuarekaofmfurbtbh';
const TIMEOUT_MS = 12_000;
const names = [
  'SERVICES_PREFLIGHT_URL',
  'SERVICES_PREFLIGHT_PUBLISHABLE_KEY',
  'SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF',
  'SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL',
  'SERVICES_PREFLIGHT_CUSTOMER_A_PASSWORD',
  'SERVICES_PREFLIGHT_CUSTOMER_A_REQUEST_ID',
  'SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL',
  'SERVICES_PREFLIGHT_CUSTOMER_B_PASSWORD',
  'SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID',
  'SERVICES_PREFLIGHT_ADMIN_EMAIL',
  'SERVICES_PREFLIGHT_ADMIN_PASSWORD',
  'SERVICES_PREFLIGHT_CONFIRM',
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateStagingConfig(env) {
  const missing = names.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw new Error('Missing required staging configuration keys: ' + missing.join(', '));

  if (env.SERVICES_PREFLIGHT_CONFIRM !== 'READ_ONLY_STAGING_ACCEPTANCE') {
    throw new Error('Explicit staging acceptance acknowledgment is required');
  }
  const project = String(env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF).trim();
  if (!/^[a-z0-9-]{8,40}$/.test(project)) throw new Error('Invalid expected staging project reference');
  if (project === PRODUCTION_REF) throw new Error('The production Supabase project is not eligible for this staging fixture probe');

  const key = String(env.SERVICES_PREFLIGHT_PUBLISHABLE_KEY).trim();
  if (key.startsWith('sb_secret_')) throw new Error('Service-role/secret Supabase keys are forbidden');
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role' || payload.role === 'supabase_admin') {
        throw new Error('Service-role/secret Supabase keys are forbidden');
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('forbidden')) throw reason;
      throw new Error('Invalid legacy publishable/anonymous key format');
    }
  }
  if (!key.startsWith('sb_publishable_') && key.split('.').length !== 3) {
    throw new Error('A publishable/anonymous Supabase key is required');
  }

  // Require the exact canonical staging origin with no path, query,
  // fragment, alternative port, or embedded URL credentials.
  // Full-href equality also rejects userinfo without exposing its contents.
  const url = new URL(env.SERVICES_PREFLIGHT_URL);
  const expectedUrl = 'https://' + project + '.supabase.co/';
  if (url.href !== expectedUrl) {
    throw new Error('Staging URL must exactly match the expected Supabase project reference');
  }

  const aId = String(env.SERVICES_PREFLIGHT_CUSTOMER_A_REQUEST_ID);
  const bId = String(env.SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID);
  if (!uuidPattern.test(aId) || !uuidPattern.test(bId) || aId.toLowerCase() === bId.toLowerCase()) {
    throw new Error('Distinct, correctly formatted staging request IDs are required');
  }
  const emails = [
    env.SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL,
    env.SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL,
    env.SERVICES_PREFLIGHT_ADMIN_EMAIL,
  ].map((v) => String(v).trim().toLowerCase());
  if (new Set(emails).size !== 3) throw new Error('Three distinct staging user accounts are required');

  return {
    url: url.origin,
    key,
    customers: [
      { email: env.SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL, password: env.SERVICES_PREFLIGHT_CUSTOMER_A_PASSWORD, requestId: aId },
      { email: env.SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL, password: env.SERVICES_PREFLIGHT_CUSTOMER_B_PASSWORD, requestId: bId },
    ],
    admin: { email: env.SERVICES_PREFLIGHT_ADMIN_EMAIL, password: env.SERVICES_PREFLIGHT_ADMIN_PASSWORD },
  };
}

export function createSafeClient(url, key) {
  // Never send a service-role key to this script. The staging account and
  // RLS must determine access. Global AbortSignal covers auth AND REST calls.
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) => {
        const timeout = AbortSignal.timeout(TIMEOUT_MS);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return fetch(input, { ...init, signal });
      },
    },
  });
}

class AcceptanceEvidenceError extends Error {}

const enforce = (predicate, description) => {
  if (!predicate) throw new AcceptanceEvidenceError('Acceptance failed: ' + description);
};

// An anonymous 200 with zero rows or an explicit PostgreSQL permission
// denial are positive evidence of privacy. A 404, 5xx, timeout, malformed
// payload or failed transport proves nothing and MUST fail the release gate.
// Grant denial does not prove RLS: the separate catalog and A/B reads still run.
export function assertAnonymousIsolation(result, resource) {
  enforce(result && typeof result === 'object', resource + ': anonymous probe returned no evidence');
  const { data, error, status } = result;
  if (error) {
    enforce(error.code === '42501' && (status === 401 || status === 403)
      && (data == null),
    resource + ': anonymous access was not a verified permission denial');
    return;
  }
  enforce((status === 200 || status === 206) && Array.isArray(data)
    && data.length === 0,
  resource + ': anonymous privacy evidence was missing or leaked data');
}

// For authenticated customers, the admin-only view may return no rows
// through its is_admin() predicate OR an explicit table permission denial.
// Any missing relation, network failure or ambiguous payload is not evidence.
export function assertAdminQueueIsolated(result) {
  enforce(result && typeof result === 'object', 'Admin queue: no verified privacy response');
  if (result.error) {
    enforce(result.error.code === '42501'
      && (result.status === 401 || result.status === 403)
      && result.data == null,
    'Admin queue: access was not conclusively denied');
  } else {
    enforce((result.status === 200 || result.status === 206)
      && Array.isArray(result.data) && result.data.length === 0,
    'Admin queue: customer data boundary is not proven');
  }
}

async function rows(client, table, field, value, columns = 'id', limit = 4) {
  const { data, error } = await client.from(table)
    .select(columns).eq(field, value).limit(limit);
  if (error || !Array.isArray(data) || data.length > limit
      || !data.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    throw new AcceptanceEvidenceError('A required staging query failed for ' + table);
  }
  return data;
}

async function exactlyOne(client, table, field, value, columns = 'id') {
  const items = await rows(client, table, field, value, columns);
  enforce(items.length === 1, table + ': expected one existing fixture record');
  return items[0];
}

async function none(client, table, field, value) {
  const items = await rows(client, table, field, value);
  enforce(items.length === 0, table + ': unrelated account can see a forbidden fixture');
}

async function atLeastOne(client, table, field, value, columns = 'id') {
  const items = await rows(client, table, field, value, columns);
  enforce(items.length > 0, table + ': required staged workflow fixture is missing');
  return items[0];
}

// Verify a precise persisted journal event from an existing source row,
// not just a nonempty request journal that could hold unrelated events.
// Select bounded metadata only: no narrative, PII or bulk record export.
async function requireJournalSource(client, requestId, key, expectedKind) {
  const { data, error } = await client.from('service_request_journal')
    .select('request_id,event_key,event_kind')
    .eq('request_id', requestId).eq('event_key', key).limit(2);
  enforce(!error && Array.isArray(data) && data.length === 1
    && data[0]?.request_id === requestId
    && data[0]?.event_key === key
    && (expectedKind === null || data[0]?.event_kind === expectedKind),
  'Phase 14 journal is missing a verified persisted workflow event');
}

async function signIn(client, person) {
  const { data, error } = await client.auth.signInWithPassword({
    email: person.email,
    password: person.password,
  });
  enforce(!error && Boolean(data?.user?.id), 'Unable to verify a dedicated staging identity');
  const { data: check, error: verifyError } = await client.auth.getUser();
  enforce(!verifyError && check?.user?.id === data.user.id, 'Session verification did not match');
  return data.user.id;
}

const success = (name) => process.stdout.write('PASS ' + name + '\n');

// The wrapper owns all four clients and waits for every sign-in to settle
// before cleanup. A failed parallel sign-in must not leave another account
// signing in *after* cleanup has already run.
async function runStagingChecks(config, [a, b, admin, anon]) {
  const actors = await Promise.allSettled([
    signIn(a, config.customers[0]),
    signIn(b, config.customers[1]),
    signIn(admin, config.admin),
  ]);
  enforce(actors.every((actor) => actor.status === 'fulfilled'),
    'Unable to verify all dedicated staging identities');
  const [aId, bId, adminId] = actors.map((actor) => actor.value);
  enforce(new Set([aId, bId, adminId]).size === 3, 'Staging actors share a user ID');
  success('three distinct authenticated identities');

  for (const [client, isExpectedAdmin] of [[a, false], [b, false], [admin, true]]) {
    const { data, error } = await client.rpc('is_admin');
    enforce(!error && data === isExpectedAdmin, 'Administrator-role boundary is not verified');
  }
  success('verified customer/customer/admin role boundaries');

  const aRequest = config.customers[0].requestId;
  const bRequest = config.customers[1].requestId;
  const aRow = await exactlyOne(a, 'service_requests', 'id', aRequest, 'id,user_id');
  const bRow = await exactlyOne(b, 'service_requests', 'id', bRequest, 'id,user_id');
  enforce(aRow.user_id === aId && bRow.user_id === bId, 'Fixture ownership does not match the signed-in accounts');
  await none(a, 'service_requests', 'id', bRequest);
  await none(b, 'service_requests', 'id', aRequest);
  await exactlyOne(admin, 'service_requests', 'id', aRequest);
  await exactlyOne(admin, 'service_requests', 'id', bRequest);
  success('owner-owned request rows and cross-customer RLS');

  // Phase 13 owner/admin queue must exist; a missing view is an ERROR,
  // never interpreted as zero rows.
  await exactlyOne(a, 'service_customer_amendment_queue', 'id', aRequest);
  await exactlyOne(b, 'service_customer_amendment_queue', 'id', bRequest);
  await none(a, 'service_customer_amendment_queue', 'id', bRequest);
  await none(b, 'service_customer_amendment_queue', 'id', aRequest);
  await exactlyOne(admin, 'service_admin_amendment_queue', 'id', aRequest);
  await exactlyOne(admin, 'service_admin_amendment_queue', 'id', bRequest);
  for (const [customer, otherRequest] of [[a, aRequest], [b, bRequest]]) {
    const denied = await customer.from('service_admin_amendment_queue')
      .select('id').eq('id', otherRequest).limit(1);
    assertAdminQueueIsolated(denied);
  }
  success('Phase 13 queue views and authenticated participant boundaries');

  const activityA = await atLeastOne(a, 'service_request_activity', 'request_id', aRequest);
  await atLeastOne(b, 'service_request_activity', 'request_id', bRequest);
  await none(b, 'service_request_activity', 'request_id', aRequest);
  await atLeastOne(admin, 'service_request_activity', 'request_id', aRequest);
  enforce(Boolean(activityA.id), 'Recorded activity fixture is missing');
  success('persisted participant activity and historical RLS');

  const reviews = await rows(a, 'service_scope_reviews', 'request_id', aRequest, 'id', 100);
  enforce(reviews.length > 0, 'Real scope review fixture is missing');
  const { data: responses, error: responseError } = await a.from('service_scope_responses')
    .select('id,review_id').in('review_id', reviews.map((r) => r.id)).limit(2);
  enforce(!responseError && Array.isArray(responses) && responses.length > 0 && responses.every((r) => r && typeof r.review_id === 'string'), 'A saved owner scope response is required');
  const reviewId = responses[0].review_id;
  enforce(typeof responses[0].id === 'string' && responses[0].id.length > 0,
    'Saved scope response must have a source record ID');
  await none(b, 'service_scope_reviews', 'request_id', aRequest);
  await none(b, 'service_scope_responses', 'review_id', reviewId);
  await atLeastOne(admin, 'service_scope_responses', 'review_id', reviewId);
  success('real scope review and nonbinding owner response');

  const questions = await rows(a, 'service_clarification_questions', 'request_id', aRequest, 'id', 100);
  enforce(questions.length > 0, 'Real clarification question fixture is missing');
  const { data: answers, error: answerError } = await a.from('service_clarification_answers')
    .select('id,question_id').in('question_id', questions.map((q) => q.id)).limit(2);
  enforce(!answerError && Array.isArray(answers) && answers.length > 0 && answers.every((r) => r && typeof r.question_id === 'string'), 'A saved owner clarification answer is required');
  const questionId = answers[0].question_id;
  enforce(typeof answers[0].id === 'string' && answers[0].id.length > 0,
    'Saved clarification answer must have a source record ID');
  await none(b, 'service_clarification_questions', 'request_id', aRequest);
  await none(b, 'service_clarification_answers', 'question_id', questionId);
  await atLeastOne(admin, 'service_clarification_answers', 'question_id', questionId);
  success('persisted clarification question/answer and participant RLS');

  const amendment = await atLeastOne(a, 'service_brief_amendments', 'request_id', aRequest);
  enforce(typeof amendment.id === 'string' && amendment.id.length > 0,
    'Saved brief amendment must have a source record ID');
  await none(b, 'service_brief_amendments', 'request_id', aRequest);
  await atLeastOne(admin, 'service_brief_amendments', 'request_id', aRequest);
  success('Phase 13 immutable amendment read boundaries');

  await atLeastOne(a, 'service_request_journal', 'request_id', aRequest, 'event_key');
  await atLeastOne(b, 'service_request_journal', 'request_id', bRequest, 'event_key');
  await none(a, 'service_request_journal', 'request_id', bRequest);
  await none(b, 'service_request_journal', 'request_id', aRequest);
  await atLeastOne(admin, 'service_request_journal', 'request_id', aRequest, 'event_key');
  await atLeastOne(admin, 'service_request_journal', 'request_id', bRequest, 'event_key');
  // Confirm journal event keys are derived from actual source rows already
  // checked in THIS signed-in session, not an unrelated journal fixture.
  const sourceEvents = [
    ['activity:' + activityA.id, null],
    ['scope-review:' + reviews[0].id, 'scope_published'],
    ['scope-response:' + responses[0].id, 'scope_response'],
    ['question:' + questions[0].id, 'question_published'],
    ['answer:' + answers[0].id, 'answer_submitted'],
    ['amendment:' + amendment.id, 'amendment_submitted'],
  ];
  for (const [eventKey, kind] of sourceEvents) {
    await requireJournalSource(a, aRequest, eventKey, kind);
  }
  success('Phase 14 journal source provenance for six persisted workflow events');

  // The same owner must never read an internal/admin-only stream from
  // a real request with an existing admin triage fixture.
  for (const stream of ['internal', 'triage']) {
    const { data, error } = await a.from('service_request_journal')
      .select('event_key').eq('request_id', aRequest).eq('stream', stream).limit(1);
    enforce(!error && Array.isArray(data) && data.length === 0,
      'Phase 14 journal exposed or failed to exclude an internal stream');
  }
  success('Phase 14 internal stream exclusions');
  success('Phase 14 unified journal with cross-customer RLS');

  // A staged admin triage row on request A is required: without a real
  // fixture, zero results for customers alone cannot prove isolation.
  await exactlyOne(admin, 'service_request_triage', 'request_id', aRequest, 'request_id');
  await none(a, 'service_request_triage', 'request_id', aRequest);
  await none(b, 'service_request_triage', 'request_id', aRequest);
  success('real admin-only triage data is absent from customer reads');

  // Verify each sensitive Phase 13/14 resource separately. A failed REST
  // call is not a passing RLS assertion; only explicit denial/empty evidence is.
  const privateAnonResources = [
    ['service_requests', 'id', aRequest, 'id'],
    ['service_customer_amendment_queue', 'id', aRequest, 'id'],
    ['service_admin_amendment_queue', 'id', aRequest, 'id'],
    ['service_brief_amendments', 'request_id', aRequest, 'id'],
    ['service_request_journal', 'request_id', aRequest, 'event_key'],
    ['service_request_triage', 'request_id', aRequest, 'request_id'],
  ];
  for (const [resource, field, value, columns] of privateAnonResources) {
    const result = await anon.from(resource).select(columns).eq(field, value).limit(1);
    assertAnonymousIsolation(result, resource);
  }
  success('anonymous access denied across request, amendment, journal and triage resources');

  return true;
}

// Always release only the three dedicated staging sign-in sessions (never
// the anonymous client). Explicit "local" scope is essential: Supabase's
// default global sign-out would revoke unrelated sessions for the account.
// This makes an Auth sign-out request, not a Service business-record write.
export async function runStagingReadiness(config, clientFactory = createSafeClient) {
  const clients = Array.from({ length: 4 },
    () => clientFactory(config.url, config.key));
  let checkError = null;
  try {
    await runStagingChecks(config, clients);
  } catch (error) {
    checkError = error;
  }

  // No short-circuit: an error on one sign-out must not prevent attempts
  // for the other two dedicated staging accounts. Never print SDK errors.
  let cleanupFailed = false;
  for (const client of clients.slice(0, 3)) {
    try {
      enforce(typeof client?.auth?.signOut === 'function',
        'Dedicated staging Auth cleanup is unavailable');
      const result = await client.auth.signOut({ scope: 'local' });
      if (!result || result.error) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  }
  // Preserve the original failed assertion, but never mark the whole run
  // PASSED unless all three cleanup operations were successful.
  if (checkError) throw checkError;
  enforce(!cleanupFailed, 'Dedicated staging Auth session cleanup failed');
  success('dedicated staging Auth session cleanup');
  process.stdout.write('STAGING SERVICE DATA-API ACCEPTANCE: PASSED\n');
  return true;
}

const cli = process.argv[1]?.replace(/\\/g, '/').endsWith('/services-live-readonly-preflight.mjs');
if (cli) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Services staging acceptance. Configure GitHub staging environment with the following keys:\n');
    process.stdout.write(names.join('\n') + '\n');
  } else {
    try {
      const config = validateStagingConfig(process.env);
      await runStagingReadiness(config);
    } catch (e) {
      // Never log full SDK errors: they may include identifiers, URLs,
      // response metadata or credentials.
      const safe = e instanceof AcceptanceEvidenceError
        ? e.message
        : 'Staging configuration, network or runtime validation failed';
      process.stderr.write('SERVICES STAGING ACCEPTANCE FAILED: ' + safe + '\n');
      process.exitCode = 1;
    }
  }
}
