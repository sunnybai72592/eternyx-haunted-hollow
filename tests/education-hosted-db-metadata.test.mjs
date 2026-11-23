import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DATABASE_CHECKS,validateEducationDbConfig,validateEducationDbSnapshot} from "../scripts/staging/educationHostedDbMetadata.mjs";
const sql=readFileSync(new URL("../scripts/sql/education-hosted-db-metadata.sql",import.meta.url),"utf8");
const provenance={sha:"a".repeat(40),runId:"123",attempt:"1"};
const snapshot=()=>({schema:1,checks:Object.fromEntries(DATABASE_CHECKS.map(name=>[name,true]))});
test("metadata is real catalog SQL only; no DML, answer reads or role grants",()=>{
  assert.ok(DATABASE_CHECKS.length>=30);
  assert.equal(DATABASE_CHECKS.length,new Set(DATABASE_CHECKS).size);
  assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql,/ROLLBACK;/);
  assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|ALTER TABLE|CREATE TABLE|DROP TABLE|GRANT EXECUTE)\b/i);
  for(const name of DATABASE_CHECKS)assert.ok(sql.includes("'"+name+"'"),name);
});
test("only exact fully successful fixed boolean checks generate success evidence",()=>{
  const report=validateEducationDbSnapshot(snapshot(),provenance);
  assert.equal(report.passed_checks,DATABASE_CHECKS.length);
  assert.equal(report.read_only,true);
  assert.equal(report.production_certified,false);
  assert.equal(DATABASE_CHECKS.length,31);
  for(const key of DATABASE_CHECKS){
    const changed=snapshot();changed.checks[key]=false;
    assert.throws(()=>validateEducationDbSnapshot(changed,provenance),key);
  }
});
test("missing, stale and fabricated audit evidence fails closed",()=>{
  const invalid=[
    s=>{delete s.checks[DATABASE_CHECKS[0]];},
    s=>{s.checks.admin_override=true;},
    s=>{s.checks[DATABASE_CHECKS[0]]="true";},
    s=>{s.schema=2;},
  ];
  for(const mutate of invalid){const s=snapshot();mutate(s);
    assert.throws(()=>validateEducationDbSnapshot(s,provenance));}
  assert.throws(()=>validateEducationDbSnapshot(snapshot(),{...provenance,sha:"wrong"}));
  assert.throws(()=>validateEducationDbSnapshot(snapshot(),{...provenance,runId:"0"}));
});
test("credential gate refuses production ref, missing isolated key and unapproved run",()=>{
  const env={
    ETERNYX_EDU_DB_META_APPROVAL:"I_APPROVE_EDUCATION_STAGING_DB_METADATA_READ_ONLY",
    ETERNYX_RLS_STAGING_REF:"a".repeat(20),ETERNYX_RLS_PRODUCTION_REF:"b".repeat(20),
    ETERNYX_RLS_STAGING_URL:"https://"+"a".repeat(20)+".supabase.co",
    ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_test-only-123456",
    ETERNYX_RLS_TEST_A_EMAIL:"rls-student-a@example.com",
    ETERNYX_RLS_TEST_A_PASSWORD:"test-password-is-long-a",
    ETERNYX_RLS_TEST_B_EMAIL:"rls-student-b@example.com",
    ETERNYX_RLS_TEST_B_PASSWORD:"test-password-is-long-b",
    ETERNYX_EDU_STAGING_DB_PASSWORD:"test-password-is-long-staging",
  };
  assert.equal(validateEducationDbConfig(env).host,"db."+"a".repeat(20)+".supabase.co");
  assert.throws(()=>validateEducationDbConfig({...env,ETERNYX_EDU_DB_META_APPROVAL:""}));
  assert.throws(()=>validateEducationDbConfig({...env,ETERNYX_EDU_STAGING_DB_PASSWORD:""}));
  assert.throws(()=>validateEducationDbConfig({...env,ETERNYX_RLS_STAGING_REF:"wcncuarekaofmfurbtbh",ETERNYX_RLS_STAGING_URL:"https://wcncuarekaofmfurbtbh.supabase.co"}));
});
