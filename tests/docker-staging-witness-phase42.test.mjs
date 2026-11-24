import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,chmodSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {evaluateSignedDockerHostReadOnly} from "../src/lib/dockerSignedHostReadOnlyPreflight.mjs";
import {evaluateDockerStagingLifecycleCapture,STAGING_LIFECYCLE_EXPECTED_KEYS}
 from "../src/lib/dockerStagingLifecycleEvidence.mjs";
import {signDockerReadOnlyHostReport}
 from "../src/lib/dockerSignedHostEvidenceReview.mjs";
import {issueDockerHostChallenge,inspectDockerHostChallenge}
 from "../src/lib/dockerHostChallengeLedger.mjs";
import {signDockerStagingWitnessEvidence,verifyDockerStagingWitnessEvidence,
 verifyAndConsumeDockerStagingWitness} from "../src/lib/dockerStagingWitnessEvidence.mjs";

const SHA=x=>createHash("sha256").update(x).digest("hex");
const ID="a".repeat(64),IMAGE="f".repeat(64),CONTEXT="phase42-isolated-rootless";
const HOST="unix:///run/user/1001/docker.sock",DAEMON="phase42-test-engine";
const mk=fn=>{
 const root=mkdtempSync(join(tmpdir(),"eternyx-witness-phase42-"));
 const journal=join(root,"journal"),ledger=join(root,"ledger");
 mkdirSync(journal,{mode:0o700});mkdirSync(ledger,{mode:0o700});
 try{return fn({root,journal,ledger});}finally{rmSync(root,{recursive:true,force:true});}
};
const offset=(now,ms)=>new Date(now.valueOf()+ms);
function target(op="stop",phase="before"){
 const running=phase==="before"?op!=="start":op!=="stop";
 return {
  Id:ID,Name:"/do-not-print-raw-container",Image:"sha256:"+IMAGE,
  Config:{Image:"example.invalid/test@sha256:"+IMAGE,User:"10001:10001",
   Labels:{"io.eternyx.operator.managed":"true",
    "io.eternyx.operator.scope":"local-workbench"},Env:["SECRETS=never_print_me"]},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
   Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
   CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
   Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
   PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""},
  RestartCount:phase==="after"&&op==="restart"?1:0,
  Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
  State:{Running:running,Status:running?"running":"exited",
   StartedAt:phase==="after"&&op!=="stop"?"2026-11-23T11:04:00.000Z":"2026-11-23T11:00:00.000Z",
   FinishedAt:phase==="after"&&op==="stop"?"2026-11-23T11:04:00.000Z":"0001-01-01T00:00:00Z",
   Pid:running?(phase==="after"?7862:3210):0,ExitCode:0,
   Paused:false,Restarting:false,Dead:false}
 };
}
function data(journal,op,stage){
 const t=target(op,stage);
 const pins={context:CONTEXT,host:HOST,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:SHA("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON),
  imageSha256:IMAGE,policySha256:fingerprintLabContainer(t,ID).policySha256};
 const info={ID:DAEMON,SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
  Swarm:{LocalNodeState:"inactive"}};
 const inv=auditSignedAgentRecoveryDirectory(journal);
 return {
  pins,contextBefore:CONTEXT,contextAfter:CONTEXT,
  endpointBefore:HOST,endpointAfter:HOST,
  infoBefore:info,infoAfter:structuredClone(info),
  targetBefore:t,targetAfter:structuredClone(t),
  containerId:ID,operation:op,phase:stage,
  inventoryBefore:inv,inventoryAfter:inv,
  cli:{hashVerified:true,rootOwned:true,symlinkFree:true,sha256:"1".repeat(64)},
  config:{completeTreeVerified:true,rootOwned:true,onlyOneLocalContext:true,
   context:CONTEXT,endpoint:HOST,sha256:"2".repeat(64)}
 };
}
function rawPublic(pair){
 const raw=pair.publicKey.export({type:"spki",format:"der"}).subarray(12);
 return {encoded:raw.toString("base64url"),sha256:SHA(raw)};
}
function setup(journal,ledger,op="stop",now=new Date()){
 const baselineData=data(journal,op,"before");
 const report=evaluateSignedDockerHostReadOnly({
  pins:baselineData.pins,contextBefore:CONTEXT,contextAfter:CONTEXT,
  endpointBefore:HOST,endpointAfter:HOST,
  infoBefore:baselineData.infoBefore,infoAfter:baselineData.infoAfter,
  targetBefore:baselineData.targetBefore,targetAfter:baselineData.targetAfter,
  containerId:ID,operation:op,
  inventoryBefore:baselineData.inventoryBefore,inventoryAfter:baselineData.inventoryAfter,
  cli:baselineData.cli,config:baselineData.config
 });
 const initial={...report,inspectedAt:offset(now,-120000).toISOString(),
  readOnlyHostEvidenceSha256:SHA("ETERNYX_DOCKER_HOST_READONLY_OUTPUT_V1\n"+
   report.evidenceSha256)};
 const hostKey=generateKeyPairSync("ed25519"),witnessKey=generateKeyPairSync("ed25519");
 const hostPub=rawPublic(hostKey),witnessPub=rawPublic(witnessKey);
 const template={
  operatorTargetSha256:report.operatorTargetSha256,
  approvedContextSha256:report.approvedContextSha256,
  approvedDaemonIdSha256:report.approvedDaemonIdSha256,
  approvedImageSha256:report.approvedImageSha256,
  approvedPolicySha256:report.approvedPolicySha256,
  approvedClientSha256:report.approvedClientSha256,
  approvedConfigManifestSha256:report.approvedConfigManifestSha256,
  observationOperation:op,publicKeySha256:hostPub.sha256
 };
 const issued=issueDockerHostChallenge(ledger,template,offset(now,-150000));
 const host=signDockerReadOnlyHostReport(initial,issued.challenge,
  hostKey.privateKey,offset(now,-110000));
 const before=evaluateDockerStagingLifecycleCapture(
  baselineData,offset(now,-90000));
 const after=evaluateDockerStagingLifecycleCapture(
  data(journal,op,"after"),offset(now,-45000));
 const lifecycleExpected={};
 for(const key of STAGING_LIFECYCLE_EXPECTED_KEYS)
  lifecycleExpected[key]=before[key];
 const common={
  host,before,after,hostExpected:issued.expected,
  lifecycleExpected,hostPublic:hostPub.encoded
 };
 const witness=signDockerStagingWitnessEvidence({
  ...common,witnessPrivateKey:witnessKey.privateKey,acknowledged:true
 },offset(now,-20000));
 return {now,hostKey,witnessKey,hostPub,witnessPub,issued,
  common,witness,
  review:{...common,witness,witnessPublic:witnessPub.encoded,
   witnessPublicKeySha256:witnessPub.sha256}};
}
test("independent witness signs exact Phase39/41 evidence for start, stop, restart; no deployment authorized",()=>mk(({journal,ledger})=>{
 for(const op of ["start","stop","restart"]){
  const e=setup(journal,ledger,op);
  const review=verifyDockerStagingWitnessEvidence(e.review,e.now);
  assert.equal(review.separatelyPinnedWitnessSignatureValid,true);
  assert.equal(review.originalHostSignatureValid,true);
  assert.equal(review.originalLifecycleComparisonValid,true);
  assert.equal(review.witnessDistinctFromHostAttestor,true);
  assert.equal(review.witnessStatementAuthenticated,true);
  assert.equal(review.reviewerOneTimeChallengeConsumed,false);
  for(const key of ["independentHostIsolationProven","actionCausalityIndependentlyProven",
   "stagingExecutionAuthorized","productionDeploymentAuthorized",
   "permitRevocationDrillProven","crashRecoveryDrillProven",
   "receiptReconciliationProven"])
   assert.equal(review[key],false,key);
  assert.doesNotMatch(JSON.stringify(review),/never_print_me|do-not-print-raw-container|phase42-test-engine|\/run\/user/);
  const committed=verifyAndConsumeDockerStagingWitness(ledger,e.review,e.now);
  assert.equal(committed.reviewerOneTimeChallengeConsumed,true);
  assert.equal(committed.productionDeploymentAuthorized,false);
  assert.equal(inspectDockerHostChallenge(ledger,e.issued.challenge).status,"consumed");
  assert.throws(()=>verifyAndConsumeDockerStagingWitness(ledger,e.review,e.now),/already consumed/);
 }
}));
test("witness must use independent Ed25519 key, and explicit human acknowledgment",()=>mk(({journal,ledger})=>{
 const e=setup(journal,ledger);
 for(const extra of [
  {acknowledged:false},
  {acknowledged:undefined},
  {witnessPrivateKey:e.hostKey.privateKey,acknowledged:true},
  {witnessPrivateKey:null,acknowledged:true}
 ])assert.throws(()=>signDockerStagingWitnessEvidence({
  ...e.common,witnessPrivateKey:e.witnessKey.privateKey,acknowledged:true,...extra
 },offset(e.now,-20000)));
}));
test("tampering signed witness/report/stages, wrong independent key and wrong operation deny WITHOUT consuming",()=>mk(({journal,ledger})=>{
 const e=setup(journal,ledger);
 const wrong=generateKeyPairSync("ed25519"),other=rawPublic(wrong);
 const cases=[
  {witness:{...e.witness,signature:"A".repeat(86)}},
  {witness:{...e.witness,originalBeforeSha256:"c".repeat(64)}},
  {witness:{...e.witness,originalAfterSha256:"c".repeat(64)}},
  {witness:{...e.witness,originalHostBundleSha256:"c".repeat(64)}},
  {witness:{...e.witness,productionDeploymentAuthorized:true}},
  {witness:{...e.witness,physicalIsolationIndependentlyProven:true}},
  {witness:{...e.witness,extra:"forged"}},
  {witnessPublic:other.encoded,witnessPublicKeySha256:other.sha256},
  {witnessPublic:e.hostPub.encoded,witnessPublicKeySha256:e.hostPub.sha256},
  {witnessPublicKeySha256:"3".repeat(64)},
  {lifecycleExpected:{...e.common.lifecycleExpected,operation:"restart"}},
  {hostExpected:{...e.common.hostExpected,approvedPolicySha256:"7".repeat(64)}},
  {host:{...e.common.host,signature:"a".repeat(86)}},
  {before:{...e.common.before,localHistorySha256:"b".repeat(64)}},
  {after:{...e.common.after,observedNetworkSha256:"f".repeat(64)}}
 ];
 for(const changed of cases)
  assert.throws(()=>verifyAndConsumeDockerStagingWitness(ledger,{
   ...e.review,...changed
  },e.now),undefined,JSON.stringify(Object.keys(changed)));
 assert.equal(inspectDockerHostChallenge(ledger,e.issued.challenge).status,"issued_unconsumed");
 assert.equal(verifyAndConsumeDockerStagingWitness(ledger,e.review,e.now).reviewerOneTimeChallengeConsumed,true);
}));
test("stale, reversed, after-state before preflight and late human witness signing are refused",()=>mk(({journal,ledger})=>{
 const e=setup(journal,ledger);
 assert.throws(()=>verifyDockerStagingWitnessEvidence(
  e.review,offset(e.now,16*60000)),/stale|expired/);
 assert.throws(()=>signDockerStagingWitnessEvidence({
  ...e.common,witnessPrivateKey:e.witnessKey.privateKey,acknowledged:true
 },offset(e.now,80000)),/within one minute|stale/);
 assert.throws(()=>verifyDockerStagingWitnessEvidence({
  ...e.review,before:e.common.after,after:e.common.before
 },e.now));
 const after={...e.common.after,inspectedAt:offset(e.now,-130000).toISOString()};
 assert.throws(()=>verifyDockerStagingWitnessEvidence({...e.review,after},e.now));
 assert.equal(inspectDockerHostChallenge(ledger,e.issued.challenge).status,"issued_unconsumed");
}));
function files(root,e){
 const body={
  host:join(root,"host.json"),hostPub:join(root,"host.pub"),
  hostExpected:join(root,"host-approved.json"),
  before:join(root,"before.json"),after:join(root,"after.json"),
  lifecycle:join(root,"lifecycle-approved.json"),
  witness:join(root,"witness.json"),witnessPub:join(root,"witness.pub"),
  witnessPins:join(root,"witness-pins.json"),private:join(root,"witness.pk8")
 };
 const map=[
  [body.host,e.common.host],[body.hostExpected,e.common.hostExpected],
  [body.before,e.common.before],[body.after,e.common.after],
  [body.lifecycle,e.common.lifecycleExpected],[body.witness,e.witness],
  [body.witnessPins,{witnessPublicKeySha256:e.witnessPub.sha256}]
 ];
 for(const [p,v] of map)writeFileSync(p,JSON.stringify(v)+"\n",{mode:0o600});
 writeFileSync(body.hostPub,e.hostPub.encoded+"\n",{mode:0o600});
 writeFileSync(body.witnessPub,e.witnessPub.encoded+"\n",{mode:0o600});
 writeFileSync(body.private,e.witnessKey.privateKey.export({type:"pkcs8",format:"der"}),{mode:0o600});
 return body;
}
const tool=new URL("../scripts/docker-staging-witness-evidence.mjs",import.meta.url).pathname;
const reviewArgs=(p,ledger)=>["review",p.witness,p.host,p.hostPub,
 p.hostExpected,p.before,p.after,p.lifecycle,p.witnessPub,p.witnessPins,ledger];
test("real offline witness CLI signer, reviewer, and repeat-refusal work on private files",()=>mk(({root,journal,ledger})=>{
 const e=setup(journal,ledger),p=files(root,e);
 const signArgs=["sign",p.host,p.hostPub,p.hostExpected,p.before,p.after,
  p.lifecycle,p.private,"--attest-independent-witness"];
 // The reference witness in setup was signed 20 seconds earlier, but this
 // subprocess signs now with the same independently controlled private key.
 const signer=spawnSync(process.execPath,[tool,...signArgs],{
  encoding:"utf8",timeout:10000
 });
 assert.equal(signer.status,0,signer.stderr);
 const signed=JSON.parse(signer.stdout);
 assert.equal(signed.challenge,e.issued.challenge);
 assert.match(signed.signature,/^[A-Za-z0-9_-]{86}$/);
 writeFileSync(p.witness,JSON.stringify(signed)+"\n");
 const first=spawnSync(process.execPath,[tool,...reviewArgs(p,ledger)],{
  encoding:"utf8",timeout:10000
 });
 assert.equal(first.status,0,first.stderr);
 assert.equal(JSON.parse(first.stdout).reviewerOneTimeChallengeConsumed,true);
 const replay=spawnSync(process.execPath,[tool,...reviewArgs(p,ledger)],{
  encoding:"utf8",timeout:10000
 });
 assert.notEqual(replay.status,0);
 assert.equal(replay.stdout,"");
}));
test("two competing offline reviewers cannot both use the witness-bound Phase40 challenge",async()=>{
 const root=mkdtempSync(join(tmpdir(),"phase42-parallel-"));
 const journal=join(root,"journal"),ledger=join(root,"ledger");
 mkdirSync(journal,{mode:0o700});mkdirSync(ledger,{mode:0o700});
 try{
  const e=setup(journal,ledger),p=files(root,e);
  const run=()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[tool,...reviewArgs(p,ledger)],{
    stdio:["ignore","pipe","pipe"]
   });
   let out="",err="";
   child.stdout.setEncoding("utf8").on("data",s=>out+=s);
   child.stderr.setEncoding("utf8").on("data",s=>err+=s);
   child.on("error",reject);
   child.on("close",code=>resolve({code,out,err}));
  });
  const two=await Promise.all([run(),run()]);
  assert.deepEqual(two.map(x=>x.code).sort((a,b)=>a-b),[0,1]);
  assert.equal(JSON.parse(two.find(x=>x.code===0).out).reviewerOneTimeChallengeConsumed,true);
  assert.equal(two.find(x=>x.code!==0).out,"");
  assert.equal(inspectDockerHostChallenge(ledger,e.issued.challenge).status,"consumed");
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("untrusted public key, overwritten witness, public reviewer pins and symlinks deny without ledger consumption",()=>mk(({root,journal,ledger})=>{
 const e=setup(journal,ledger),p=files(root,e);
 const run=args=>spawnSync(process.execPath,[tool,...args],{encoding:"utf8",timeout:10000});
 chmodSync(p.witnessPins,0o644);
 assert.notEqual(run(reviewArgs(p,ledger)).status,0);
 chmodSync(p.witnessPins,0o600);
 const path=join(root,"link.key");symlinkSync(p.witnessPub,path);
 const args=reviewArgs(p,ledger);
 args[8]=path;
 assert.notEqual(run(args).status,0);
 writeFileSync(p.witness,JSON.stringify(e.witness).replace(
  '"schema":"eternyx-docker-staging-witness-signed-v1"',
  '"schema":"eternyx-docker-staging-witness-signed-v1","schema":"eternyx-docker-staging-witness-signed-v1"')+"\n");
 assert.notEqual(run(reviewArgs(p,ledger)).status,0);
 assert.equal(inspectDockerHostChallenge(ledger,e.issued.challenge).status,"issued_unconsumed");
}));
test("real witness CLI cannot run Docker, contact Supabase or bypass ledger consumption",()=>{
 const s=readFileSync(new URL("../scripts/docker-staging-witness-evidence.mjs",import.meta.url),"utf8");
 const core=readFileSync(new URL("../src/lib/dockerStagingWitnessEvidence.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(s,/\bspawnSync\s*\(/);
 assert.doesNotMatch(s,/\bfetch\s*\(/);
 assert.doesNotMatch(s,/\bappendLabEvent\s*\(/);
 assert.doesNotMatch(s,/\breserveLabClaim\s*\(/);
 assert.match(core,/consumeDockerHostChallenge\(/);
 assert.match(core,/verifyDockerReadOnlyHostEvidence\(/);
 assert.match(core,/verifyDockerStagingLifecyclePair\(/);
 assert.match(core,/publicKey\(hostPublic\)/);
 assert.match(s,/--attest-independent-witness/);
});
