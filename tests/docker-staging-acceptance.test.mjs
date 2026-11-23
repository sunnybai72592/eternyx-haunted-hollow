import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";
import {validateDockerStagingAcceptanceConfig,runDockerStagingAcceptance}
 from "../src/lib/dockerStagingAcceptance.mjs";
import {createDockerDeploymentManifestPin,DOCKER_FUNCTIONS}
 from "../src/lib/dockerStagingDeploymentInventory.mjs";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const AA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stage="s".repeat(20),prod="p".repeat(20),commit="a".repeat(40);
const tokenA=["synthetic","staging","ownerA"].join(".");
const tokenB=["synthetic","staging","ownerB"].join(".");
const publishable=["sb","publishable","offline-test-"+String(4).repeat(24)].join("_");
// Deliberately invalid, runtime-built test token. Never embed credential-like strings in commits.
const managementToken=["not-a-token","offline-test",String(7).repeat(36)].join("-");
function fixture(){
 const manifest={
  schema:"eternyx-docker-deployment-expectations-v1",
  stagingProjectRef:stage,productionProjectRef:prod,
  releaseCommitSha:commit,pinnedSourceSnapshotSha256:"f".repeat(64),
  expected:DOCKER_FUNCTIONS.map((entry,i)=>({
   slug:entry.slug,version:12+i,verifyJwt:entry.verifyJwt,
   bundleSha256:(i+1).toString(16).repeat(64)
  }))
 };
 return {
  manifest,pinnedManifestSha256:createDockerDeploymentManifestPin(manifest),
  stagingRef:stage,productionRef:prod,
  releaseCommitSha:commit,checkedOutCommitSha:commit,managementToken,
  probe:{
   stagingUrl:"https://"+stage+".supabase.co",
   pinnedStagingHost:stage+".supabase.co",
   productionHost:prod+".supabase.co",
   publishableKey:publishable,ownerAJwt:tokenA,ownerBJwt:tokenB,
   ownerAWorkspaceId:A,ownerBWorkspaceId:B
  }
 };
}
function managementRows(config=fixture()){
 return config.manifest.expected.map(entry=>({
  slug:entry.slug,status:"ACTIVE",version:entry.version,
  verify_jwt:entry.verifyJwt,ezbr_sha256:entry.bundleSha256
 }));
}
const json=(data)=>new Response(JSON.stringify(data),{
 status:200,headers:{"content-type":"application/json","cache-control":"no-store"}
});
function transport(config=fixture(),{records=[],mutateRows,mutateControl,mutateEnrollment}={}){
 const managementFetch=async(url,opts)=>{
  records.push({kind:"management",url,method:opts.method});
  assert.equal(url,"https://api.supabase.com/v1/projects/"+stage+"/functions");
  assert.equal(opts.method,"GET");
  assert.equal(opts.redirect,"error");
  assert.equal(opts.headers.Authorization,"Bearer "+managementToken);
  const rows=managementRows(config);
  if(mutateRows)mutateRows(rows);
  return json(rows);
 };
 const hostedFetch=async(url,opts)=>{
  records.push({kind:"hosted",url,method:opts.method,body:opts.body});
  assert.match(url,/^https:\/\/s{20}\.supabase\.co\/functions\/v1\/docker-(control|enrollment)$/);
  assert.equal(opts.method,"POST");
  assert.equal(opts.body,'{"action":"list"}');
  const route=url.endsWith("docker-enrollment")?"enrollment":"control";
  const jwt=opts.headers.Authorization;
  if(!jwt||jwt==="Bearer invalid.jwt.token")
   return new Response(JSON.stringify({error:"Unauthenticated"}),{
    status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
  const isA=jwt==="Bearer "+tokenA;
  assert.ok(isA||jwt==="Bearer "+tokenB);
  if(route==="enrollment"){
   const agent=isA?AA:BB;
   let payload={remoteConnectivityEnabled:false,
    workspaces:[{id:isA?A:B}],agents:[{id:agent}],reports:[{agent_id:agent}]};
   if(mutateEnrollment)payload=mutateEnrollment(payload,isA);
   return json(payload);
  }
  const agent=isA?AA:BB;
  let payload={source:"authenticated_server",remoteExecutionEnabled:false,
   requests:[{id:isA?A:B}],events:[],agents:[{id:agent}],
   incidents:[],incidentEvents:[]};
  if(mutateControl)payload=mutateControl(payload,isA);
  return json(payload);
 };
 return {managementFetch,hostedFetch};
}
test("full live staging report combines four pinned functions and ten two-account checks, no deployment",async()=>{
 const config=fixture(),records=[],t=transport(config,{records});
 const report=await runDockerStagingAcceptance(config,{
  ...t,observedAt:()=>"2026-11-23T00:00:00.000Z"
 });
 assert.equal(records.length,9);
 assert.equal(records.filter(x=>x.method==="GET").length,1);
 assert.equal(records.filter(x=>x.method==="POST").length,8);
 assert.ok(records.filter(x=>x.method==="POST").every(x=>x.body==='{"action":"list"}'));
 assert.equal(report.passed,true);
 assert.equal(report.functionChecks.length,4);
 assert.equal(report.accountChecks.length,10);
 assert.ok(report.functionChecks.every(x=>x.pinnedBundleDigestMatches&&x.passed));
 assert.ok(report.accountChecks.every(x=>x.passed));
 assert.equal(report.independentDeployedSourceBytesVerified,false);
 assert.equal(report.fullStagingRlsAuditPerformed,false);
 assert.equal(report.stagingDockerHostAttested,false);
 assert.equal(report.realDockerCommandExecutionTested,false);
 assert.equal(report.productionDeploymentAuthorized,false);
 assert.equal(report.stagingDockerExecutionAuthorized,false);
 assert.equal(report.operationalReleaseApproved,false);
 assert.match(report.acceptanceDigest,/^[a-f0-9]{64}$/);
 for(const secret of [tokenA,tokenB,publishable,managementToken])
  assert.equal(JSON.stringify(report).includes(secret),false);
});
test("invalid independent commit, production ref or manifest pin blocks any HTTP call",async()=>{
 const config=fixture();let calls=0;
 const deny=async()=>{calls++;throw Error("should never connect");};
 const cases=[
  {checkedOutCommitSha:"b".repeat(40)},
  {productionRef:stage},{stagingRef:prod},
  {releaseCommitSha:"c".repeat(40)},
  {pinnedManifestSha256:"0".repeat(64)},
  {probe:{...config.probe,productionHost:stage+".supabase.co"}},
  {probe:{...config.probe,pinnedStagingHost:prod+".supabase.co"}},
  {probe:{...config.probe,ownerBJwt:tokenA}},
  {managementToken:"bad"},
  {manifest:{...config.manifest,expected:config.manifest.expected.slice(0,3)}}
 ];
 for(const patch of cases)await assert.rejects(
  ()=>runDockerStagingAcceptance({...config,...patch},{
   managementFetch:deny,hostedFetch:deny
  }));
 assert.equal(calls,0);
});
test("un-pinned staging bundle metadata fails before network even when version matches",()=>{
 const config=fixture();
 const manifest={...config.manifest,expected:config.manifest.expected.map((entry,i)=>
  i===2?{...entry,bundleSha256:null}:entry)};
 const pin=createDockerDeploymentManifestPin(manifest);
 assert.throws(()=>validateDockerStagingAcceptanceConfig({
  ...config,manifest,pinnedManifestSha256:pin
 }),/bundle digests/);
});
test("deployed JWT drift, mismatched version, missing bundle and unexpected docker route block JWT probes",async()=>{
 for(const modify of [
  rows=>{rows[0].verify_jwt=false;},
  rows=>{rows[1].version+=1;},
  rows=>{rows[2].ezbr_sha256=null;},
  rows=>{rows.push({slug:"docker-unreviewed-execute",status:"ACTIVE",version:1,verify_jwt:false});}
 ]){
  const records=[],config=fixture();
  const t=transport(config,{records,mutateRows:modify});
  await assert.rejects(()=>runDockerStagingAcceptance(config,t));
  assert.equal(records.length,1);
 }
});
test("live hosted anonymous acceptance and cross-owner workspace leakage fail closed",async()=>{
 const cases=[
  {mutateEnrollment:(data,isA)=>!isA?{...data,workspaces:[{id:A}]}:data},
  {mutateControl:(data,isA)=>!isA?{...data,remoteExecutionEnabled:true}:data}
 ];
 for(const patch of cases){
  const records=[],cfg=fixture();
  const t=transport(cfg,{records,...patch});
  await assert.rejects(()=>runDockerStagingAcceptance(cfg,t));
  assert.equal(records[0].kind,"management");
  assert.equal(records.filter(x=>x.kind==="hosted").length,8);
 }
});
test("host transport error is fail-closed and no sanitised result falsely claims success",async()=>{
 const cfg=fixture(),t=transport(cfg);
 await assert.rejects(()=>runDockerStagingAcceptance(cfg,{
  ...t,hostedFetch:async()=>{throw Error("sensitive "+tokenA);}
 }),/checks failed/);
 await assert.rejects(()=>runDockerStagingAcceptance(cfg,{
  ...t,managementFetch:async()=>{throw Error("service offline");}
 }));
});
test("strict CLI preflight checks manual approval and independent project/commit inputs without network",()=>{
 const cfg=fixture();
 const env={
  ...process.env,
  ETERNYX_DOCKER_STAGING_MANIFEST_B64:Buffer.from(JSON.stringify(cfg.manifest)).toString("base64"),
  ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256:cfg.pinnedManifestSha256,
  ETERNYX_DOCKER_STAGING_REF:cfg.stagingRef,
  ETERNYX_DOCKER_PRODUCTION_REF:cfg.productionRef,
  ETERNYX_DOCKER_APPROVED_COMMIT_SHA:cfg.releaseCommitSha,
  ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA:cfg.checkedOutCommitSha,
  ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN:managementToken,
  ETERNYX_DOCKER_STAGING_URL:cfg.probe.stagingUrl,
  ETERNYX_DOCKER_STAGING_PINNED_HOST:cfg.probe.pinnedStagingHost,
  ETERNYX_DOCKER_PRODUCTION_HOST:cfg.probe.productionHost,
  ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY:cfg.probe.publishableKey,
  ETERNYX_DOCKER_STAGING_OWNER_A_JWT:cfg.probe.ownerAJwt,
  ETERNYX_DOCKER_STAGING_OWNER_B_JWT:cfg.probe.ownerBJwt,
  ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE:cfg.probe.ownerAWorkspaceId,
  ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE:cfg.probe.ownerBWorkspaceId,
  ETERNYX_DOCKER_STAGING_READONLY_APPROVAL:"I_APPROVE_READ_ONLY_STAGING",
  ETERNYX_DOCKER_INPUT_STAGING_REF:cfg.stagingRef,
  ETERNYX_DOCKER_INPUT_PRODUCTION_REF:cfg.productionRef,
  ETERNYX_DOCKER_INPUT_RELEASE_SHA:cfg.releaseCommitSha
 };
 const cli=fileURLToPath(new URL("../scripts/docker-staging-acceptance.mjs",import.meta.url));
 const cmd=(opts={})=>spawnSync(process.execPath,[cli,"--preflight"],{
  env:{...env,...opts},encoding:"utf8",timeout:10000});
 const good=cmd();
 assert.equal(good.status,0,good.stderr);
 assert.equal(JSON.parse(good.stdout).remoteRequestsSent,false);
 assert.equal(cmd({ETERNYX_DOCKER_STAGING_READONLY_APPROVAL:""}).status,1);
 assert.equal(cmd({ETERNYX_DOCKER_INPUT_STAGING_REF:cfg.productionRef}).status,1);
 assert.equal(cmd({ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA:"f".repeat(40)}).status,1);
 assert.equal(cmd({ETERNYX_DOCKER_PRODUCTION_REF:cfg.stagingRef}).status,1);
 for(const secret of [tokenA,tokenB,publishable,managementToken])
  assert.equal((good.stdout+good.stderr).includes(secret),false);
});
test("release preflight uses bounded credentials, fixed host and no mutation functions",()=>{
 const files=["src/lib/dockerStagingAcceptance.mjs","scripts/docker-staging-acceptance.mjs"];
 for(const path of files){
  const code=readFileSync(new URL("../"+path,import.meta.url),"utf8");
  assert.doesNotMatch(code,/supabase functions deploy|docker\.sock|execFileSync|spawnSync|Deno\.Command/);
 }
 const source=readFileSync(new URL("../src/lib/dockerStagingAcceptance.mjs",import.meta.url),"utf8");
 assert.match(source,/runDockerHostedAuthProbe/);
 assert.match(source,/inspectDockerStagingDeployment/);
 assert.match(source,/stagingDockerExecutionAuthorized:false/);
 assert.match(source,/fullStagingRlsAuditPerformed:false/);
});
