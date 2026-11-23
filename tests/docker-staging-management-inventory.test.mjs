import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync,chmodSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
 DOCKER_FUNCTIONS,validateDockerDeploymentManifest,
 createDockerDeploymentManifestPin,parseDockerManagementInventory,
 inspectDockerStagingDeployment
} from "../src/lib/dockerStagingDeploymentInventory.mjs";

const staging="s".repeat(20),production="p".repeat(20);
const expected=(i)=>({
 slug:DOCKER_FUNCTIONS[i].slug,version:i+7,
 verifyJwt:DOCKER_FUNCTIONS[i].verifyJwt,
 bundleSha256:i%2===0?"a".repeat(64):null
});
const manifest=()=>({
 schema:"eternyx-docker-deployment-expectations-v1",
 stagingProjectRef:staging,productionProjectRef:production,
 releaseCommitSha:"f".repeat(40),
 pinnedSourceSnapshotSha256:"d".repeat(64),
 expected:DOCKER_FUNCTIONS.map((_,i)=>expected(i))
});
function inventory(){
 return DOCKER_FUNCTIONS.map((entry,i)=>({
  id:"synthetic-function-"+i,slug:entry.slug,name:entry.slug,
  version:i+7,verify_jwt:entry.verifyJwt,status:"ACTIVE",
  ezbr_sha256:i%2===0?"a".repeat(64):null
 })).concat([{slug:"unrelated-tool",version:12,status:"ACTIVE",verify_jwt:true}]);
}
const API="https://api.supabase.com/v1/projects/"+staging+"/functions";
const TOKEN="t".repeat(42); // deterministic, NONFUNCTIONAL fake test credential
function fakeFetcher(rows=inventory(),{status=200,type="application/json",
 redirect=false,url=API,record=[]}={}){
 return async (input,init)=>{
  record.push({input,init});
  assert.equal(input,API);
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  assert.equal(init.cache,"no-store");
  assert.equal(init.headers.Authorization,"Bearer "+TOKEN);
  assert.equal(init.headers.Accept,"application/json");
  return {status,redirected:redirect,url,
   headers:new Headers({"content-type":type}),
   body:new Response(JSON.stringify(rows)).body
  };
 };
}
async function run(rows=inventory(),additional={}){
 return inspectDockerStagingDeployment({
  manifest:manifest(),
  pinnedManifestSha256:createDockerDeploymentManifestPin(manifest()),
  managementToken:TOKEN,fetcher:fakeFetcher(rows),
  now:()=>new Date(0).toISOString(),...additional
 });
}
test("four managed Docker functions are fixed and pins bind release commit, project, versions and JWT",()=>{
 const m=validateDockerDeploymentManifest(manifest());
 assert.equal(m.expected.length,4);
 assert.notEqual(m.stagingProjectRef,m.productionProjectRef);
 const pin=createDockerDeploymentManifestPin(m);
 assert.match(pin,/^[a-f0-9]{64}$/);
 for(const changed of [
  {...m,releaseCommitSha:"e".repeat(40)},
  {...m,stagingProjectRef:"x".repeat(20)},
  {...m,expected:m.expected.map((x,i)=>i===0?{...x,version:99}:x)}
 ])assert.notEqual(createDockerDeploymentManifestPin(changed),pin);
});
test("manifest disallows production ref, arbitrary extra fields, wrong JWT and missing version pins",()=>{
 const m=manifest();
 for(const changed of [
  {...m,productionProjectRef:staging},
  {...m,stagingProjectRef:"not20"},
  {...m,releaseCommitSha:"HEAD"},
  {...m,pinnedSourceSnapshotSha256:"unknown"},
  {...m,service_role:"not allowed"},
  {...m,expected:m.expected.slice(1)},
  {...m,expected:[...m.expected].reverse()},
  {...m,expected:m.expected.map((x,i)=>i===0?{...x,verifyJwt:false}:x)},
  {...m,expected:m.expected.map((x,i)=>i===2?{...x,version:0}:x)},
  {...m,expected:m.expected.map((x,i)=>i===0?{...x,bundleSha256:"not_hex"}:x)}
 ])assert.throws(()=>validateDockerDeploymentManifest(changed));
});
test("real fetch-shaped GET captures staging version and JWT without declaring deployed source proof",async()=>{
 const records=[];
 const m=manifest();
 const report=await run(inventory(),{fetcher:fakeFetcher(inventory(),{record:records})});
 assert.equal(records.length,1);
 assert.equal(report.passed,true);
 assert.equal(report.checks.length,4);
 assert.equal(report.metadataDigest.length,64);
 assert.equal(report.stagingProjectRef,staging);
 assert.equal(report.releaseCommitSha,m.releaseCommitSha);
 assert.equal(report.pinnedSourceSnapshotSha256,m.pinnedSourceSnapshotSha256);
 assert.equal(report.productionProjectCalled,false);
 assert.equal(report.mutationRequestsSent,false);
 assert.equal(report.remoteCodeBytesVerified,false);
 assert.equal(report.deployedSourceParityVerified,false);
 assert.equal(report.remoteDockerCommandsIssued,false);
 assert.equal(report.productionDeploymentAuthorized,false);
 assert.equal(report.stagingDockerExecutionAuthorized,false);
 assert.equal(report.independentHumanApprovalRequired,true);
 assert.ok(report.checks.every(x=>x.passed));
 assert.doesNotMatch(JSON.stringify(report),new RegExp(TOKEN));
});
test("deployed JWT flag, active state, pinned bundle and version drift fail closed",async()=>{
 for(const changed of [
  rows=>{rows[0].verify_jwt=false;},
  rows=>{rows[1].version+=1;},
  rows=>{rows[2].status="DELETED";},
  rows=>{rows[0].ezbr_sha256="b".repeat(64);},
  rows=>{rows[2].ezbr_sha256=null;},
  rows=>{rows.pop();rows.pop();},
  rows=>{rows.push({...rows[0]});},
  rows=>{rows.push({slug:"docker-hidden-admin",version:1,status:"ACTIVE",verify_jwt:true});}
 ]){
  const rows=inventory();changed(rows);
  try{const result=await run(rows);assert.equal(result.passed,false);}
  catch(error){assert.match(error.message,/missing|Duplicate|Unreviewed|Inactive|incomplete|bundle|metadata/i);}
 }
});
test("wrong project URL, redirects, unauthorized and missing API content are rejected",async()=>{
 const patterns=[
  {status:401},{status:403},{status:429},
  {redirect:true},{url:"https://evil.example/v1/projects/"+staging+"/functions"},
  {type:"text/html"},{type:"application/x-binary"}
 ];
 for(const item of patterns){
  await assert.rejects(()=>run(inventory(),{fetcher:fakeFetcher(inventory(),item)}));
 }
 await assert.rejects(()=>run(inventory(),{fetcher:async()=>{throw Error(TOKEN);}}),
  new RegExp(TOKEN));
});
test("pin mismatch, wrong token, invalid timeout or nonfunction transport never call fetch",async()=>{
 let called=0;const transport=async()=>{called++;throw Error("should never call");};
 const base={
  manifest:manifest(),pinnedManifestSha256:"0".repeat(64),
  managementToken:TOKEN,fetcher:transport
 };
 await assert.rejects(()=>inspectDockerStagingDeployment(base));
 await assert.rejects(()=>inspectDockerStagingDeployment({...base,
  pinnedManifestSha256:createDockerDeploymentManifestPin(manifest()),managementToken:"bad"}));
 await assert.rejects(()=>inspectDockerStagingDeployment({...base,
  pinnedManifestSha256:createDockerDeploymentManifestPin(manifest()),timeoutMs:30000}));
 assert.equal(called,0);
});
test("response body has strict size bound and must decode valid JSON array",async()=>{
 const big=Array(260).fill({slug:"other",name:"x".repeat(4500)});
 await assert.rejects(()=>run(big));
 const bad=async()=>({
  status:200,url:API,redirected:false,
  headers:new Headers({"content-type":"application/json"}),
  body:new Response("{malformed").body
 });
 await assert.rejects(()=>run(inventory(),{fetcher:bad}));
 const broken=inventory();broken[0].ezbr_sha256="noncanonical";
 await assert.rejects(()=>run(broken));
});
test("CLI can pin without network but refuses live inventory without explicit opt-in",()=>{
 const cli=fileURLToPath(new URL("../scripts/docker-staging-management-inventory.mjs",import.meta.url));
 const dir=mkdtempSync(join(tmpdir(),"docker-management-ci-"));
 try{
  const path=join(dir,"expected.json");
  writeFileSync(path,JSON.stringify(manifest()),{mode:0o600});
  chmodSync(path,0o600);
  const invoke=(command,env={})=>spawnSync(process.execPath,[cli,command,path],{
   encoding:"utf8",timeout:10000,
   env:{...process.env,ETERNYX_DOCKER_MANAGEMENT_READ_ONLY_ENABLED:"false",...env}
  });
  const pinned=invoke("pin");
  assert.equal(pinned.status,0,pinned.stderr);
  assert.equal(JSON.parse(pinned.stdout).manifestSha256,createDockerDeploymentManifestPin(manifest()));
  assert.equal(JSON.parse(pinned.stdout).liveStagingCalled,false);
  const denied=invoke("inspect");
  assert.equal(denied.status,1);
  const mismatch=invoke("inspect",{
   ETERNYX_DOCKER_MANAGEMENT_READ_ONLY_ENABLED:"true",
   ETERNYX_DOCKER_STAGING_REF:production,
   ETERNYX_DOCKER_PRODUCTION_REF:staging});
  assert.equal(mismatch.status,1);
  for(const line of [pinned.stdout,denied.stderr,mismatch.stderr])
   assert.ok(!line.includes(TOKEN));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("only four Docker functions are compared; unrelated functions never become approved",()=>{
 const rows=inventory();
 rows.push({slug:"new-user-service",status:"ACTIVE",version:23,verify_jwt:false});
 const inspected=parseDockerManagementInventory(rows,manifest());
 assert.deepEqual(inspected.map(x=>x.slug),DOCKER_FUNCTIONS.map(x=>x.slug));
 assert.ok(inspected.every(x=>x.status==="ACTIVE"));
});
test("management CLI has no write endpoints, Docker calls or production execution pathway",()=>{
 const cli=readFileSync(new URL("../scripts/docker-staging-management-inventory.mjs",import.meta.url),"utf8");
 const module=readFileSync(new URL("../src/lib/dockerStagingDeploymentInventory.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(cli,/execFileSync|spawnSync|Deno\.Command|supabase functions deploy|docker\.sock/);
 assert.doesNotMatch(module,/method:"POST"|method:"PATCH"|method:"DELETE"|method:"PUT"|docker\.sock/);
 assert.match(module,/method:"GET"/);
 assert.match(module,/productionDeploymentAuthorized:false/);
});
