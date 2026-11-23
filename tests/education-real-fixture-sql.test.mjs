import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FIXTURE_CHECKS} from "../scripts/staging/educationJourneyFixturePreflight.mjs";
import {
 CONTAINER,NEGATIVE_FIXTURE_CASES,parseFixtureSnapshot,isolatedFixtureTransaction,
} from "../scripts/staging/verifyEducationRealFixtureSql.mjs";
const source=readFileSync(new URL("../scripts/sql/education-hosted-journey-fixture.sql",import.meta.url),"utf8");
const runner=readFileSync(new URL("../scripts/staging/verifyEducationRealFixtureSql.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/education-postgres-security.yml",import.meta.url),"utf8");
const mock=(falseName)=>JSON.stringify({
 schema:1,checks:Object.fromEntries(FIXTURE_CHECKS.map(k=>[k,k!==falseName])),
});
test("twenty-one checks require actual boolean outputs from exact hosted SQL",()=>{
 assert.equal(FIXTURE_CHECKS.length,21);
 assert.equal(parseFixtureSnapshot(mock()).passed,21);
 assert.match(source,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(source,/ROLLBACK;/);
 assert.equal(CONTAINER,"eternyx-education-db-ci");
});
test("strict parser rejects missing, extra, false and fabricated SQL reports",()=>{
 assert.throws(()=>parseFixtureSnapshot(mock(FIXTURE_CHECKS[0])));
 assert.throws(()=>parseFixtureSnapshot("bad result"));
 assert.throws(()=>parseFixtureSnapshot(mock()+"\n"+mock()));
 const wrong=JSON.parse(mock());wrong.checks[FIXTURE_CHECKS[0]]="true";
 assert.throws(()=>parseFixtureSnapshot(JSON.stringify(wrong)));
 const extra=JSON.parse(mock());extra.checks.illegal=true;
 assert.throws(()=>parseFixtureSnapshot(JSON.stringify(extra)));
});
test("six real SQL negative cases must flip exactly their specified condition",()=>{
 assert.equal(NEGATIVE_FIXTURE_CASES.length,5);
 assert.equal(new Set(NEGATIVE_FIXTURE_CASES.map(x=>x.failed)).size,5);
 for(const probe of NEGATIVE_FIXTURE_CASES){
  assert.equal(parseFixtureSnapshot(mock(probe.failed),probe.failed).passed,21);
  assert.throws(()=>parseFixtureSnapshot(mock(),probe.failed));
  const altered=isolatedFixtureTransaction(source,probe.sql);
  assert.match(altered,/^BEGIN;\n/);
  assert.match(altered,/ROLLBACK;\s*$/);
  assert.ok(altered.indexOf(probe.sql)<altered.indexOf("WITH\n"));
  assert.ok(altered.includes("SELECT pg_catalog.jsonb_build_object"));
 }
 assert.equal(parseFixtureSnapshot(mock("expected_grade_matches_fixed_choice_and_review"),
 "expected_grade_matches_fixed_choice_and_review").passed,21);
});
test("no arbitrary writes, no online credentials, exact PostgreSQL workflow ordering",()=>{
 assert.throws(()=>isolatedFixtureTransaction(source,"DROP SCHEMA public CASCADE"));
 assert.throws(()=>isolatedFixtureTransaction("SELECT 1;","UPDATE public.tests SET duration_minutes=1"));
 assert.doesNotMatch(runner,/ETERNYX_RLS_STAGING_URL|sb_secret_|supabase\.co/);
 assert.match(runner,/"exec","-i",CONTAINER/);
 assert.match(workflow,/--network none --name eternyx-education-db-ci/);
 assert.match(workflow,/verifyEducationRealFixtureSql.mjs --run/);
 assert.ok(workflow.indexOf("staging-education-immutable-final-grade-records.sql")<
  workflow.indexOf("verifyEducationRealFixtureSql.mjs --run"));
 assert.match(workflow,/education-hosted-journey-fixture-ci.sql/);
});
