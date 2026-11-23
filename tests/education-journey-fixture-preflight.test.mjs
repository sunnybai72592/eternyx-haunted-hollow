import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  FIXTURE_CHECKS,snapshotJourneyFixture,assertJourneyFixtureEvidence,
} from "../scripts/staging/educationJourneyFixturePreflight.mjs";
import {JOURNEY_APPROVAL} from "../scripts/staging/educationJourneyHandoff.mjs";

const env={
  ETERNYX_EDU_RELEASE_MODE:"journey",
  ETERNYX_EDU_JOURNEY_APPROVAL:JOURNEY_APPROVAL,
  GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"803",GITHUB_RUN_ATTEMPT:"1",
};
const raw=()=>({schema:1,checks:Object.fromEntries(FIXTURE_CHECKS.map(k=>[k,true]))});
const sql=readFileSync(new URL("../scripts/sql/education-hosted-journey-fixture.sql",import.meta.url),"utf8");
const executor=readFileSync(new URL("../scripts/staging/educationJourneyFixturePreflight.mjs",import.meta.url),"utf8");
const release=readFileSync(new URL("../scripts/staging/runEducationHostedRelease.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");

test("only exact twenty-one successful fixture checks produce a sanitized read-only report",()=>{
  assert.equal(FIXTURE_CHECKS.length,21);
  assert.equal(new Set(FIXTURE_CHECKS).size,FIXTURE_CHECKS.length);
  const proof=snapshotJourneyFixture(raw(),env);
  assert.equal(assertJourneyFixtureEvidence(proof,env),true);
  assert.equal(proof.passed_checks,21);
  assert.equal(proof.production_tested,false);
  assert.equal(proof.production_certified,false);
  assert.equal(JSON.stringify(proof).includes("10000000-"),false);
});
test("each missing or false preflight condition blocks the one-shot staging journey",()=>{
  for(const name of FIXTURE_CHECKS){
    const d=raw();d.checks[name]=false;
    assert.throws(()=>snapshotJourneyFixture(d,env),name);
  }
  const missing=raw();delete missing.checks[FIXTURE_CHECKS[0]];
  assert.throws(()=>snapshotJourneyFixture(missing,env));
  const extra=raw();extra.checks.arbitrary=true;
  assert.throws(()=>snapshotJourneyFixture(extra,env));
  const wrongType=raw();wrongType.checks[FIXTURE_CHECKS[0]]="true";
  assert.throws(()=>snapshotJourneyFixture(wrongType,env));
});
test("missing journey approval and wrong run/attempt reject both report generation and reuse",()=>{
  assert.throws(()=>snapshotJourneyFixture(raw(),{...env,ETERNYX_EDU_JOURNEY_APPROVAL:""}));
  assert.throws(()=>snapshotJourneyFixture(raw(),{...env,ETERNYX_EDU_RELEASE_MODE:"rehearsal"}));
  const proof=snapshotJourneyFixture(raw(),env);
  for(const mutate of [
    a=>{a.github_run_attempt="2";},
    a=>{a.github_run_id="900";},
    a=>{a.source_sha="b".repeat(40);},
    a=>{a.read_only=false;},
    a=>{a.results[0].result="failed";},
    a=>{a.results[0].role="secret";},
    a=>{a.results.pop();},
    a=>{a.production_certified=true;},
  ]){
    const modified=structuredClone(proof);mutate(modified);
    assert.throws(()=>assertJourneyFixtureEvidence(modified,env));
  }
});
test("fixture SQL is read only, only returns booleans and checks instructor and score",()=>{
  assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql,/ROLLBACK;/);
  assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|TRUNCATE|GRANT EXECUTE|ALTER TABLE|DROP TABLE)\b/i);
  assert.match(sql,/auth\.users/);
  assert.match(sql,/education_instructor_grants/);
  assert.match(sql,/education_test_enrollments/);
  assert.match(sql,/is_correct/);
  assert.match(sql,/expected_score/);
  assert.match(sql,/expected_max/);
  assert.match(sql,/user_attempts/);
  assert.match(sql,/access_password_hash/);
  assert.match(sql,/duration_minutes BETWEEN 30 AND 1440/);
  assert.match(sql,/count\(\*\) FILTER \(WHERE is_correct IS TRUE\)=1/);
  assert.match(sql,/option_text/);
  assert.match(sql,/education_written_reviews/);
  assert.match(sql,/count\(\*\)<90/);
  assert.match(sql,/reviewer_has_one_unambiguous_grant/);
  for(const key of FIXTURE_CHECKS)assert.ok(sql.includes("'"+key+"'"),key);
});
test("single-use planning happens before any write and DB password is step scoped",()=>{
  const auditStep=workflow.indexOf("node scripts/staging/educationHostedDbMetadata.mjs");
  const fixtureStep=workflow.indexOf("node scripts/staging/educationJourneyFixturePreflight.mjs");
  const stageStep=workflow.indexOf("node scripts/staging/runEducationHostedRelease.mjs");
  assert.ok(auditStep>0 && fixtureStep>auditStep && stageStep>fixtureStep);
  assert.match(workflow,/if: inputs\.run_mode == 'journey'/);
  assert.match(workflow,/ETERNYX_EDU_STAGING_DB_PASSWORD: \$\{\{ secrets\.ETERNYX_EDU_STAGING_DB_PASSWORD \}\}/);
  assert.match(executor,/PGSSLMODE:"require"/);
  assert.match(executor,/PGOPTIONS:"-c default_transaction_read_only=on/);
  assert.doesNotMatch(executor,/process\.stdout\.write\(done\.stdout|process\.stderr\.write\(done\.stderr/);
  assert.ok(release.indexOf("assertJourneyFixtureEvidence(fixtureEvidence") <
    release.indexOf("for(const stage of stages)"));
});

// These are all fail-closed source-level regression contracts; live staging
// still has to prove the grants and the actual exam fixtures.
test("new one-shot safeguards match the deployed atomic CBT and review source contracts",()=>{
  const atomic=readFileSync(new URL("../scripts/sql/staging-education-cbt-atomic-security.sql",import.meta.url),"utf8");
  const review=readFileSync(new URL("../scripts/sql/staging-education-written-review.sql",import.meta.url),"utf8");
  assert.match(atomic,/access_password_hash/);
  assert.match(atomic,/NOT BETWEEN 1 AND 1440/);
  assert.match(review,/LIMIT 100/);
  for(const name of ["exam_not_password_locked","exam_has_safe_test_window","reviewer_has_one_unambiguous_grant","instructor_queue_has_spare_capacity","mcq_has_one_correct_option","mcq_choices_have_valid_labels"])
    assert.ok(FIXTURE_CHECKS.includes(name),name);
  assert.ok(sql.includes("JOIN public.teachers t ON t.id=g.teacher_id AND t.user_id=g.user_id"));
});
