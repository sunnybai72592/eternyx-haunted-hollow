import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateStagingRlsConfig, STAGING_RLS_APPROVAL, ISOLATION_SCENARIOS } from "../scripts/staging/stagingRlsConfig.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const runner = read("scripts/staging/verifyRlsTwoUsers.mjs");
const workflow = read(".github/workflows/staging-rls-acceptance.yml");
const check = read("scripts/staging/checkStagingRlsEnvironment.mjs");
const doc = read("docs/STAGING_TWO_ACCOUNT_RLS_ACCEPTANCE_2026-11.md");
const prodRef = "b".repeat(20);
const stagingRef = "a".repeat(20);
const valid = () => ({
  ETERNYX_RLS_STAGING_APPROVAL: STAGING_RLS_APPROVAL,
  ETERNYX_RLS_STAGING_URL: "https://" + stagingRef + ".supabase.co",
  ETERNYX_RLS_STAGING_REF: stagingRef,
  ETERNYX_RLS_PRODUCTION_REF: prodRef,
  ETERNYX_RLS_STAGING_PUBLISHABLE_KEY: "sb_publishable_staging-only-test-key",
  ETERNYX_RLS_TEST_A_EMAIL: "rls-a@example.com",
  ETERNYX_RLS_TEST_B_EMAIL: "rls-b@example.com",
  ETERNYX_RLS_TEST_A_PASSWORD: "a-long-unique-testing-password",
  ETERNYX_RLS_TEST_B_PASSWORD: "another-long-testing-password",
});

test("manual staging config accepts exact HTTPS host, distinct refs and dedicated accounts", () => {
  const config = validateStagingRlsConfig(valid());
  assert.equal(config.url, "https://" + stagingRef + ".supabase.co");
  assert.equal(config.accounts.length, 2);
  assert.equal(config.projectRef, stagingRef);
  assert.ok(Object.isFrozen(config));
});

test("the known real production project is refused even with a misdeclared production ref", () => {
  const x = valid();
  x.ETERNYX_RLS_STAGING_REF = "wcncuarekaofmfurbtbh";
  x.ETERNYX_RLS_STAGING_URL = "https://wcncuarekaofmfurbtbh.supabase.co";
  assert.throws(() => validateStagingRlsConfig(x), /valid distinct staging and production refs required/);
});

test("missing explicit permission, staging ref or production guard fails closed", () => {
  for (const field of ["ETERNYX_RLS_STAGING_APPROVAL","ETERNYX_RLS_PRODUCTION_REF","ETERNYX_RLS_STAGING_REF"]) {
    const x=valid(); delete x[field];
    assert.throws(() => validateStagingRlsConfig(x), /Staging RLS test refused/);
  }
  const x=valid();x.ETERNYX_RLS_STAGING_APPROVAL="please approve";
  assert.throws(()=>validateStagingRlsConfig(x), /owner approval/);
  const y=valid();y.ETERNYX_RLS_PRODUCTION_REF=stagingRef;
  assert.throws(()=>validateStagingRlsConfig(y), /valid distinct staging/);
});

test("wrong host, HTTP, ports, paths, queries and credentials in URLs are rejected", () => {
  for(const invalid of [
    "http://" + stagingRef + ".supabase.co",
    "https://" + stagingRef + ".supabase.co/other",
    "https://" + stagingRef + ".supabase.co:444",
    "https://evil.example",
    "https://" + stagingRef + ".supabase.co?q=secret",
    "https://person:password@" + stagingRef + ".supabase.co",
  ]){
    const x=valid();x.ETERNYX_RLS_STAGING_URL=invalid;
    assert.throws(()=>validateStagingRlsConfig(x), /only the exact HTTPS staging Supabase host/);
  }
});

test("service role and secret keys cannot be used, including legacy JWT role", () => {
  for (const key of [
    "sb_secret_do-not-use-in-ci-ever",
    "service_role_secret_key",
    "missing",
    ["a", Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url"), "c"].join("."),
  ]) {
    const x=valid();x.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY=key;
    assert.throws(()=>validateStagingRlsConfig(x), /Staging RLS test refused/);
  }
  const anonPayload=Buffer.from(JSON.stringify({role:"anon"})).toString("base64url");
  const key=["a",anonPayload,"c"].join(".");
  const x=valid();x.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY=key;
  assert.equal(validateStagingRlsConfig(x).publishableKey,key);
});

test("only two separate dedicated staging user accounts with strong passwords are allowed", () => {
  const x=valid();x.ETERNYX_RLS_TEST_B_EMAIL=x.ETERNYX_RLS_TEST_A_EMAIL;
  assert.throws(()=>validateStagingRlsConfig(x), /must be distinct/);
  const y=valid();y.ETERNYX_RLS_TEST_A_EMAIL="customer@example.com";
  assert.throws(()=>validateStagingRlsConfig(y), /dedicated rls-/);
  const z=valid();z.ETERNYX_RLS_TEST_A_PASSWORD="short";
  assert.throws(()=>validateStagingRlsConfig(z), /dedicated rls-/);
});

test("real private table fixtures match source-reviewed schemas and do no pentest scanning", () => {
  assert.deepEqual(ISOLATION_SCENARIOS.map(x=>x.table),
    ["conversation_sessions","chat_history","pentest_engagements"]);
  assert.deepEqual(ISOLATION_SCENARIOS.map(x=>x.owner),
    ["user_id","user_id","owner_id"]);
  assert.equal(ISOLATION_SCENARIOS[1].canUpdate,false);
  for(const s of ISOLATION_SCENARIOS){
    const data=s.makeFixture("user-staging-id","synthetic");
    assert.equal(data[s.owner],"user-staging-id");
    assert.ok(JSON.stringify(data).includes("ETERNYX-RLS-synthetic"));
  }
  const engagement=ISOLATION_SCENARIOS[2].makeFixture("test-id","synthetic");
  assert.equal(engagement.status,"draft");
  assert.equal(engagement.authorization_attested,false);
  assert.deepEqual(engagement.scope_targets,[]);
});

test("staging runner authenticates independently, validates non-admin and checks RLS against both users",()=>{
  assert.match(runner,/signInWithPassword\(config\.accounts\[index\]\)/);
  assert.match(runner,/c\.auth\.getUser\(\)/);
  assert.match(runner,/users\[0\] !== users\[1\]/);
  assert.match(runner,/c\.rpc\("is_admin"\)/);
  assert.match(runner,/r\.data === false/);
  assert.match(runner,/profiles\.cross-user-read-denied/);
  assert.match(runner,/is_profile_public === false/);
  assert.match(runner,/cross-read-denied/);
  assert.match(runner,/anon-read-denied/);
  assert.match(runner,/forged-owner-insert-denied/);
  assert.match(runner,/cross-update-denied/);
  assert.match(runner,/cross-delete-denied/);
});

test("synthetic fixtures are cleaned using owner test sessions before sign-out",()=>{
  assert.match(runner,/fixtures\.reverse\(\)/);
  assert.match(runner,/cleanupClients\[fixture\.ownerIndex\]/);
  assert.match(runner,/owner\.from\(fixture\.table\)\.delete\(\)/);
  assert.match(runner,/cleanupFailed = true/);
  assert.match(runner,/c\.auth\.signOut\(\)/);
  assert.ok(runner.indexOf("for (const fixture of fixtures.reverse())") < runner.indexOf("c.auth.signOut()"));
  assert.doesNotMatch(runner,/auth\.admin\.|createUser\(/);
});

test("GitHub workflow is manual, environment protected, and has explicit staging write authorization",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/approve_staging_fixture_writes:/);
  assert.match(workflow,/type: boolean/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/environment: rls-staging/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/node scripts\/staging\/checkStagingRlsEnvironment\.mjs/);
  assert.match(workflow,/node scripts\/staging\/verifyRlsTwoUsers\.mjs/);
  assert.match(workflow,/test-results\/staging-rls-isolation\.json/);
  assert.doesNotMatch(workflow,/\n\s+push:|\n\s+pull_request:|\n\s+schedule:|SERVICE_ROLE|service_role/);
});

test("logs and uploaded artifact contain only case names, booleans and no account data",()=>{
  assert.match(runner,/production_tested: false/);
  assert.match(runner,/production_certified: false/);
  assert.match(runner,/results\.push\(\{ case: caseId, result: passed \? "passed" : "failed" \}\)/);
  assert.doesNotMatch(runner,/console\.log\(config\)|console\.log\(users\)|JSON\.stringify\(config\)|"email":|"password":|"access_token":/);
  assert.match(check,/without printing secrets|STAGING RLS CONFIG REJECTED/);
  assert.doesNotMatch(check,/console\.log\(process\.env\)|JSON\.stringify\(process\.env\)/);
});

test("documentation requires isolated stage, reviewers, dedicated accounts and no production access",()=>{
  assert.match(doc,/separate Supabase staging project/i);
  assert.match(doc,/required.*reviewer|require a trusted reviewer/i);
  assert.match(doc,/publishable\/anon key/i);
  assert.match(doc,/public profiles/i);
  assert.match(doc,/explicit.*approval/i);
  assert.match(doc,/cleanup failure/i);
  assert.match(doc,/not.*proof of full production/i);
});

test("all staging runner JavaScript syntax checks pass without connecting to Supabase",()=>{
  for(const file of [
    "scripts/staging/stagingRlsConfig.mjs",
    "scripts/staging/checkStagingRlsEnvironment.mjs",
    "scripts/staging/verifyRlsTwoUsers.mjs",
  ]){
    const out=spawnSync(process.execPath,["--check",new URL("../"+file,import.meta.url).pathname],
      {encoding:"utf8",timeout:10000});
    assert.equal(out.status,0,out.stderr||out.stdout);
  }
});
