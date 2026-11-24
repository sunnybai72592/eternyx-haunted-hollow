import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("scripts/sql/staging-education-empty-foundation.sql");
const ci=read(".github/workflows/education-postgres-security.yml");
const fixture=read("tests/sql/education-db-bootstrap.sql");
test("empty staging foundation matches the existing exercised core schema without synthetic identities",()=>{
 const tables=["teachers","tests","questions","options","user_attempts","user_answers"];
 for(const table of tables){
  const definition=new RegExp("CREATE TABLE public\\."+table+" \\([\\s\\S]*?\\n\\);");
  assert.equal(sql.match(definition)?.[0],fixture.match(definition)?.[0],table);
  assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
 }
 assert.doesNotMatch(sql,/INSERT INTO|CREATE ROLE|CREATE SCHEMA|CREATE FUNCTION|GRANT ALL|CREATE TABLE IF NOT EXISTS/i);
 assert.match(sql,/BEGIN;[\s\S]+COMMIT;/);
 assert.match(sql,/REVOKE ALL ON public\.teachers[\s\S]*FROM PUBLIC,anon,authenticated/);
});
test("new clean-database rehearsal uses the actual staged files, not a simulated success",()=>{
 const step=ci.slice(ci.indexOf("Rehearse clean staging Education foundation"));
 assert.match(step,/createdb -U postgres education_staging_foundation/);
 assert.match(step,/staging-education-empty-foundation\.sql/);
 assert.match(step,/staging-education-immutable-final-grade-records\.sql/);
 assert.match(step,/education-hosted-db-metadata\.sql/);
 assert.match(step,/len\(data\["checks"\]\)==31/);
 assert.match(step,/all\(v is True for v in data\["checks"\]\.values\(\)\)/);
});
