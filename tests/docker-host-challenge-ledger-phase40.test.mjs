import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,chmodSync,symlinkSync,lstatSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync,spawn} from "node:child_process";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {evaluateSignedDockerHostReadOnly} from "../src/lib/dockerSignedHostReadOnlyPreflight.mjs";
import {signDockerReadOnlyHostReport} from "../src/lib/dockerSignedHostEvidenceReview.mjs";
import {
 issueDockerHostChallenge,consumeDockerHostChallenge,inspectDockerHostChallenge,
 validateIndependentHostChallengeTemplate,HOST_CHALLENGE_TEMPLATE_KEYS
} from "../src/lib/dockerHostChallengeLedger.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const ID="a".repeat(64),IMAGE="f".repeat(64),CTX="rootless-offline-challenge";
const HOST="unix:///run/user/1001/docker.sock",DAEMON="never-run-Docker";
const DAEMON_SHA=sha("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON);
const testdir=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-phase40-ledger-"));
 const ledger=join(dir,"ledger");mkdirSync(ledger,{mode:0o700});
 try{return fn({dir,ledger});}finally{rmSync(dir,{recursive:true,force:true});}
};
function target(){
 return {Id:ID,Name:"/do-not-leak-container",Image:"sha256:"+IMAGE,
  Config:{Image:"example.invalid/lab@sha256:"+IMAGE,User:"10001:10001",
   Env:["PRIVATE_KEY=DO_NOT_EXPOSE"],Labels:{"io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"}},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""},
  RestartCount:0,Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:true,Status:"running",StartedAt:"2026-11-23T11:00:00.000Z",
   FinishedAt:"0001-01-01T00:00:00Z",Pid:1234,ExitCode:0,
   Paused:false,Restarting:false,Dead:false}};
}
function setup(dir,now=new Date()){
 const t=target(),pins={context:CTX,host:HOST,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:DAEMON_SHA,imageSha256:IMAGE,
  policySha256:fingerprintLabContainer(t,ID).policySha256};
 const info={ID:DAEMON,SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
  Swarm:{LocalNodeState:"inactive"}};
 const inventory=auditSignedAgentRecoveryDirectory(dir);
 const original=evaluateSignedDockerHostReadOnly({
  pins,contextBefore:CTX,contextAfter:CTX,endpointBefore:HOST,endpointAfter:HOST,
  infoBefore:info,infoAfter:structuredClone(info),
  targetBefore:t,targetAfter:structuredClone(t),containerId:ID,operation:"stop",
  inventoryBefore:inventory,inventoryAfter:inventory,
  cli:{hashVerified:true,rootOwned:true,symlinkFree:true,sha256:"1".repeat(64)},
  config:{completeTreeVerified:true,rootOwned:true,onlyOneLocalContext:true,
   context:CTX,endpoint:HOST,sha256:"2".repeat(64)}
 });
 const report={...original,inspectedAt:now.toISOString(),
  readOnlyHostEvidenceSha256:sha("ETERNYX_DOCKER_HOST_READONLY_OUTPUT_V1\n"+
   original.evidenceSha256)};
 const keys=generateKeyPairSync("ed25519");
 const publicBytes=keys.publicKey.export({type:"spki",format:"der"}).subarray(12);
 const pub=publicBytes.toString("base64url");
 const template={
  operatorTargetSha256:report.operatorTargetSha256,
  approvedContextSha256:report.approvedContextSha256,
  approvedDaemonIdSha256:report.approvedDaemonIdSha256,
  approvedImageSha256:report.approvedImageSha256,
  approvedPolicySha256:report.approvedPolicySha256,
  approvedClientSha256:report.approvedClientSha256,
  approvedConfigManifestSha256:report.approvedConfigManifestSha256,
  observationOperation:"stop",
  publicKeySha256:sha(publicBytes)
 };
 return {report,keys,pub,template,now};
}
function proof(ledger,e,at=e.now){
 const issued=issueDockerHostChallenge(ledger,e.template,at);
 const bundle=signDockerReadOnlyHostReport(e.report,issued.challenge,
  e.keys.privateKey,e.now);
 return {issued,bundle,expected:issued.expected};
}
const consume=(ledger,e,p,now=e.now)=>
 consumeDockerHostChallenge(ledger,p.bundle,e.pub,p.expected,now);

test("real Phase38 evidence plus independent Ed25519 pins yields ONE durable review",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),p=proof(ledger,e);
 assert.match(p.issued.challenge,/^[a-f0-9]{64}$/);
 assert.deepEqual(Object.keys(p.expected),[
  "operatorTargetSha256","approvedContextSha256","approvedDaemonIdSha256",
  "approvedImageSha256","approvedPolicySha256","approvedClientSha256",
  "approvedConfigManifestSha256","observationOperation","challenge",
  "publicKeySha256"
 ]);
 const issuedPath=join(ledger,"issue-"+p.issued.challenge+".json");
 assert.equal(lstatSync(issuedPath).uid,process.getuid());
 assert.equal((lstatSync(issuedPath).mode&0o077),0);
 assert.equal(inspectDockerHostChallenge(ledger,p.issued.challenge).status,"issued_unconsumed");
 const result=consume(ledger,e,p);
 assert.equal(result.signatureValid,true);
 assert.equal(result.challengeConsumedExactlyOnce,true);
 assert.equal(result.reviewerOwnedLedgerVerified,true);
 assert.equal(result.stagingMutationAuthorized,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.physicalHostIsolationIndependentlyProven,false);
 assert.equal(result.reviewStatus,"one_time_challenge_consumed_attestor_observation_only");
 assert.equal(inspectDockerHostChallenge(ledger,p.issued.challenge).status,"consumed");
 assert.throws(()=>consume(ledger,e,p),/already consumed|EEXIST/);
 assert.equal(lstatSync(join(ledger,"consume-"+p.issued.challenge+".json")).uid,process.getuid());
 assert.equal((lstatSync(join(ledger,"consume-"+p.issued.challenge+".json")).mode&0o077),0);
 const text=JSON.stringify(result);
 assert.doesNotMatch(text,/DO_NOT_EXPOSE|do-not-leak-container|never-run-Docker|\/run\/user/);
}));
test("two freshly issued challenges are cryptographically distinct; original consumption cannot be reset",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),one=proof(ledger,e),two=proof(ledger,e);
 assert.notEqual(one.issued.challenge,two.issued.challenge);
 assert.notEqual(one.issued.originalIssuanceSha256,two.issued.originalIssuanceSha256);
 consume(ledger,e,one);
 assert.equal(inspectDockerHostChallenge(ledger,two.issued.challenge).status,"issued_unconsumed");
 assert.equal(consume(ledger,e,two).challengeConsumedExactlyOnce,true);
 assert.throws(()=>consume(ledger,e,one),/already consumed/);
}));
test("invalid Ed25519 proof, altered report, wrong key and mismatched reviewer pins NEVER consume a challenge",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),p=proof(ledger,e);
 const bad=[
  {...p,bundle:{...p.bundle,signature:"a".repeat(86)}},
  {...p,bundle:{...p.bundle,report:{...p.bundle.report,productionDeploymentAuthorized:true}}},
  {...p,expected:{...p.expected,approvedPolicySha256:"9".repeat(64)}},
  {...p,expected:{...p.expected,challenge:"9".repeat(64)}},
 ];
 for(const failure of bad)assert.throws(()=>consume(ledger,e,failure));
 assert.throws(()=>consumeDockerHostChallenge(
  ledger,p.bundle,"x".repeat(43),p.expected,e.now));
 assert.equal(inspectDockerHostChallenge(ledger,p.issued.challenge).status,"issued_unconsumed");
 assert.equal(consume(ledger,e,p).challengeConsumedExactlyOnce,true);
}));
test("separately issued challenge must predate the original observation, not merely carry a valid signature",()=>testdir(({dir,ledger})=>{
 const past=new Date(Date.now()-3*60000),e=setup(dir,past);
 const future=new Date(past.valueOf()+90*1000);
 const issued=issueDockerHostChallenge(ledger,e.template,future);
 const bundle=signDockerReadOnlyHostReport(e.report,issued.challenge,
  e.keys.privateKey,past);
 assert.throws(()=>consumeDockerHostChallenge(
  ledger,bundle,e.pub,issued.expected,future),/does not precede/);
}));
test("expired issue record is rejected even when the signature is within its own freshness window",()=>testdir(({dir,ledger})=>{
 const now=new Date(),e=setup(dir,now);
 const issued=issueDockerHostChallenge(ledger,e.template,
  new Date(now.valueOf()-16*60000));
 const bundle=signDockerReadOnlyHostReport(e.report,issued.challenge,
  e.keys.privateKey,now);
 assert.throws(()=>consumeDockerHostChallenge(
  ledger,bundle,e.pub,issued.expected,now),/expired/);
}));
test("unknown files, symlink entries, public readability and incomplete consumption block fail closed",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),p=proof(ledger,e);
 const path=join(ledger,"issue-"+p.issued.challenge+".json");
 chmodSync(path,0o644);
 assert.throws(()=>consume(ledger,e,p),/private|bounded/);
 chmodSync(path,0o600);
 const bad=join(ledger,"consume-"+p.issued.challenge+".json");
 writeFileSync(bad,"{\n",{mode:0o600});
 assert.throws(()=>consume(ledger,e,p),/Invalid|interrupted|canonical/);
 assert.equal(readFileSync(bad,"utf8"),"{\n");
 assert.throws(()=>inspectDockerHostChallenge(ledger,p.issued.challenge));
}));
test("ledger symlink and non-private directory are never writable by issuer",()=>testdir(({dir,ledger})=>{
 const e=setup(dir);
 const link=join(dir,"aliased");
 symlinkSync(ledger,link);
 assert.throws(()=>issueDockerHostChallenge(link,e.template),/symlink/);
 chmodSync(ledger,0o755);
 assert.throws(()=>issueDockerHostChallenge(ledger,e.template),/mode 0700/);
 chmodSync(ledger,0o700);
 assert.throws(()=>issueDockerHostChallenge(join(dir,"missing"),e.template));
}));
test("malformed independent pin templates are rejected before any durable issuance",()=>testdir(({dir,ledger})=>{
 const e=setup(dir);
 assert.deepEqual(Object.keys(e.template),HOST_CHALLENGE_TEMPLATE_KEYS);
 for(const change of [
  {publicKeySha256:"BAD"},{operation:"start"},
  {observationOperation:"shell"},
  {approvedPolicySha256:"a".repeat(63)},
  {extra:"injected"}
 ]){
  assert.throws(()=>validateIndependentHostChallengeTemplate({...e.template,...change}));
 }
 assert.deepEqual(Object.keys(issueDockerHostChallenge(ledger,e.template).expected).slice(-2),
  ["challenge","publicKeySha256"]);
}));
test("two concurrent independent reviewer CLI processes cannot both consume the same issued challenge",async()=> {
 const dir=mkdtempSync(join(tmpdir(),"eternyx-phase40-concurrency-"));
 const ledger=join(dir,"ledger");mkdirSync(ledger,{mode:0o700});
 try{
  const e=setup(dir),p=proof(ledger,e);
  const evidence=join(dir,"evidence.json"),pub=join(dir,"pub.key"),pins=join(dir,"pins.json");
  writeFileSync(evidence,JSON.stringify(p.bundle)+"\n",{mode:0o600});
  writeFileSync(pub,e.pub+"\n",{mode:0o600});
  writeFileSync(pins,JSON.stringify(p.expected)+"\n",{mode:0o600});
  const script=new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url).pathname;
  const run=()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[script,evidence,pub,pins,"--consume-ledger",ledger],{
    env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]
   });
   let stdout="",stderr="";
   child.stdout.setEncoding("utf8").on("data",d=>{stdout+=d;});
   child.stderr.setEncoding("utf8").on("data",d=>{stderr+=d;});
   child.on("error",reject);
   child.on("close",code=>resolve({code,stdout,stderr}));
  });
  const pair=await Promise.all([run(),run()]);
  assert.deepEqual(pair.map(x=>x.code).sort((a,b)=>a-b),[0,1]);
  const winner=pair.find(x=>x.code===0);
  assert.equal(JSON.parse(winner.stdout).challengeConsumedExactlyOnce,true);
  assert.equal(pair.find(x=>x.code!==0).stdout,"");
  assert.equal(inspectDockerHostChallenge(ledger,p.issued.challenge).status,"consumed");
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("separate challenge issuer CLI accepts only private independently authored exact template",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),template=join(dir,"independent.json");
 writeFileSync(template,JSON.stringify(e.template)+"\n",{mode:0o600});
 const script=new URL("../scripts/docker-lab-host-challenge.mjs",import.meta.url).pathname;
 const run=()=>spawnSync(process.execPath,[script,"issue",ledger,template],{
  encoding:"utf8",timeout:7000,env:{...process.env,CI:"true"}
 });
 const ok=run();assert.equal(ok.status,0,ok.stderr);
 const output=JSON.parse(ok.stdout);
 assert.match(output.challenge,/^[a-f0-9]{64}$/);
 assert.equal(output.productionDeploymentAuthorized,false);
 chmodSync(template,0o644);
 const bad=run();assert.notEqual(bad.status,0);
 assert.equal(bad.stdout,"");
}));
test("old signature-only reviewer explicitly cannot claim replay protection",()=>testdir(({dir,ledger})=>{
 const e=setup(dir),p=proof(ledger,e);
 const evidence=join(dir,"evidence.json"),pub=join(dir,"pub.key"),pins=join(dir,"pins.json");
 writeFileSync(evidence,JSON.stringify(p.bundle)+"\n",{mode:0o600});
 writeFileSync(pub,e.pub+"\n",{mode:0o600});
 writeFileSync(pins,JSON.stringify(p.expected)+"\n",{mode:0o600});
 const script=new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url).pathname;
 const run=()=>spawnSync(process.execPath,[script,evidence,pub,pins],{
  encoding:"utf8",timeout:7000
 });
 const first=run(),second=run();
 assert.equal(first.status,0,first.stderr);
 assert.equal(second.status,0,second.stderr);
 assert.equal(JSON.parse(first.stdout).challengeConsumedExactlyOnce,false);
 assert.equal(JSON.parse(second.stdout).reviewerOwnedLedgerVerified,false);
 assert.equal(inspectDockerHostChallenge(ledger,p.issued.challenge).status,"issued_unconsumed");
}));
test("no Docker/network execution flags, automatic lock clearing or privileged API in challenge and reviewer CLIs",()=>{
 const issuer=readFileSync(new URL("../scripts/docker-lab-host-challenge.mjs",import.meta.url),"utf8");
 const verifier=readFileSync(new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url),"utf8");
 const ledger=readFileSync(new URL("../src/lib/dockerHostChallengeLedger.mjs",import.meta.url),"utf8");
 assert.match(issuer,/issueDockerHostChallenge\(/);
 assert.match(verifier,/consumeDockerHostChallenge\(args\[4\],signed,rawKey.trim\(\),expected\)/);
 assert.match(ledger,/O_CREAT\|constants\.O_EXCL/);
 assert.match(ledger,/fsyncSync\(fd\)/);
 assert.match(ledger,/syncDir\(dir\)/);
 assert.match(ledger,/verifyDockerReadOnlyHostEvidence\(bundle,pub,expected,now\)/);
 for(const s of [issuer,verifier,ledger]){
  assert.doesNotMatch(s,/spawnSync\s*\(/);
  assert.doesNotMatch(s,/\bfetch\s*\(/);
  assert.doesNotMatch(s,/\bunlinkSync\s*\(/);
  assert.doesNotMatch(s,/\bappendLabEvent\s*\(/);
  assert.doesNotMatch(s,/\breserveLabClaim\s*\(/);
 }
});
