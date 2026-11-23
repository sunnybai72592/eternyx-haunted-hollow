import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {validateDockerHostedProbeConfig,runDockerHostedAuthProbe}
 from "../src/lib/dockerHostedAuthProbe.mjs";

const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const aAgent="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bAgent="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// These test credentials are generated entirely at runtime. They are NOT usable
// JWTs or Supabase API keys; fake responses stand in for a staging gateway.
const fakeJwt=name=>[
  Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url"),
  Buffer.from(JSON.stringify({sub:"synthetic-"+name})).toString("base64url"),
  Buffer.from("non-signature-"+name).toString("base64url"),
].join(".");
const TOK_A=fakeJwt("owner-a"),TOK_B=fakeJwt("owner-b");
const KEY=["sb","publishable",Buffer.from("synthetic-repo-unit-test-material").toString("base64url")].join("_");
const HOST="isolated-staging123.supabase.co",PRODUCTION="eternyx-production123.supabase.co";
const config=()=>({
 stagingUrl:"https://"+HOST,pinnedStagingHost:HOST,productionHost:PRODUCTION,
 publishableKey:KEY,ownerAJwt:TOK_A,ownerBJwt:TOK_B,
 ownerAWorkspaceId:A,ownerBWorkspaceId:B
});
const control=(id,agent)=>({
 source:"authenticated_server",remoteExecutionEnabled:false,
 requests:[{id}],events:[],agents:[{id:agent}],incidents:[],incidentEvents:[],
 observedAt:"2026-11-23T00:00:00.000Z"
});
const enrollment=(workspace,agent)=>({
 remoteConnectivityEnabled:false,workspaces:[{id:workspace}],
 agents:[{id:agent}],reports:[{agent_id:agent}]
});
function fake({replace=null,responseHook=null,record=[]}={}){
 return async (url,request)=>{
  record.push({url,request});
  assert.equal(request.method,"POST");
  assert.equal(request.body,'{"action":"list"}');
  assert.equal(request.headers.apikey,KEY);
  assert.equal(request.redirect,"error");
  assert.equal(request.cache,"no-store");
  assert.ok(url.startsWith("https://"+HOST+"/functions/v1/docker-"));
  const auth=request.headers.Authorization||"";
  let response;
  if(!auth||auth==="Bearer invalid.jwt.token"){
   response=new Response(JSON.stringify({error:"Unauthorized"}),{
    status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }else{
   const isA=auth==="Bearer "+TOK_A;
   assert.ok(isA||auth==="Bearer "+TOK_B);
   const isEnrollment=url.endsWith("docker-enrollment");
   const body=isEnrollment?enrollment(isA?A:B,isA?aAgent:bAgent):
     control(isA?A:B,isA?aAgent:bAgent);
   const data=replace?.({url,request,body,isEnrollment,isA})??body;
   response=new Response(JSON.stringify(data),{status:200,headers:{
    "content-type":"application/json","cache-control":"no-store"}});
  }
  return responseHook?responseHook({url,request,response}):response;
 };
}
test("staging config accepts only HTTPS pinned Supabase staging origins and distinct owner fixtures",()=>{
 const c=validateDockerHostedProbeConfig(config());
 assert.equal(c.host,HOST);
 assert.equal(c.origin,"https://"+HOST);
 for(const changes of [
  {stagingUrl:"http://"+HOST},
  {stagingUrl:"https://"+HOST+":444"},
  {stagingUrl:"https://"+HOST+"/functions/v1/docker-control"},
  {stagingUrl:"https://"+HOST+"/?key=secret"},
  {stagingUrl:"https://user:pass@"+HOST},
  {stagingUrl:"https://127.0.0.1"},
  {stagingUrl:"https://"+HOST+".attacker.net"},
  {pinnedStagingHost:"unrelated.supabase.co"},
  {productionHost:HOST},
  {productionHost:""},
  {publishableKey:"sb_secret_this-is-not-allowed"},
  {publishableKey:"service_role"},
  {ownerBJwt:TOK_A},
  {ownerBJwt:"bogus"},
  {ownerBWorkspaceId:A},
  {ownerAWorkspaceId:"not-a-uuid"}
 ])assert.throws(()=>validateDockerHostedProbeConfig({...config(),...changes}));
});
test("real fetch-shaped staging probe uses eight immutable list calls and checks ten gates",async()=>{
 const requests=[],out=await runDockerHostedAuthProbe(config(),{fetcher:fake({record:requests}),
  now:()=>"2026-11-23T00:00:00.000Z"});
 assert.equal(requests.length,8);
 assert.equal(out.checks.length,10);
 assert.equal(out.passed,true);
 assert.equal(out.stagingAuthChecksPassed,true);
 assert.equal(out.productionDeploymentAuthorized,false);
 assert.equal(out.dockerExecutionAuthorized,false);
 assert.equal(out.mutationRequestsSent,false);
 assert.equal(out.completeRlsAuditPerformed,false);
 assert.equal(out.independentHostAttestation,false);
 assert.equal(out.manualSecurityApprovalRequired,true);
 const json=JSON.stringify(out);
 for(const secret of [TOK_A,TOK_B,KEY])assert.equal(json.includes(secret),false);
 for(const r of requests)assert.equal(r.request.signal?.aborted,false);
});
test("anonymous access succeeding even once blocks subsequent authenticated calls",async()=>{
 const calls=[];
 const transport=async(url,request)=>{
  calls.push(request);
  return new Response(JSON.stringify({requests:[]}),{status:200,headers:{
   "content-type":"application/json","cache-control":"no-store"}});
 };
 const result=await runDockerHostedAuthProbe(config(),{fetcher:transport});
 assert.equal(result.passed,false);
 assert.equal(result.checks[0].id,"docker-control_anonymous");
 assert.equal(calls.length,1);
 assert.equal(JSON.stringify(result).includes(TOK_A),false);
});
test("invalid token accepted by gateway is a failing security finding",async()=>{
 const calls=[];
 const transport=fake({record:calls,responseHook:({request,response})=>
  request.headers.Authorization==="Bearer invalid.jwt.token"?
  new Response(JSON.stringify({requests:[]}),{status:200,headers:{"content-type":"application/json"}}):response});
 const result=await runDockerHostedAuthProbe(config(),{fetcher:transport});
 assert.equal(result.passed,false);
 assert.equal(result.checks.at(-1).id,"docker-control_invalid");
 assert.equal(calls.length,2);
});
test("two owners sharing seeded workspace IDs is detected and never called isolated",async()=>{
 const result=await runDockerHostedAuthProbe(config(),{fetcher:fake({replace:({body,isEnrollment,isA})=>
  isEnrollment&&!isA?enrollment(A,bAgent):body})});
 assert.equal(result.passed,false);
 const check=result.checks.find(c=>c.id==="docker-enrollment_two_owner_isolation");
 assert.equal(check?.passed,false);
});
test("cross-owner request IDs or shared agent data are detected even when enrollment fixtures differ",async()=>{
 const transport=fake({replace:({body,isEnrollment,isA})=>
  !isEnrollment&&!isA?control(A,bAgent):body});
 const out=await runDockerHostedAuthProbe(config(),{fetcher:transport});
 assert.equal(out.checks.find(c=>c.id==="docker-control_two_owner_isolation")?.passed,false);
});
test("cached, oversized, non-JSON, redirected and wrong-origin owner responses fail closed",async()=>{
 const invalid=[
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    new Response(JSON.stringify({requests:[]}),{status:200,headers:{
      "content-type":"application/json","cache-control":"public,max-age=3600"}}):response,
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    new Response("X".repeat(263000),{status:200,headers:{
      "content-type":"application/json","cache-control":"no-store"}}):response,
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    new Response("not json",{status:200,headers:{
      "content-type":"application/json","cache-control":"no-store"}}):response,
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    new Response("{}",{status:200,headers:{
      "content-type":"text/html","cache-control":"no-store"}}):response,
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    {...response,redirected:true,status:200}:response,
  ({url,request,response})=>request.headers.Authorization==="Bearer "+TOK_A?
    {...response,url:"https://different-project.supabase.co/functions/v1/docker-control",
      redirected:false,status:200}:response
 ];
 for(const hook of invalid){
  const result=await runDockerHostedAuthProbe(config(),{fetcher:fake({responseHook:hook})});
  assert.equal(result.passed,false);
  assert.equal(result.checks.at(-1).id,"docker-control_ownerA");
 }
});
test("unavailable staging, invalid transport or unknown response never produces false green",async()=>{
 const out=await runDockerHostedAuthProbe(config(),{fetcher:async()=>{throw Error("token "+TOK_A);}});
 assert.equal(out.passed,false);
 assert.equal(out.checks.length,1);
 assert.equal(out.productionEndpointCalled,false);
 assert.equal(JSON.stringify(out).includes(TOK_A),false);
 await assert.rejects(()=>runDockerHostedAuthProbe(config(),{fetcher:null}));
 await assert.rejects(()=>runDockerHostedAuthProbe(config(),{fetcher:fake(),timeoutMs:500000}));
});
test("missing workspace fixtures or false remoteExecutionEnabled fail the account boundary",async()=>{
 const wrong=fake({replace:({body,isEnrollment,isA})=>
   isEnrollment&&isA?{...body,workspaces:[]}:
   !isEnrollment&&isA?{...body,remoteExecutionEnabled:true}:body});
 const out=await runDockerHostedAuthProbe(config(),{fetcher:wrong});
 assert.equal(out.passed,false);
 assert.equal(out.checks.find(c=>c.id==="docker-control_two_owner_isolation")?.passed,false);
 assert.equal(out.checks.find(c=>c.id==="docker-enrollment_two_owner_isolation")?.passed,false);
});
test("CLI refuses live probes without explicit enable flag, rejects production host, and never logs credentials",()=>{
 const cli=fileURLToPath(new URL("../scripts/docker-hosted-auth-probe.mjs",import.meta.url));
 const valid=config();
 const env={...process.env,
  ETERNYX_DOCKER_STAGING_URL:valid.stagingUrl,
  ETERNYX_DOCKER_STAGING_PINNED_HOST:valid.pinnedStagingHost,
  ETERNYX_DOCKER_PRODUCTION_HOST:valid.productionHost,
  ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY:valid.publishableKey,
  ETERNYX_DOCKER_STAGING_OWNER_A_JWT:valid.ownerAJwt,
  ETERNYX_DOCKER_STAGING_OWNER_B_JWT:valid.ownerBJwt,
  ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE:valid.ownerAWorkspaceId,
  ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE:valid.ownerBWorkspaceId,
  ETERNYX_DOCKER_STAGING_PROBE_ENABLED:"false"};
 const run=(args,options={})=>spawnSync(process.execPath,[cli,...args],{
  encoding:"utf8",timeout:10000,env:{...env,...options}});
 const check=run(["--check-config"]);
 assert.equal(check.status,0,check.stderr);
 assert.equal(JSON.parse(check.stdout).liveStagingAuthTested,false);
 assert.equal(run(["--run"]).status,1);
 assert.equal(run(["--run"],{ETERNYX_DOCKER_PRODUCTION_HOST:HOST}).status,1);
 const bad=run(["--check-config"],{ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY:"sb_secret_should_fail"});
 assert.equal(bad.status,1);
 for(const result of [check,bad]){
  for(const secret of [KEY,TOK_A,TOK_B])assert.equal((result.stdout+result.stderr).includes(secret),false);
 }
});
