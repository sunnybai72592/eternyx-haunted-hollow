import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DATABASE_CHECKS} from "../scripts/staging/educationHostedDbMetadata.mjs";
import {OFFLINE_CONTAINER,NEGATIVE_AUDITS,auditPath,parseAuditOutput,
  rollbackSabotageSql} from "../scripts/staging/verifyEducationRealPostgresAudit.mjs";
const audit=readFileSync(auditPath,"utf8");
const result=(negative=null)=>JSON.stringify({
  schema:1,checks:Object.fromEntries(DATABASE_CHECKS.map(k=>[k,k!==negative])),
});
test("real Postgres audit requires all 31 catalog checks",()=>{
  assert.equal(DATABASE_CHECKS.length,31);
  assert.equal(parseAuditOutput(result()).passed,31);
  assert.equal(OFFLINE_CONTAINER,"eternyx-education-db-ci");
  assert.match(audit,/BEGIN TRANSACTION READ ONLY;/);
  assert.match(audit,/ROLLBACK;/);
});
test("falsified audit rows, type coercion, extra or missing checks fail closed",()=>{
  assert.throws(()=>parseAuditOutput(result(DATABASE_CHECKS[0])));
  assert.throws(()=>parseAuditOutput(result()+"\n"+result()));
  assert.throws(()=>parseAuditOutput("invalid response"));
  assert.throws(()=>parseAuditOutput(JSON.stringify({schema:1,checks:{}})));
  const extra=JSON.parse(result());extra.checks.unapproved=true;
  assert.throws(()=>parseAuditOutput(JSON.stringify(extra)));
  const malformed=JSON.parse(result());malformed.checks[DATABASE_CHECKS[1]]="true";
  assert.throws(()=>parseAuditOutput(JSON.stringify(malformed)));
});
test("five isolated negative checks deny specific tampering without disabling other checks",()=>{
  assert.equal(NEGATIVE_AUDITS.length,5);
  assert.equal(new Set(NEGATIVE_AUDITS.map(x=>x.rejected)).size,5);
  for(const check of NEGATIVE_AUDITS){
    assert.equal(parseAuditOutput(result(check.rejected),{deniedCheck:check.rejected}).passed,31);
    assert.throws(()=>parseAuditOutput(result(),{deniedCheck:check.rejected}));
    assert.throws(()=>parseAuditOutput(result(DATABASE_CHECKS.find(k=>k!==check.rejected)),
      {deniedCheck:check.rejected}));
    const sql=rollbackSabotageSql(audit,check.sql);
    assert.match(sql,/^BEGIN;\n/);
    assert.match(sql,/ROLLBACK;\s*$/);
    assert.equal(sql.includes("BEGIN TRANSACTION READ ONLY"),false);
    assert.ok(sql.indexOf(check.sql)<sql.indexOf("SELECT pg_catalog.jsonb_build_object"));
  }
});
test("no arbitrary SQL injection into negative cases, only disposable Docker target",()=>{
  assert.throws(()=>rollbackSabotageSql(audit,"DROP SCHEMA public CASCADE"));
  assert.throws(()=>rollbackSabotageSql("SELECT 1;","GRANT SELECT(is_correct) ON public.options TO anon"));
  const code=readFileSync(new URL("../scripts/staging/verifyEducationRealPostgresAudit.mjs",import.meta.url),"utf8");
  const workflow=readFileSync(new URL("../.github/workflows/education-postgres-security.yml",import.meta.url),"utf8");
  assert.match(code,/"exec","-i",OFFLINE_CONTAINER/);
  assert.doesNotMatch(code,/ETERNYX_RLS_STAGING_URL|sb_secret_|https:\/\/.*supabase/);
  assert.match(workflow,/--network none --name eternyx-education-db-ci/);
  assert.match(workflow,/verifyEducationRealPostgresAudit.mjs --run/);
  assert.ok(workflow.indexOf("staging-education-immutable-final-grade-records.sql") <
    workflow.indexOf("verifyEducationRealPostgresAudit.mjs --run"));
});
