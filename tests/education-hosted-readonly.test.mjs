import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  validateEducationReadOnlyConfig, EDUCATION_READ_APPROVAL,
  EDUCATION_READ_CASES,
} from "../scripts/staging/educationHostedReadOnlyConfig.mjs";
import {
  validateStagingRlsConfig, validateStagingRlsReadOnlyConfig,
  STAGING_RLS_APPROVAL,
} from "../scripts/staging/stagingRlsConfig.mjs";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const workflow = read(".github/workflows/education-hosted-readonly.yml");
const runner = read("scripts/staging/verifyEducationHostedReadOnly.mjs");
const evidence = read("scripts/staging/verifyEducationHostedEvidence.mjs");
const ref = "a".repeat(20);
const uuid = (n) => "10000000-0000-4000-8000-" + String(n).padStart(12, "0");
function valid() {
  return {
    ETERNYX_EDU_STAGING_READ_APPROVAL: EDUCATION_READ_APPROVAL,
    ETERNYX_RLS_STAGING_URL: "https://" + ref + ".supabase.co",
    ETERNYX_RLS_STAGING_REF: ref,
    ETERNYX_RLS_PRODUCTION_REF: "b".repeat(20),
    ETERNYX_RLS_STAGING_PUBLISHABLE_KEY: "sb_publishable_staging-test-not-secret",
    ETERNYX_RLS_TEST_A_EMAIL: "rls-education-a@example.com",
    ETERNYX_RLS_TEST_A_PASSWORD: "a-long-testing-password",
    ETERNYX_RLS_TEST_B_EMAIL: "rls-education-b@example.com",
    ETERNYX_RLS_TEST_B_PASSWORD: "another-long-testing-password",
    ETERNYX_EDU_STAGING_TEST_ID: uuid(1),
    ETERNYX_EDU_STAGING_QUESTION_ID: uuid(2),
    ETERNYX_EDU_STAGING_OPTION_ID: uuid(3),
    ETERNYX_EDU_STAGING_ATTEMPT_ID: uuid(4),
    ETERNYX_EDU_STAGING_ANSWER_ID: uuid(5),
  };
}
test("read-only validator reuses exact staging project identity, ref and anon-key guards", () => {
  const c = validateEducationReadOnlyConfig(valid());
  assert.equal(c.url, "https://" + ref + ".supabase.co");
  assert.equal(c.fixture.testId, uuid(1));
  assert.equal(c.accounts.length, 2);
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.fixture));
});
test("existing manual staging writes still require their own separate exact approval", () => {
  const x = valid();
  assert.doesNotThrow(() => validateStagingRlsReadOnlyConfig(x));
  assert.throws(() => validateStagingRlsConfig(x), /owner approval/);
  x.ETERNYX_RLS_STAGING_APPROVAL = STAGING_RLS_APPROVAL;
  assert.doesNotThrow(() => validateStagingRlsConfig(x));
});
test("read-only host denies missing explicit approval and unrelated approval strings", () => {
  for(const approval of ["", "I_APPROVE_STAGING_FIXTURE_WRITES", "true", undefined]) {
    const x=valid();x.ETERNYX_EDU_STAGING_READ_APPROVAL=approval;
    assert.throws(()=>validateEducationReadOnlyConfig(x), /read-only approval/);
  }
});
test("read-only staging refuses production ref or deliberately misdeclared known production host",()=>{
  const x=valid();x.ETERNYX_RLS_PRODUCTION_REF=ref;
  assert.throws(()=>validateEducationReadOnlyConfig(x), /valid distinct staging/);
  const y=valid();y.ETERNYX_RLS_STAGING_REF="wcncuarekaofmfurbtbh";
  y.ETERNYX_RLS_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co";
  assert.throws(()=>validateEducationReadOnlyConfig(y), /valid distinct staging/);
});
test("read-only staging refuses malformed hosts, key roles and non-dedicated accounts",()=>{
  for(const url of ["http://"+ref+".supabase.co",
    "https://"+ref+".supabase.co/another",
    "https://evil.invalid","https://"+ref+".supabase.co:444"]) {
    const x=valid();x.ETERNYX_RLS_STAGING_URL=url;
    assert.throws(()=>validateEducationReadOnlyConfig(x));
  }
  const x=valid();x.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY="sb_secret_staging-no";
  assert.throws(()=>validateEducationReadOnlyConfig(x));
  const y=valid();y.ETERNYX_RLS_TEST_B_EMAIL="real-customer@example.com";
  assert.throws(()=>validateEducationReadOnlyConfig(y));
});
test("fixture IDs are complete, UUID-shaped and mutually distinct",()=>{
  const keys=["TEST_ID","QUESTION_ID","OPTION_ID","ATTEMPT_ID","ANSWER_ID"];
  for(const k of keys){
    const x=valid();delete x["ETERNYX_EDU_STAGING_"+k];
    assert.throws(()=>validateEducationReadOnlyConfig(x), /fixture/);
    const y=valid();y["ETERNYX_EDU_STAGING_"+k]="not-a-uuid";
    assert.throws(()=>validateEducationReadOnlyConfig(y), /fixture/);
  }
  const x=valid();x.ETERNYX_EDU_STAGING_ANSWER_ID=x.ETERNYX_EDU_STAGING_ATTEMPT_ID;
  assert.throws(()=>validateEducationReadOnlyConfig(x), /distinct/);
});
test("thirty stable nonduplicated evidence case identifiers cover both students and anonymous requests",()=>{
  assert.equal(EDUCATION_READ_CASES.length,30);
  assert.equal(new Set(EDUCATION_READ_CASES).size,30);
  for(const label of [
    "student-a-answer-key-column-denied","student-b-answer-key-column-denied",
    "anonymous-answer-key-column-denied","student-a-enrolled-catalog",
    "student-b-unenrolled-catalog","student-a-own-attempt-readable",
    "student-b-attempt-invisible","student-a-own-answer-readable",
    "student-b-answer-invisible","anonymous-catalog-rpc-denied",
    "both-staging-sessions-signed-out",
  ]) assert.ok(EDUCATION_READ_CASES.includes(label), label);
});
test("runner signs in with independent users and verifies server identities and role authority",()=>{
  assert.match(runner,/signInWithPassword\(config\.accounts\[i\]\)/);
  assert.match(runner,/c\.auth\.getUser\(\)/);
  assert.match(runner,/users\[0\] !== users\[1\]/);
  assert.match(runner,/rpc\("is_admin"\)/);
  assert.match(runner,/rpc\("education_instructor_access"\)/);
  assert.match(runner,/education_student_enrolled_catalog/);
  assert.match(runner,/education_admin_publication_queue/);
});
test("runner checks key SELECT permission errors, not merely missing RLS rows",()=>{
  assert.match(runner,/select\("id,is_correct"\)/);
  assert.match(runner,/requireTrue\(denied\(await c\.from\("options"\)/);
  assert.match(runner,/education_test_enrollments/);
  assert.match(runner,/education_instructor_grants/);
  assert.match(runner,/requireTrue\(invisible\(/);
  assert.match(runner,/selected_option_id === optionId/);
});
test("runner is read-only, sanitized and never accepts bypassed Auth or privileged keys",()=>{
  assert.doesNotMatch(runner,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.remove\(|\.upload\(|\.functions\.invoke\(|auth\.admin\.|service_role/);
  assert.doesNotMatch(runner,/console\.log\(config\)|console\.log\(users\)|JSON\.stringify\(login\)|process\.stdout\.write\(JSON\.stringify\(config/);
  assert.match(runner,/production_tested: false/);
  assert.match(runner,/production_certified: false/);
  assert.match(runner,/writes_performed: false/);
  assert.match(runner,/c\.auth\.signOut\(\)/);
});
test("manual workflow uses protected environment, exact approval, public key and no PR triggers",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/approve_education_read_only:/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/environment: rls-staging/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/verifyEducationHostedReadOnly\.mjs/);
  assert.match(workflow,/verifyEducationHostedEvidence\.mjs/);
  assert.match(workflow,/if: always\(\)/);
  assert.doesNotMatch(workflow,/\n\s+push:|\n\s+pull_request:|\n\s+schedule:|SERVICE_ROLE/);
});
test("evidence verifier requires all exact successful cases and no production certification",()=>{
  assert.match(evidence,/EDUCATION_READ_CASES\.length/);
  assert.match(evidence,/data\.production_tested !== false/);
  assert.match(evidence,/data\.production_certified !== false/);
  assert.match(evidence,/data\.writes_performed !== false/);
  assert.match(evidence,/data\.sessions_signed_out !== true/);
});
test("all new acceptance scripts are syntactically valid, without staging credentials",()=>{
  for(const file of [
    "scripts/staging/stagingRlsConfig.mjs",
    "scripts/staging/educationHostedReadOnlyConfig.mjs",
    "scripts/staging/verifyEducationHostedReadOnly.mjs",
    "scripts/staging/verifyEducationHostedEvidence.mjs",
  ]) {
    const x=spawnSync(process.execPath, ["--check", new URL("../"+file,import.meta.url).pathname], {
      encoding:"utf8",timeout:10000,
    });
    assert.equal(x.status,0, x.stderr||x.stdout);
  }
});
