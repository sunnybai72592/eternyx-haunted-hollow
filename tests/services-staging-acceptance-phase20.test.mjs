import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateStagingConfig, runStagingReadiness, assertAnonymousIsolation,
} from '../scripts/services-live-readonly-preflight.mjs';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const A_ID = '123e4567-e89b-42d3-a456-426614174001';
const B_ID = '123e4567-e89b-42d3-a456-426614174002';

function config(overrides = {}) {
  return {
    SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co',
    SERVICES_PREFLIGHT_PUBLISHABLE_KEY: 'sb_publishable_testing_only',
    SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF: 'safe-stage-project',
    SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL: 'a@example.invalid',
    SERVICES_PREFLIGHT_CUSTOMER_A_PASSWORD: 'dummy-a',
    SERVICES_PREFLIGHT_CUSTOMER_A_REQUEST_ID: A_ID,
    SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL: 'b@example.invalid',
    SERVICES_PREFLIGHT_CUSTOMER_B_PASSWORD: 'dummy-b',
    SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID: B_ID,
    SERVICES_PREFLIGHT_ADMIN_EMAIL: 'admin@example.invalid',
    SERVICES_PREFLIGHT_ADMIN_PASSWORD: 'dummy-admin',
    SERVICES_PREFLIGHT_CONFIRM: 'READ_ONLY_STAGING_ACCEPTANCE',
    ...overrides,
  };
}

test('only explicit, fully configured and exact-host staging targets are accepted', () => {
  const okay = validateStagingConfig(config());
  assert.equal(okay.url, 'https://safe-stage-project.supabase.co');
  assert.equal(okay.customers[0].requestId, A_ID);
  assert.equal(okay.customers[1].requestId, B_ID);
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_CONFIRM: '' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_CONFIRM: 'NOT_APPROVED' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL: 'A@example.invalid' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID: A_ID })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID: 'not-a-uuid' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'http://safe-stage-project.supabase.co' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co:8443' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co@evil.invalid' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://staging-user@safe-stage-project.supabase.co/' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co/?token=fake' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co/#fragment' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_URL: 'https://safe-stage-project.supabase.co/path' })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF: 'different-stage' })));
  assert.throws(() => validateStagingConfig(config({
    SERVICES_PREFLIGHT_URL: 'https://wcncuarekaofmfurbtbh.supabase.co',
    SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF: 'wcncuarekaofmfurbtbh',
  })));
});

test('privileged API keys are rejected rather than silently disabling RLS', () => {
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_PUBLISHABLE_KEY: 'sb_secret_not_allowed' })));
  const jwt = (role) => ['header', Buffer.from(JSON.stringify({role})).toString('base64url'), 'signature'].join('.');
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_PUBLISHABLE_KEY: jwt('service_role') })));
  assert.doesNotThrow(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_PUBLISHABLE_KEY: jwt('anon') })));
  assert.throws(() => validateStagingConfig(config({ SERVICES_PREFLIGHT_PUBLISHABLE_KEY: 'plain_invalid_key' })));
});

function fakeFactory(options = {}) {
  const identities = ['user-A', 'user-B', 'admin-1', 'anonymous'];
  const records = {
    service_requests: [
      {id:A_ID,user_id:'user-A',owner:'user-A'}, {id:B_ID,user_id:'user-B',owner:'user-B'},
    ],
    service_customer_amendment_queue: [
      {id:A_ID,user_id:'user-A',owner:'user-A'}, {id:B_ID,user_id:'user-B',owner:'user-B'},
    ],
    service_admin_amendment_queue: [
      {id:A_ID,owner:'admin'}, {id:B_ID,owner:'admin'},
    ],
    service_request_activity: [
      {id:'activity-A',request_id:A_ID,owner:'user-A'}, {id:'activity-B',request_id:B_ID,owner:'user-B'},
    ],
    service_scope_reviews: [{id:'scope-1',request_id:A_ID,owner:'user-A'}],
    service_scope_responses: [{id:'scope-response-1',review_id:'scope-1',owner:'user-A'}],
    service_clarification_questions: [{id:'question-1',request_id:A_ID,owner:'user-A'}],
    service_clarification_answers: [{id:'answer-1',question_id:'question-1',owner:'user-A'}],
    service_brief_amendments: [{id:'amendment-1',request_id:A_ID,owner:'user-A'}],
    service_request_journal: [
      {event_key:'activity:1',request_id:A_ID,owner:'user-A'},
      {event_key:'activity:2',request_id:B_ID,owner:'user-B'},
    ],
    service_request_triage: [{request_id:A_ID,owner:'admin'}],
  };
  let index = 0;
  const calls = [];
  return {
    calls,
    client: (_url, _key) => {
      const actor = identities[index++];
      return {
        auth: {
          signInWithPassword: async () => ({
            data:{user:{id:actor}},error:null,
          }),
          getUser: async () => ({
            data:{user:{id:actor}},error:null,
          }),
        },
        rpc: async () => ({data: actor === 'admin-1' && !options.adminRoleRemoved,error:null}),
        from(table) {
          const query = {
            conditions: [],
            select(_columns) { this.columns = _columns; return this; },
            eq(field,value) { this.conditions.push((r)=>r[field]===value); return this; },
            in(field,values) { this.conditions.push((r)=>values.includes(r[field])); return this; },
            async limit(size) {
              calls.push({actor,table,columns:this.columns});
              if (actor === 'anonymous' && options.anonResult) return typeof options.anonResult === 'function' ? options.anonResult(table) : options.anonResult;
              if (actor === 'user-A' && table === 'service_requests' && options.nullOwnerResponse)
                return {data:null,error:null,status:200};
              if (options.missingJournal && table === 'service_request_journal')
                return {data:null,error:{code:'PGRST205'}};
              let input = records[table] ?? [];
              if (actor === 'anonymous') input = [];
              else if (actor !== 'admin-1') {
                input = input.filter((r)=>
                  r.owner === actor
                    || (options.leakCustomerB && actor === 'user-B' && table === 'service_requests' && r.owner === 'user-A'));
              }
              return {data:input.filter((r)=>this.conditions.every((check)=>check(r))).slice(0,size),error:null,status:200};
            },
          };
          return query;
        },
      };
    },
  };
}

test('live gate checks actual owned fixtures across all Services sources without writing data', async () => {
  const factory = fakeFactory();
  const accepted = await runStagingReadiness(validateStagingConfig(config()), factory.client);
  assert.equal(accepted,true);
  assert.ok(factory.calls.some((x)=>x.table==='service_request_journal'));
  assert.ok(factory.calls.some((x)=>x.table==='service_brief_amendments'));
  assert.ok(factory.calls.some((x)=>x.table==='service_request_triage'));
  const anonymousSources = factory.calls.filter((x)=>x.actor==='anonymous').map((x)=>x.table);
  assert.deepEqual(anonymousSources, [
    'service_requests', 'service_customer_amendment_queue',
    'service_admin_amendment_queue', 'service_brief_amendments',
    'service_request_journal', 'service_request_triage',
  ]);
  assert.equal(factory.calls.some((x)=>x.columns==='*'),false);
});

test('cross-customer data leakage fails the release gate', async () => {
  const factory = fakeFactory({leakCustomerB:true});
  await assert.rejects(
    runStagingReadiness(validateStagingConfig(config()), factory.client),
    /unrelated account can see a forbidden fixture/,
  );
});

test('missing Phase 14 journal is not treated as zero rows or a pass', async () => {
  const factory = fakeFactory({missingJournal:true});
  await assert.rejects(
    runStagingReadiness(validateStagingConfig(config()), factory.client),
    /required staging query failed for service_request_journal/,
  );
});

test('a revoked or unverifiable admin role fails before any private admin queries', async () => {
  const factory = fakeFactory({adminRoleRemoved:true});
  await assert.rejects(
    runStagingReadiness(validateStagingConfig(config()), factory.client),
    /Administrator-role boundary is not verified/,
  );
  assert.equal(factory.calls.some((c)=>c.actor==='admin-1'&&c.table==='service_admin_amendment_queue'),false);
});

test('only direct read operations and Auth sign-in are allowed by source contract', async () => {
  const src=await read('scripts/services-live-readonly-preflight.mjs');
  const action=await read('.github/workflows/services-staging-acceptance.yml');
  const sql=await read('docs/sql/eternyx/services-phase20-readonly-schema-check.sql');
  assert.match(src, /import \{ createClient \} from '@supabase\/supabase-js'/);
  assert.match(src, /autoRefreshToken: false, persistSession: false, detectSessionInUrl: false/);
  assert.match(src, /AbortSignal\.timeout\(TIMEOUT_MS\)/);
  assert.match(src, /const PRODUCTION_REF = 'wcncuarekaofmfurbtbh'/);
  assert.match(src, /signInWithPassword/);
  assert.match(src, /service_scope_responses/);
  assert.match(src, /service_clarification_answers/);
  assert.match(src, /service_customer_amendment_queue/);
  assert.match(src, /service_admin_amendment_queue/);
  assert.match(src, /service_request_journal/);
  assert.match(src, /service_request_triage/);
  assert.doesNotMatch(src, /\.(insert|update|delete|upsert|storage\.upload)\(/);
  assert.doesNotMatch(src, /supabase\.auth\.admin|\.auth\.admin\./);
  assert.match(src, /payload\.role === 'service_role'/);
  assert.match(action, /workflow_dispatch:/);
  assert.match(action, /environment: services-staging/);
  assert.match(action, /permissions:\s*contents: read/);
  assert.match(action, /SERVICES_PREFLIGHT_CONFIRM:/);
  assert.match(action, /run: npm run services:staging:acceptance/);
  assert.doesNotMatch(action, /pull_request:|push:/);
  assert.match(sql,/service_brief_amendments/);
  assert.match(sql,/security_invoker=true/);
  assert.match(sql,/pg_catalog\.pg_stat_activity/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE TABLE)\s+public\./i);
});

test('the Phase 20 release notes preserve the separate SQL-history and real-data gates', async () => {
  const doc=await read('docs/ETERNYX_SERVICES_RELEASE_GATE_PHASE20.md');
  assert.match(doc,/Phase 13 before Phase 14/i);
  assert.match(doc,/customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(doc,/database connection timeout/i);
  assert.match(doc,/not production.ready/i);
  assert.match(doc,/Auth sessions/i);
  assert.match(doc,/READ_ONLY_STAGING_ACCEPTANCE/);
});

test('anonymous privacy evidence accepts empty HTTP success or an explicit SQL permission denial', () => {
  assert.doesNotThrow(() => assertAnonymousIsolation({data:[],error:null,status:200},'service_requests'));
  assert.doesNotThrow(() => assertAnonymousIsolation({data:[],error:null,status:206},'service_requests'));
  assert.doesNotThrow(() => assertAnonymousIsolation({data:null,error:{code:'42501'},status:403},'service_requests'));
  assert.doesNotThrow(() => assertAnonymousIsolation({data:null,error:{code:'42501'},status:401},'service_requests'));
});

test('network errors, missing relations, ambiguous results and leaked anonymous rows all fail closed', () => {
  const failures = [
    {data:null,error:{code:'PGRST205'},status:404},
    {data:null,error:{code:'57014'},status:504},
    {data:null,error:{code:'42501'},status:500},
    {data:null,error:{code:'PGRST301'},status:401},
    {data:null,error:null,status:200},
    {data:undefined,error:null,status:200},
    {data:[{id:A_ID}],error:null,status:200},
    {data:[],error:null,status:503},
    null,
  ];
  for (const result of failures) {
    assert.throws(() => assertAnonymousIsolation(result,'service_requests'), /Acceptance failed/);
  }
});

test('real acceptance rejects a missing anonymous journal instead of showing a false PASS', async () => {
  const factory = fakeFactory({anonResult:(table) => table === 'service_request_journal'
    ? {data:null,error:{code:'PGRST205'},status:404}
    : {data:[],error:null,status:200}});
  await assert.rejects(runStagingReadiness(validateStagingConfig(config()),factory.client),
    /anonymous access was not a verified permission denial/);
});

test('real acceptance supports provable anonymous SQL permission denial', async () => {
  const factory = fakeFactory({anonResult:{data:null,error:{code:'42501'},status:403}});
  assert.equal(await runStagingReadiness(validateStagingConfig(config()),factory.client),true);
});

test('malformed owner SELECT success is never interpreted as an empty inbox', async () => {
  const factory = fakeFactory({nullOwnerResponse:true});
  await assert.rejects(runStagingReadiness(validateStagingConfig(config()),factory.client),
    /required staging query failed for service_requests/);
});

test('operator notes keep migration history and production sign-off independently blocked', async () => {
  const notes=await read('docs/ETERNYX_SERVICES_STAGING_EVIDENCE_PHASE24.md');
  assert.match(notes,/no new migration/i);
  assert.match(notes,/Phase 13 before Phase 14/);
  assert.match(notes,/independent catalog/i);
  assert.match(notes,/connection timeout/i);
  assert.match(notes,/permission denial/i);
  assert.match(notes,/does not restore database connectivity/i);
});
