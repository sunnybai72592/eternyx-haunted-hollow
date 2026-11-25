import test from "node:test";
import assert from "node:assert/strict";
import {accountProvisionConfig,accountConfigurationIssues,provisionAccounts,ACCOUNT_APPROVAL,ACCOUNT_LABELS} from "../scripts/staging/educationStagingAccountProvision.mjs";
import {STAGING_REF} from "../scripts/staging/educationStagingSyntheticFixtures.mjs";
const env={ETERNYX_EDU_ACCOUNT_APPROVAL:ACCOUNT_APPROVAL,ETERNYX_RLS_STAGING_REF:STAGING_REF,
 ETERNYX_RLS_STAGING_URL:"https://"+STAGING_REF+".supabase.co",ETERNYX_RLS_PRODUCTION_REF:"p".repeat(20),
 ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_"+"x".repeat(30),ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"sb_secret_"+"x".repeat(30),
 ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.invalid",ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.invalid",
 ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-i@example.invalid",ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:"rls-op@example.invalid",
 ETERNYX_RLS_TEST_A_PASSWORD:"synthetic-password-one",ETERNYX_RLS_TEST_B_PASSWORD:"synthetic-password-two",
 ETERNYX_RLS_INSTRUCTOR_PASSWORD:"synthetic-password-three",ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD:"synthetic-password-four"};
test("only exact staging project and four distinct dedicated identities with separate approval",()=>{
 assert.equal(accountProvisionConfig(env).accounts.length,4);
 for(const patch of [{ETERNYX_EDU_ACCOUNT_APPROVAL:""},{ETERNYX_RLS_STAGING_REF:"p".repeat(20)},
 {ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:env.ETERNYX_RLS_TEST_A_EMAIL},{ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD:env.ETERNYX_RLS_TEST_A_PASSWORD},
 {ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:env.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY}])assert.throws(()=>accountProvisionConfig({...env,...patch}));
});
function harness({failAt=-1,privileged=false}={}){
 let i=0,last=-1;const records=[],calls=[],signed=[];
 return {records,calls,signed,io:{
  admin:{auth:{admin:{createUser:async attrs=>{last=i++;calls.push(attrs);assert.equal(records.at(-1).accounts[last].status,"creation_may_have_occurred");
   return last===failAt?{error:{message:"private server error"}}:{data:{user:{id:"id-"+last,email:attrs.email}}};}}}},
  makePublicClient:()=>{const n=last;return {auth:{
   signInWithPassword:async()=>({data:{user:{id:"id-"+n}}}),getUser:async()=>({data:{user:{id:"id-"+n}}}),
   signOut:async()=>{signed.push(n);return {error:null};}},
   rpc:async name=>({data:name==="is_admin"?privileged:{approved:false}})};},
  persist:j=>records.push(structuredClone(j))
 }};
}
test("four official Auth calls, ordinary JWT checks, signout and no role grant",async()=>{
 const h=harness(),j=await provisionAccounts(accountProvisionConfig(env),h.io);
 assert.equal(j.outcome,"four_accounts_verified");assert.equal(j.administrator_granted,false);
 assert.deepEqual(j.accounts.map(a=>a.account),ACCOUNT_LABELS);assert.ok(j.accounts.every(a=>a.status==="verified_nonprivileged"));
 assert.equal(h.calls.length,4);assert.ok(h.calls.every(a=>a.email_confirm===true&&Object.keys(a).length===3));
 assert.deepEqual(h.signed,[0,1,2,3]);assert.doesNotMatch(JSON.stringify(h.records),/example\.invalid|synthetic-password|id-0|sb_secret/);
});
test("partial creation or unexpected privilege stops immediately without rollback or retry",async()=>{
 for(const options of [{failAt:1},{privileged:true}]){
  const h=harness(options);await assert.rejects(provisionAccounts(accountProvisionConfig(env),h.io));
  assert.equal(h.records.at(-1).outcome,"blocked_inspect_before_retry");
  assert.equal(h.calls.length,options.privileged?1:2);
  assert.equal(h.records.at(-1).accounts[3].status,"not_started");
  assert.doesNotMatch(JSON.stringify(h.records),/private server error/);
 }
});

test("configuration diagnostics identify only fixed missing or invalid setting names",()=>{
 const x=accountConfigurationIssues({...env,ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL:"",ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD:"short",ETERNYX_RLS_TEST_A_EMAIL:"private@example.invalid"});
 assert.deepEqual(x,[{setting:"ETERNYX_RLS_TEST_A_EMAIL",reason:"requires_rls_prefix_email"},{setting:"ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL",reason:"missing"},{setting:"ETERNYX_EDU_FIXTURE_OPERATOR_PASSWORD",reason:"requires_16_to_72_characters"}]);
 assert.doesNotMatch(JSON.stringify(x),/private@example|short|synthetic-password|sb_secret/);
 assert.deepEqual(accountConfigurationIssues(env),[]);
 assert.ok(accountConfigurationIssues({...env,ETERNYX_RLS_TEST_B_PASSWORD:env.ETERNYX_RLS_TEST_A_PASSWORD}).filter(x=>x.reason==="must_be_distinct").length===2);
});
