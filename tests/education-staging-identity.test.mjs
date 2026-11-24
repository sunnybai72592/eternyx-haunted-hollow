import test from "node:test";
import assert from "node:assert/strict";
import {identityConfig,checkIdentityRoles,identityReport,IDENTITY_CASES,IDENTITY_APPROVAL} from "../scripts/staging/educationStagingIdentity.mjs";
import {readFileSync} from "node:fs";
const env={ETERNYX_EDU_IDENTITY_APPROVAL:IDENTITY_APPROVAL,ETERNYX_EDU_IDENTITY_MODE:"accounts",
 ETERNYX_RLS_STAGING_REF:"s".repeat(20),ETERNYX_RLS_PRODUCTION_REF:"p".repeat(20),
 ETERNYX_RLS_STAGING_URL:"https://"+"s".repeat(20)+".supabase.co",
 ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_"+"x".repeat(32),
 ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.invalid",ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.invalid",
 ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-instructor@example.invalid",
 ETERNYX_RLS_TEST_A_PASSWORD:"synthetic-password-a",ETERNYX_RLS_TEST_B_PASSWORD:"synthetic-password-b",
 ETERNYX_RLS_INSTRUCTOR_PASSWORD:"synthetic-password-c",
 GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"101",GITHUB_RUN_ATTEMPT:"1"};
test("identity-only config rejects production, duplicate identities and privileged credentials",()=>{
 assert.equal(identityConfig(env).accounts.length,3);
 for(const altered of [{ETERNYX_EDU_IDENTITY_APPROVAL:""},{ETERNYX_RLS_PRODUCTION_REF:env.ETERNYX_RLS_STAGING_REF},
 {ETERNYX_RLS_INSTRUCTOR_EMAIL:env.ETERNYX_RLS_TEST_A_EMAIL},{ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"forbidden"},
 {ETERNYX_EDU_IDENTITY_MODE:"production"}])assert.throws(()=>identityConfig({...env,...altered}));
});
function mockFactory({grant=false,duplicate=false,deny=true,admin=false}={}){
 let i=0;const signed=[];
 const factory=()=>{const n=i++,id=duplicate?"same":"user-"+n;return {
  auth:{signInWithPassword:async()=>({data:{user:{id}}}),getUser:async()=>({data:{user:{id}}}),
    signOut:async()=>{signed.push(n);return {error:null};}},
  rpc:async(name)=>n===3?(deny?{error:{code:"42501"}}:{data:{approved:false}}):
    {data:name==="is_admin"?admin:{approved:n===2&&grant}},
 };};return {factory,signed};
}
test("both account-only and instructor-granted checks verify real-client contract and sign out",async()=>{
 for(const mode of ["accounts","granted"]){
  const {factory,signed}=mockFactory({grant:mode==="granted"});
  const results=await checkIdentityRoles(identityConfig({...env,ETERNYX_EDU_IDENTITY_MODE:mode}),factory);
  assert.deepEqual(results.map(r=>r.check),IDENTITY_CASES);
  assert.equal(identityReport(mode,results,env).outcome,"identity_checks_passed");
  assert.deepEqual(signed,[0,1,2]);
 }
});
test("identity collision, unexpected grant, admin and anonymous bypass fail closed",async()=>{
 for(const variant of [{duplicate:true},{grant:true},{admin:true},{deny:false}]){
  const {factory,signed}=mockFactory(variant);
  const result=await checkIdentityRoles(identityConfig(env),factory);
  assert.equal(identityReport("accounts",result,env).outcome,"identity_checks_blocked");
  assert.deepEqual(signed,[0,1,2]);
 }
});
test("report strips private fields and never claims release clearance",()=>{
 const report=identityReport("accounts",[{check:IDENTITY_CASES[0],result:"passed",password:"private"}],env);
 assert.doesNotMatch(JSON.stringify(report),/password|private/);
 assert.equal(report.production_release_approved,false);
 assert.equal(report.outcome,"identity_checks_blocked");
});
test("manual workflow does not expose credentials to installs or use privileged keys",()=>{
 const w=readFileSync(new URL("../.github/workflows/education-staging-identity.yml",import.meta.url),"utf8");
 assert.match(w,/workflow_dispatch:/);assert.match(w,/environment: rls-staging/);
 assert.match(w,/inputs\.approve_identity_check/);
 assert.doesNotMatch(w,/service_role|DB_PASSWORD|SERVICE_ROLE|push:|pull_request:/);
 assert.doesNotMatch(w.slice(0,w.indexOf("Verify three real staging Auth")),/secrets\./);
});
