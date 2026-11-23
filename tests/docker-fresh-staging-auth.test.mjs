import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";
import {validateFreshDockerAccounts,verifyFreshDockerSession,
 createStrictStagingPasswordGrantFetch,obtainFreshDockerStagingProbe}
 from "../src/lib/dockerFreshStagingAccounts.mjs";
import {createDockerDeploymentManifestPin,DOCKER_FUNCTIONS}
 from "../src/lib/dockerStagingDeploymentInventory.mjs";
import {validateDockerStagingAcceptanceContext,runDockerStagingAcceptance}
 from "../src/lib/dockerStagingAcceptance.mjs";
import {validateDockerHostedProbeConfig}
 from "../src/lib/dockerHostedAuthProbe.mjs";

const STAGE="s".repeat(20),PROD="p".repeat(20),COMMIT="a".repeat(40);
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const AA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",BB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW=1795420800000; // deterministic synthetic clock, not a live session
const origin="https://"+STAGE+".supabase.co";
const managementToken=["fake","management",String(4).repeat(30)].join("-");
const publishableKey=["sb","publishable","fakeonly"+String(7).repeat(30)].join("_");
const passwordA="unit-"+String(1).repeat(18),passwordB="unit-"+String(2).repeat(18);
const accounts=()=>({
 ownerA:{email:"account-a@staging.invalid",password:passwordA,userId:A},
 ownerB:{email:"account-b@staging.invalid",password:passwordB,userId:B}
});
function fixture(){
 const manifest={
  schema:"eternyx-docker-deployment-expectations-v1",
  stagingProjectRef:STAGE,productionProjectRef:PROD,
  releaseCommitSha:COMMIT,pinnedSourceSnapshotSha256:"f".repeat(64),
  expected:DOCKER_FUNCTIONS.map((entry,i)=>({
   slug:entry.slug,version:31+i,verifyJwt:entry.verifyJwt,
   bundleSha256:String(i+1).repeat(64)
  }))
 };
 return {
  manifest,pinnedManifestSha256:createDockerDeploymentManifestPin(manifest),
  stagingRef:STAGE,productionRef:PROD,releaseCommitSha:COMMIT,
  checkedOutCommitSha:COMMIT,managementToken,
  probe:{
   stagingUrl:origin,pinnedStagingHost:STAGE+".supabase.co",
   productionHost:PROD+".supabase.co",publishableKey,
   ownerAWorkspaceId:A,ownerBWorkspaceId:B
  }
 };
}
function token(id,changes={}){
 const seconds=Math.floor(NOW/1000);
 const payload={iss:origin+"/auth/v1",sub:id,role:"authenticated",
  aud:"authenticated",iat:seconds-20,exp:seconds+1800,...changes};
 return [
  Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url"),
  Buffer.from(JSON.stringify(payload)).toString("base64url"),
  Buffer.from("not-a-valid-signature-for-unit-tests").toString("base64url")
 ].join(".");
}
const signResult=(id,claimChanges={})=>({
 data:{
  user:{id,is_anonymous:false},
  session:{user:{id},access_token:token(id,claimChanges),
   refresh_token:"never-printed-test-refresh"}
 },error:null
});
function factory(records=[],overrides={}){
 return (url,key,options)=>{
  records.push({kind:"factory",url,key,options});
  assert.equal(url,origin);
  assert.equal(key,publishableKey);
  assert.equal(options.auth.persistSession,false);
  assert.equal(options.auth.autoRefreshToken,false);
  assert.equal(options.auth.detectSessionInUrl,false);
  assert.equal(typeof options.global.fetch,"function");
  return {auth:{
   signInWithPassword:async({email,password})=>{
    records.push({kind:"login",email});
    const isA=email===accounts().ownerA.email;
    assert.ok(isA||email===accounts().ownerB.email);
    assert.equal(password,isA?passwordA:passwordB);
    return overrides[email]??signResult(isA?A:B);
   }
  }};
 };
}
test("pins pre-existing, different staging users; rejects credentials, host and JWT overrides",()=>{
 const base=fixture();
 assert.equal(validateFreshDockerAccounts(base.probe,accounts()).host,STAGE+".supabase.co");
 assert.equal(validateDockerStagingAcceptanceContext(base).releaseCommitSha,COMMIT);
 assert.throws(()=>validateDockerHostedProbeConfig(base.probe));
 const a=accounts();
 const cases=[
  {...a,ownerB:{...a.ownerB,userId:A}},
  {...a,ownerB:{...a.ownerB,email:a.ownerA.email}},
  {...a,ownerA:{...a.ownerA,password:"short"}},
  {...a,ownerA:{...a.ownerA,email:"USER@STAGING.INVALID"}},
  {...a,ownerA:{...a.ownerA,email:"bad email"}},
  {...a,ownerA:{...a.ownerA,password:"bad\npassword"}},
  {...a,ownerB:{...a.ownerB,serviceRole:"forbidden"}}
 ];
 for(const profiles of cases)assert.throws(()=>validateFreshDockerAccounts(base.probe,profiles));
 assert.throws(()=>validateFreshDockerAccounts({...base.probe,ownerAJwt:token(A)},a));
 assert.throws(()=>validateFreshDockerAccounts({...base.probe,stagingUrl:"http://"+STAGE+".supabase.co"},a));
 assert.throws(()=>validateFreshDockerAccounts({...base.probe,productionHost:STAGE+".supabase.co"},a));
});
test("real runtime-synthetic JWT claims pin exact expected identity, issuer, role and expiry",()=>{
 assert.equal(verifyFreshDockerSession(signResult(A),A,origin,Math.floor(NOW/1000)),token(A));
 for(const changes of [
  {sub:B},{iss:"https://"+PROD+".supabase.co/auth/v1"},
  {role:"service_role"},{aud:"anon"},{exp:Math.floor(NOW/1000)+20},
  {exp:Math.floor(NOW/1000)+9000},{iat:Math.floor(NOW/1000)+60}
 ])assert.throws(()=>verifyFreshDockerSession(signResult(A,changes),A,origin,Math.floor(NOW/1000)));
 assert.throws(()=>verifyFreshDockerSession(signResult(B),A,origin,Math.floor(NOW/1000)));
 assert.throws(()=>verifyFreshDockerSession({
  data:{user:{id:A},session:{user:{id:B},access_token:token(A)}},error:null
 },A,origin,Math.floor(NOW/1000)));
 assert.throws(()=>verifyFreshDockerSession({data:null,error:new Error("token")},A,origin,Math.floor(NOW/1000)));
});
test("guarded Supabase Auth fetch permits only password grant POST on the pinned HTTPS staging project",async()=>{
 const calls=[];
 const guarded=createStrictStagingPasswordGrantFetch(origin,async(url,init)=>{
  calls.push({url,init});
  return new Response("{}",{status:200,headers:{"content-type":"application/json"}});
 });
 await guarded(origin+"/auth/v1/token?grant_type=password",{method:"POST"});
 assert.equal(calls.length,1);
 assert.equal(calls[0].init.redirect,"error");
 assert.equal(calls[0].init.cache,"no-store");
 for(const input of [
  [origin+"/auth/v1/token?grant_type=password",{method:"GET"}],
  ["https://"+PROD+".supabase.co/auth/v1/token?grant_type=password",{method:"POST"}],
  [origin+"/auth/v1/signup",{method:"POST"}],
  [origin+"/auth/v1/admin/users",{method:"POST"}],
  [origin+"/auth/v1/token?grant_type=refresh_token",{method:"POST"}],
  [origin+"/auth/v1/token?grant_type=password&scope=admin",{method:"POST"}],
  [origin+"/functions/v1/docker-control",{method:"POST"}]
 ])await assert.rejects(()=>guarded(...input));
 assert.equal(calls.length,1);
 const redirected=createStrictStagingPasswordGrantFetch(origin,async()=>({
  redirected:true,url:"https://example.invalid",status:200
 }));
 await assert.rejects(()=>redirected(origin+"/auth/v1/token?grant_type=password",{method:"POST"}));
});
test("two sign-ins use in-memory Supabase clients only, pin user IDs and return no secrets to logs",async()=>{
 const calls=[],cfg=fixture();
 const live=await obtainFreshDockerStagingProbe(cfg.probe,accounts(),{
  clientFactory:factory(calls),now:()=>NOW
 });
 assert.equal(live.ownerAJwt,token(A));
 assert.equal(live.ownerBJwt,token(B));
 assert.equal(calls.filter(c=>c.kind==="login").length,2);
 assert.equal(calls.filter(c=>c.kind==="factory").length,2);
 assert.ok(validateDockerHostedProbeConfig(live));
 const exported=JSON.stringify({host:cfg.probe.pinnedStagingHost,
  userIds:[A,B]});
 for(const secret of [passwordA,passwordB,live.ownerAJwt,live.ownerBJwt])
  assert.equal(exported.includes(secret),false);
});
test("wrong identity or error during first sign-in blocks second account; client error details stay masked",async()=>{
 const cfg=fixture(),calls=[];
 const wrong={
  [accounts().ownerA.email]:signResult(B)
 };
 await assert.rejects(()=>obtainFreshDockerStagingProbe(cfg.probe,accounts(),{
  clientFactory:factory(calls,wrong),now:()=>NOW
 }),/identity|scope|issuer|lifetime/i);
 assert.equal(calls.filter(c=>c.kind==="login").length,1);
 const errors=[];
 const failFactory=()=>({auth:{signInWithPassword:async()=>{throw Error("sensitive "+passwordA);}}});
 try{await obtainFreshDockerStagingProbe(cfg.probe,accounts(),{
  clientFactory:failFactory,now:()=>NOW
 });}catch(e){errors.push(String(e));}
 assert.equal(errors.length,1);
 assert.equal(errors[0].includes(passwordA),false);
});
function managementRows(cfg=fixture()){
 return cfg.manifest.expected.map(x=>({
  slug:x.slug,version:x.version,status:"ACTIVE",verify_jwt:x.verifyJwt,
  ezbr_sha256:x.bundleSha256
 }));
}
function transport(cfg=fixture(),events=[],options={}){
 const managementFetch=async(url,request)=>{
  events.push({kind:"management",url,method:request.method});
  assert.equal(request.method,"GET");
  assert.equal(url,"https://api.supabase.com/v1/projects/"+STAGE+"/functions");
  const rows=managementRows(cfg);
  if(options.drift)rows[0].verify_jwt=false;
  return new Response(JSON.stringify(rows),{
   status:200,headers:{"content-type":"application/json"}});
 };
 const hostedFetch=async(url,request)=>{
  events.push({kind:"hosted",url,method:request.method,body:request.body});
  assert.equal(request.method,"POST");assert.equal(request.body,'{"action":"list"}');
  const auth=request.headers.Authorization||"";
  if(auth===""||auth==="Bearer invalid.jwt.token"){
   return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{
    "content-type":"application/json","cache-control":"no-store"}});
  }
  const isA=auth==="Bearer "+token(A);
  assert.ok(isA||auth==="Bearer "+token(B));
  const agent=isA?AA:BB,workspace=isA?A:B;
  const payload=url.endsWith("docker-enrollment")?{
   remoteConnectivityEnabled:false,
   workspaces:[{id:workspace}],agents:[{id:agent}],reports:[{agent_id:agent}]
  }:{
   source:"authenticated_server",remoteExecutionEnabled:false,
   requests:[{id:workspace}],events:[],agents:[{id:agent}],
   incidents:[],incidentEvents:[]
  };
  return new Response(JSON.stringify(payload),{status:200,headers:{
   "content-type":"application/json","cache-control":"no-store"}});
 };
 return {managementFetch,hostedFetch};
}
test("critical ordering: verify staging deployed JWT/bundle metadata BEFORE any Auth password sign-ins",async()=>{
 const cfg=fixture(),events=[],calls=[];
 const result=await runDockerStagingAcceptance(cfg,{
  ...transport(cfg,events),observedAt:()=>"2026-11-23T14:40:00.000Z",
  freshSessionProvider:async base=>{
   events.push({kind:"fresh-sessions"});
   return obtainFreshDockerStagingProbe(base,accounts(),{
    clientFactory:factory(calls),now:()=>NOW
   });
  }
 });
 assert.equal(events[0].kind,"management");
 assert.equal(events[1].kind,"fresh-sessions");
 assert.equal(events.filter(x=>x.kind==="hosted").length,8);
 assert.equal(calls.filter(x=>x.kind==="login").length,2);
 assert.equal(result.passed,true);
 assert.equal(result.stagingAuthSessionsCreated,true);
 assert.equal(result.mutationRequestsSent,true);
 assert.equal(result.stagingDataMutationRequestsSent,false);
 assert.equal(result.stagingDockerExecutionAuthorized,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.accountTokensStored,false);
 assert.match(result.scope,/auth_sessions/);
 const out=JSON.stringify(result);
 for(const secret of [passwordA,passwordB,token(A),token(B),publishableKey,managementToken])
  assert.equal(out.includes(secret),false);
});
test("deployed JWT-policy drift prevents account sign-ins or reads",async()=>{
 const cfg=fixture(),events=[];
 let invoked=0;
 await assert.rejects(()=>runDockerStagingAcceptance(cfg,{
  ...transport(cfg,events,{drift:true}),
  freshSessionProvider:async()=>{invoked++;throw Error("must not be called");}
 }));
 assert.equal(invoked,0);
 assert.deepEqual(events.map(x=>x.kind),["management"]);
});
test("fresh Auth callback cannot bypass host validation by returning tokens for a different project",async()=>{
 const cfg=fixture();
 await assert.rejects(()=>runDockerStagingAcceptance(cfg,{
  ...transport(cfg),freshSessionProvider:async base=>({
   ...base,stagingUrl:"https://"+PROD+".supabase.co",
   ownerAJwt:token(A),ownerBJwt:token(B)
  })
 }));
});
test("CLI preflight runs with NO live staging requests and refuses missing separate Auth-write consent",()=>{
 const cfg=fixture();
 const e={
  ...process.env,
  ETERNYX_DOCKER_STAGING_MANIFEST_B64:Buffer.from(JSON.stringify(cfg.manifest)).toString("base64"),
  ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256:cfg.pinnedManifestSha256,
  ETERNYX_DOCKER_STAGING_REF:STAGE,ETERNYX_DOCKER_PRODUCTION_REF:PROD,
  ETERNYX_DOCKER_APPROVED_COMMIT_SHA:COMMIT,ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA:COMMIT,
  ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN:managementToken,
  ETERNYX_DOCKER_STAGING_URL:origin,ETERNYX_DOCKER_STAGING_PINNED_HOST:STAGE+".supabase.co",
  ETERNYX_DOCKER_PRODUCTION_HOST:PROD+".supabase.co",
  ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY:publishableKey,
  ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE:A,
  ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE:B,
  ETERNYX_DOCKER_STAGING_OWNER_A_USER_ID:A,
  ETERNYX_DOCKER_STAGING_OWNER_B_USER_ID:B,
  ETERNYX_DOCKER_STAGING_OWNER_A_EMAIL:accounts().ownerA.email,
  ETERNYX_DOCKER_STAGING_OWNER_A_PASSWORD:passwordA,
  ETERNYX_DOCKER_STAGING_OWNER_B_EMAIL:accounts().ownerB.email,
  ETERNYX_DOCKER_STAGING_OWNER_B_PASSWORD:passwordB,
  ETERNYX_DOCKER_FRESH_AUTH_WRITE_APPROVAL:"I_APPROVE_STAGING_AUTH_SESSIONS",
  ETERNYX_DOCKER_INPUT_STAGING_REF:STAGE,ETERNYX_DOCKER_INPUT_PRODUCTION_REF:PROD,
  ETERNYX_DOCKER_INPUT_RELEASE_SHA:COMMIT
 };
 const cli=fileURLToPath(new URL("../scripts/docker-staging-fresh-auth-acceptance.mjs",import.meta.url));
 const exec=(patch={})=>spawnSync(process.execPath,[cli,"--preflight"],{
  env:{...e,...patch},encoding:"utf8",timeout:12000
 });
 const result=exec();
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).stagingRequestsSent,false);
 assert.equal(JSON.parse(result.stdout).authSessionsCreated,false);
 for(const changed of [
  {ETERNYX_DOCKER_FRESH_AUTH_WRITE_APPROVAL:""},
  {ETERNYX_DOCKER_INPUT_STAGING_REF:PROD},
  {ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA:"b".repeat(40)},
  {ETERNYX_DOCKER_STAGING_OWNER_B_USER_ID:A},
  {ETERNYX_DOCKER_STAGING_OWNER_B_PASSWORD:"tiny"},
  {ETERNYX_DOCKER_STAGING_OWNER_B_EMAIL:e.ETERNYX_DOCKER_STAGING_OWNER_A_EMAIL}
 ])assert.notEqual(exec(changed).status,0);
 for(const sensitive of [passwordA,passwordB,publishableKey,managementToken])
  assert.equal((result.stdout+result.stderr).includes(sensitive),false);
});
test("the manual workflow never runs on push/PR and requires separate Auth session write consent",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/docker-staging-fresh-auth-manual.yml",import.meta.url),"utf8");
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s+(?:push|pull_request|schedule):/);
 assert.match(workflow,/confirm_staging_auth_session_creation/);
 assert.match(workflow,/confirm_isolated_test_accounts/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/environment: docker-staging/);
 assert.match(workflow,/ATERNYX_DOCKER_FRESH_AUTH_WRITE_APPROVAL|ETERNYX_DOCKER_FRESH_AUTH_WRITE_APPROVAL/);
 assert.match(workflow,/docker-staging-fresh-auth-acceptance\.mjs --preflight/);
 assert.match(workflow,/docker-staging-fresh-auth-acceptance\.mjs --run/);
 assert.doesNotMatch(workflow,/supabase functions deploy|docker run|service_role/);
});
