import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {publicationConfig,PUBLICATION_APPROVAL,PUBLICATION_CASES,publicationJourney} from "../scripts/staging/educationHostedPublication.mjs";
import {STAGING_REF} from "../scripts/staging/educationStagingSyntheticFixtures.mjs";
const env={ETERNYX_EDU_PUBLICATION_APPROVAL:PUBLICATION_APPROVAL,ETERNYX_RLS_STAGING_REF:STAGING_REF,ETERNYX_RLS_PRODUCTION_REF:"p".repeat(20),
 ETERNYX_RLS_STAGING_URL:"https://"+STAGING_REF+".supabase.co",ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_"+"x".repeat(30),
 ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.invalid",ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.invalid",
 ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-i@example.invalid",ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:"rls-o@example.invalid",
 ETERNYX_RLS_TEST_A_PASSWORD:"synthetic-pass-a",ETERNYX_RLS_TEST_B_PASSWORD:"synthetic-pass-b",
 ETERNYX_RLS_INSTRUCTOR_PASSWORD:"synthetic-pass-i",ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD:"synthetic-pass-o",
 GITHUB_RUN_ID:"123",GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:"a".repeat(40)};
test("exact staging, explicit approval, first attempt and no privileged key",()=>{
 assert.equal(publicationConfig(env).accounts.length,4);
 for(const patch of [{GITHUB_RUN_ATTEMPT:"2"},{ETERNYX_EDU_PUBLICATION_APPROVAL:""},{ETERNYX_RLS_STAGING_REF:"p".repeat(20)},
 {ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:env.ETERNYX_RLS_TEST_A_EMAIL},{ETERNYX_EDU_STAGING_DB_PASSWORD:"private"}])assert.throws(()=>publicationConfig({...env,...patch}));
});
test("unexpected admin role blocks before any write and signs out",async()=>{
 let n=0,mutations=0,signouts=0;const journal=[];
 const result=await publicationJourney(publicationConfig(env),()=>{
 const id="10000000-0000-4000-8000-"+String(++n).padStart(12,"0");
 return {auth:{signInWithPassword:async()=>({data:{user:{id}}}),getUser:async()=>({data:{user:{id}}}),signOut:async()=>{signouts++;return {error:null};}},
 rpc:async(name)=>{if(name==="is_admin")return {data:true};if(name==="education_instructor_access")return {data:{approved:false}};mutations++;throw Error("unexpected");}};
 },r=>journal.push(r));
 assert.equal(result.outcome,"blocked");assert.equal(result.writes_may_have_occurred,false);
 assert.equal(mutations,0);assert.equal(signouts,4);assert.doesNotMatch(JSON.stringify(journal),/example\.invalid|synthetic-pass|10000000/);
});
test("19 fixed cases in order, manual workflow, no service-role or DB password",()=>{
 const src=readFileSync(new URL("../scripts/staging/educationHostedPublication.mjs",import.meta.url),"utf8");
 assert.equal(PUBLICATION_CASES.length,19);
 assert.deepEqual([...src.matchAll(/await gate\("([^"]+)"/g)].map(x=>x[1]),PUBLICATION_CASES.slice(0,-1));
 assert.match(src,/mayWrite=true;persist\(snapshot\(\)\)/);
 const w=readFileSync(new URL("../.github/workflows/education-hosted-publication.yml",import.meta.url),"utf8");
 assert.match(w,/environment: rls-staging/);assert.match(w,/github\.run_attempt == '1'/);
 assert.doesNotMatch(w,/SERVICE_ROLE_KEY|DB_PASSWORD|push:|pull_request:/);
});
