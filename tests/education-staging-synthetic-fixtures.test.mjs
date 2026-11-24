import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {operatorConfig,validateManifest,MANIFEST_KEYS,APPROVAL,STAGING_REF} from "../scripts/staging/educationStagingSyntheticFixtures.mjs";
import {COMMON_KEYS,WRITE_KEYS} from "../scripts/staging/educationStagingConfigurationInventory.mjs";
const env={ETERNYX_EDU_FIXTURE_APPROVAL:APPROVAL,ETERNYX_RLS_STAGING_REF:STAGING_REF,ETERNYX_RLS_STAGING_URL:"https://"+STAGING_REF+".supabase.co",ETERNYX_RLS_PRODUCTION_REF:"p".repeat(20),ETERNYX_EDU_STAGING_DB_PASSWORD:"synthetic-local-password",ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.invalid",ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.invalid",ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-i@example.invalid",ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:"rls-op@example.invalid"};
test("operator config pins actual staging host, four dedicated accounts and explicit approval",()=>{
 assert.equal(operatorConfig(env).PGSSLMODE,"require");
 for(const patch of [{ETERNYX_EDU_FIXTURE_APPROVAL:""},{ETERNYX_RLS_STAGING_REF:"p".repeat(20)},{ETERNYX_RLS_PRODUCTION_REF:STAGING_REF},{ETERNYX_RLS_INSTRUCTOR_EMAIL:env.ETERNYX_RLS_TEST_A_EMAIL},{ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:"admin@example.invalid"}])assert.throws(()=>operatorConfig({...env,...patch}));
});
test("all Education fixture variables are generated, without credential settings",()=>{
 const expected=[...COMMON_KEYS,...WRITE_KEYS].filter(k=>/^ETERNYX_EDU_/.test(k)&&!/(?:DB_PASSWORD|SERVICE_ROLE_KEY)$/.test(k));
 assert.deepEqual([...MANIFEST_KEYS].sort(),expected.sort());
 const v=Object.fromEntries(MANIFEST_KEYS.map((k,i)=>[k,/(?:_SCORE|_MAX|_POINTS)$/.test(k)?(k.endsWith("_POINTS")?"2":"7"):"10000000-0000-4000-8000-"+String(i+1).padStart(12,"0")]));
 v.ETERNYX_EDU_REVIEW_ATTEMPT_ID=v.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT;
 assert.equal(validateManifest(v),v);
 assert.throws(()=>validateManifest({...v,secret:"private"}));
 assert.throws(()=>validateManifest({...v,ETERNYX_EDU_WRITE_TEST_ID:v.ETERNYX_EDU_STAGING_TEST_ID}));
});
test("fixture SQL is transactional, refuses collisions, and does not create auth/admin records or directly insert grades",()=>{
 const sql=readFileSync(new URL("../scripts/sql/education-staging-synthetic-fixtures.sql",import.meta.url),"utf8");
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/public\.education_finalize_cbt_grade\(attempt\)/);
 assert.match(sql,/IF kind='fresh' THEN[\s\S]*?CONTINUE;/);
 assert.doesNotMatch(sql,/INSERT INTO (?:auth\.users|public\.admin_users|public\.education_final_grades)|DELETE FROM|TRUNCATE/i);
});
