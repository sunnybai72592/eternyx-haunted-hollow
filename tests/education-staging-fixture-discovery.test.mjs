import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {discoveryConfig,maskedHandoff} from "../scripts/staging/educationStagingFixtureDiscovery.mjs";
import {STAGING_REF,MANIFEST_KEYS} from "../scripts/staging/educationStagingSyntheticFixtures.mjs";
const env={ETERNYX_EDU_DISCOVERY_APPROVAL:"I_APPROVE_EDUCATION_SYNTHETIC_FIXTURE_READ",ETERNYX_EDU_RELEASE_MODE:"journey",
 ETERNYX_RLS_STAGING_REF:STAGING_REF,ETERNYX_RLS_PRODUCTION_REF:"p".repeat(20),ETERNYX_RLS_STAGING_URL:"https://"+STAGING_REF+".supabase.co",
 ETERNYX_EDU_STAGING_DB_PASSWORD:"synthetic-password",ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.invalid",
 ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.invalid",ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-i@example.invalid"};
test("explicit read-only discovery is exact-staging journey only and rejects mixed configured IDs",()=>{
 assert.match(discoveryConfig(env).PGOPTIONS,/default_transaction_read_only=on/);
 for(const patch of [{ETERNYX_EDU_DISCOVERY_APPROVAL:""},{ETERNYX_EDU_RELEASE_MODE:"rehearsal"},{ETERNYX_RLS_STAGING_REF:"p".repeat(20)},{[MANIFEST_KEYS[0]]:"existing"}])assert.throws(()=>discoveryConfig({...env,...patch}));
});
test("strict manifest masks identifiers before passing only allowlisted values",()=>{
 const value=Object.fromEntries(MANIFEST_KEYS.map((k,i)=>[k,/_(?:SCORE|MAX|POINTS)$/.test(k)?(k.endsWith("_POINTS")?"2":"7"):"10000000-0000-4000-8000-"+String(i+1).padStart(12,"0")]));
 value.ETERNYX_EDU_REVIEW_ATTEMPT_ID=value.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT;
 const events=[];maskedHandoff(value,v=>events.push(["mask",v]),v=>events.push(["append",v]));
 assert.equal(events.at(-1)[0],"append");assert.equal(events.at(-1)[1].trim().split("\n").length,24);
 assert.equal(events.filter(e=>e[0]==="mask").length,17);
 assert.throws(()=>maskedHandoff({...value,unexpected:"private"},()=>{},()=>{}));
});
test("provision and discovery workflows are distinct, explicit, and never upload private manifests",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const w=read(".github/workflows/education-hosted-release-readiness.yml");
 assert.ok(w.indexOf("Discover exact synthetic fixture settings")<w.indexOf("Inventory protected staging settings"));
 assert.match(w,/vars\.ETERNYX_EDU_DISCOVER_FIXTURES == 'true'/);
 const p=read(".github/workflows/education-staging-fixture-provision.yml");
 assert.match(p,/inputs\.approve_fixtures && inputs\.acknowledge_no_retry/);
 assert.match(p,/github\.run_attempt == '1'/);assert.doesNotMatch(p,/upload-artifact|SERVICE_ROLE_KEY|pull_request:|push:/);
 const sql=read("scripts/sql/education-staging-fixture-discovery.sql");
 assert.match(sql,/BEGIN TRANSACTION READ ONLY/);assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE public\.|DELETE FROM|CREATE TABLE/);
});
