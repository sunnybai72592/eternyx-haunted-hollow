import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync,chmodSync,symlinkSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {fingerprintLabContainer} from "../src/lib/dockerLabPolicyDrift.mjs";
import {evaluateSignedDockerHostReadOnly}
 from "../src/lib/dockerSignedHostReadOnlyPreflight.mjs";
import {
 signDockerReadOnlyHostReport,verifyDockerReadOnlyHostEvidence,
 loadHostEvidencePrivateKey,HOST_EVIDENCE_EXPECTED_KEYS
} from "../src/lib/dockerSignedHostEvidenceReview.mjs";

const hash=x=>createHash("sha256").update(x).digest("hex");
const C="rootless-review-phase39",HOST="unix:///run/user/1001/docker.sock";
const ID="a".repeat(64),IMAGE="f".repeat(64),CHALLENGE="b".repeat(64);
const DAEMON="rootless-reviewable-engine",daemonHash=hash("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+DAEMON);
const fixture=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-host-signed-review-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const target=()=>({
 Id:ID,Name:"/hidden-container",Image:"sha256:"+IMAGE,
 Config:{Image:"example.invalid/sandbox@sha256:"+IMAGE,User:"10001:10001",
  Env:["SECRET=DO_NOT_PRINT"],Labels:{"io.eternyx.operator.managed":"true",
   "io.eternyx.operator.scope":"local-workbench"}},
 HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
  Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],
  CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],
  Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"},
  PidMode:"",IpcMode:"",CgroupnsMode:"",UsernsMode:"",UTSMode:""},
 RestartCount:0,Mounts:[],NetworkSettings:{Networks:{none:{}},Ports:{}},
 State:{Running:true,Status:"running",
  StartedAt:"2026-11-23T11:00:00.000Z",FinishedAt:"0001-01-01T00:00:00Z",
  Pid:2345,ExitCode:0,Paused:false,Restarting:false,Dead:false}
});
function example(dir,now=new Date()){
 const t=target();
 const pins={context:C,host:HOST,socketPath:"/run/user/1001/docker.sock",
  daemonIdSha256:daemonHash,imageSha256:IMAGE,
  policySha256:fingerprintLabContainer(t,ID).policySha256};
 const info={ID:DAEMON,SecurityOptions:["name=rootless","name=seccomp,profile=builtin"],
  Swarm:{LocalNodeState:"inactive"}};
 const inventory=auditSignedAgentRecoveryDirectory(dir);
 const evaluated=evaluateSignedDockerHostReadOnly({
  pins,contextBefore:C,contextAfter:C,endpointBefore:HOST,endpointAfter:HOST,
  infoBefore:info,infoAfter:structuredClone(info),
  targetBefore:t,targetAfter:structuredClone(t),
  containerId:ID,operation:"stop",
  inventoryBefore:inventory,inventoryAfter:inventory,
  cli:{hashVerified:true,rootOwned:true,symlinkFree:true,sha256:"1".repeat(64)},
  config:{completeTreeVerified:true,rootOwned:true,onlyOneLocalContext:true,
   context:C,endpoint:HOST,sha256:"2".repeat(64)}
 });
 const report={...evaluated,inspectedAt:now.toISOString(),
  readOnlyHostEvidenceSha256:hash(
   "ETERNYX_DOCKER_HOST_READONLY_OUTPUT_V1\n"+evaluated.evidenceSha256)};
 const pair=generateKeyPairSync("ed25519");
 const pub=pair.publicKey.export({type:"spki",format:"der"}).subarray(12);
 const rawPub=pub.toString("base64url");
 const expected={
  operatorTargetSha256:report.operatorTargetSha256,
  approvedContextSha256:report.approvedContextSha256,
  approvedDaemonIdSha256:report.approvedDaemonIdSha256,
  approvedImageSha256:report.approvedImageSha256,
  approvedPolicySha256:report.approvedPolicySha256,
  approvedClientSha256:report.approvedClientSha256,
  approvedConfigManifestSha256:report.approvedConfigManifestSha256,
  observationOperation:"stop",challenge:CHALLENGE,
  publicKeySha256:hash(pub)
 };
 return {report,pair,rawPub,expected,now};
}
function signed(e){
 return signDockerReadOnlyHostReport(e.report,CHALLENGE,e.pair.privateKey,e.now);
}
function reviewed(e,bundle=signed(e),key=e.rawPub,expect=e.expected,when=e.now){
 return verifyDockerReadOnlyHostEvidence(bundle,key,expect,when);
}
test("authentic original Phase38 report signs through independent Ed25519 challenge and pinned expectations",()=>fixture(dir=>{
 const e=example(dir),b=signed(e),result=reviewed(e,b);
 assert.equal(result.signatureValid,true);
 assert.equal(result.originalEvidenceDigestValid,true);
 assert.equal(result.independentlyPinnedKeyMatched,true);
 assert.equal(result.independentChallengeMatched,true);
 assert.equal(result.independentlyPinnedHostPolicyMatched,true);
 assert.equal(result.observationFreshAtReview,true);
 assert.equal(result.reviewStatus,"attestor_signature_and_local_observations_only");
 for(const k of ["physicalHostIsolationIndependentlyProven",
  "rootlessEngineProvenByThirdParty","stagingMutationAuthorized",
  "productionDeploymentAuthorized","serverRevocationTested",
  "crashRecoveryTestedOnHost","dockerOperationExecuted","receiptAccepted"])
  assert.equal(result[k],false,k);
 assert.equal(result.operatorSignoffRequired,true);
 assert.equal(Object.isFrozen(b),true);
 assert.equal(Object.isFrozen(result),true);
 assert.doesNotMatch(JSON.stringify(b),/DO_NOT_PRINT|hidden-container|rootless-reviewable-engine|\/run\/user/);
 assert.doesNotMatch(JSON.stringify(result),/DO_NOT_PRINT|hidden-container|rootless-reviewable-engine/);
}));
test("wrong independent public key, challenge, target/policy/client/config/daemon hash or operation refuses",()=>fixture(dir=>{
 const e=example(dir),b=signed(e);
 const another=generateKeyPairSync("ed25519");
 const wrongKey=another.publicKey.export({type:"spki",format:"der"}).subarray(12).toString("base64url");
 assert.throws(()=>reviewed(e,b,wrongKey),/identity|signature/);
 for(const key of ["challenge","publicKeySha256",...HOST_EVIDENCE_EXPECTED_KEYS.slice(0,7),
  "observationOperation"]){
  const expected={...e.expected,[key]:key==="observationOperation"?"start":"c".repeat(64)};
  assert.throws(()=>reviewed(e,b,e.rawPub,expected),undefined,key);
 }
 const wrongChallenge={...b,challenge:"c".repeat(64)};
 assert.throws(()=>reviewed(e,wrongChallenge),/challenge/);
}));
test("modified signed observation, digest, flags, status, dates or unknown fields refuse",()=>fixture(dir=>{
 const e=example(dir),b=signed(e);
 const wrong=[
  {report:{...b.report,approvedPolicySha256:"c".repeat(64)}},
  {report:{...b.report,evidenceSha256:"d".repeat(64)}},
  {report:{...b.report,productionDeploymentAuthorized:true}},
  {report:{...b.report,independentPhysicalIsolationVerified:true}},
  {report:{...b.report,operatorSignoffRequired:false}},
  {report:{...b.report,receiptIssued:true}},
  {report:{...b.report,observedTargetStatus:"paused"}},
  {report:{...b.report,reportedDockerLogs:"secret"}},
  {report:{...b.report,inspectedAt:"1980-01-01T00:00:00.000Z"}},
  {report:{...b.report,inspectedAt:"not a date"}},
  {issuedAt:"not a date"},
  {issuedAt:"1980-01-01T00:00:00.000Z"},
  {signature:"x"},
  {schema:"fake"},
  {extra:"injected"},
 ];
 for(const patch of wrong)assert.throws(()=>reviewed(e,{...b,...patch}),undefined,JSON.stringify(Object.keys(patch)));
}));
test("re-signed report still cannot change closed original preflight digest or approval state",()=>fixture(dir=>{
 const e=example(dir);
 for(const patch of [
  {productionDeploymentAuthorized:true},{receiptIssued:true},
  {operatorSignoffRequired:false},
  {approvedDaemonIdSha256:"b".repeat(64)},
  {evidenceSha256:"b".repeat(64)},
  {readOnlyHostEvidenceSha256:"b".repeat(64)},
  {extra:"operator can approve"}
 ]){
  assert.throws(()=>signDockerReadOnlyHostReport({
   ...e.report,...patch
  },CHALLENGE,e.pair.privateKey,e.now),undefined,JSON.stringify(patch));
 }
}));
test("15-minute replay window and 2-minute future skew are enforced against independent reviewer clock",()=>fixture(dir=>{
 const e=example(dir),bundle=signed(e);
 assert.equal(reviewed(e,bundle,e.rawPub,e.expected,new Date(e.now.valueOf()+14*60000)).signatureValid,true);
 assert.throws(()=>reviewed(e,bundle,e.rawPub,e.expected,new Date(e.now.valueOf()+16*60000)),/stale|expired/);
 assert.throws(()=>reviewed(e,bundle,e.rawPub,e.expected,new Date(e.now.valueOf()-3*60000)),/future/);
 assert.throws(()=>signDockerReadOnlyHostReport(e.report,CHALLENGE,e.pair.privateKey,
  new Date(e.now.valueOf()+61000)),/immediately/);
}));
test("attestor key must be owner-only, nonsymlinked and Ed25519, without leaking bytes",()=>fixture(dir=>{
 const e=example(dir);
 const path=join(dir,"attestor.der");
 const raw=e.pair.privateKey.export({type:"pkcs8",format:"der"});
 writeFileSync(path,raw,{mode:0o600});
 const loaded=loadHostEvidencePrivateKey(path);
 assert.equal(signDockerReadOnlyHostReport(e.report,CHALLENGE,loaded,e.now).signature,signed(e).signature);
 chmodSync(path,0o644);
 assert.throws(()=>loadHostEvidencePrivateKey(path),/owner-only/);
 chmodSync(path,0o600);
 const alias=join(dir,"attestor-alias");
 symlinkSync(path,alias);
 assert.throws(()=>loadHostEvidencePrivateKey(alias),/owner-only/);
 assert.throws(()=>loadHostEvidencePrivateKey("relative-key.der"));
}));
test("verifier CLI accepts only canonical independently pinned offline files",()=>fixture(dir=>{
 const e=example(dir),bundle=signed(e);
 const report=join(dir,"signed.json"),pub=join(dir,"reviewer.pub"),pin=join(dir,"expected.json");
 writeFileSync(report,JSON.stringify(bundle)+"\n",{mode:0o600});
 writeFileSync(pub,e.rawPub+"\n",{mode:0o600});
 writeFileSync(pin,JSON.stringify(e.expected)+"\n",{mode:0o600});
 const executable=new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url).pathname;
 const run=()=>spawnSync(process.execPath,[executable,report,pub,pin],{
  encoding:"utf8",timeout:5000,env:{...process.env,CI:"true",ETERNYX_REMOTE_LAB_ENABLED:""}
 });
 const ok=run();
 assert.equal(ok.status,0,ok.stderr);
 const parsed=JSON.parse(ok.stdout);
 assert.equal(parsed.signatureValid,true);
 assert.equal(parsed.stagingMutationAuthorized,false);
 writeFileSync(pin,JSON.stringify({...e.expected,approvedPolicySha256:"a".repeat(64)})+"\n");
 const denied=run();
 assert.notEqual(denied.status,0);
 assert.equal(denied.stdout,"");
 writeFileSync(pin,JSON.stringify(e.expected)+"\n");
 writeFileSync(report,'{"schema":"tampered"}\n');
 assert.notEqual(run().status,0);
}));
test("CLI refuses untrusted or symlinked reviewer pins and noncanonical duplicate-key JSON",()=>fixture(dir=>{
 const e=example(dir),b=signed(e);
 const report=join(dir,"evidence.json"),pub=join(dir,"trusted.pub"),pins=join(dir,"pins.json");
 writeFileSync(report,JSON.stringify(b)+"\n",{mode:0o600});
 writeFileSync(pub,e.rawPub+"\n",{mode:0o600});
 writeFileSync(pins,JSON.stringify(e.expected)+"\n",{mode:0o600});
 const tool=new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url).pathname;
 const run=p=>spawnSync(process.execPath,[tool,report,p,pins],{encoding:"utf8",timeout:5000});
 chmodSync(pub,0o644);
 assert.notEqual(run(pub).status,0);
 chmodSync(pub,0o600);
 symlinkSync(pub,join(dir,"symlink.pub"));
 assert.notEqual(run(join(dir,"symlink.pub")).status,0);
 writeFileSync(report,JSON.stringify(b).replace(
  '"schema":"eternyx-docker-host-preflight-signed-v1"',
  '"schema":"eternyx-docker-host-preflight-signed-v1","schema":"eternyx-docker-host-preflight-signed-v1"')+"\n");
 assert.notEqual(run(pub).status,0);
}));
test("real host CLI integrates challenge-bound signer *after* double observations, with no Docker mutation in verification",()=>{
 const preflight=readFileSync(new URL("../scripts/docker-lab-host-preflight.mjs",import.meta.url),"utf8");
 const review=readFileSync(new URL("../scripts/docker-lab-host-evidence-review.mjs",import.meta.url),"utf8");
 const args=preflight.indexOf('args[3]==="--sign-evidence"');
 const host=preflight.indexOf("const first=observe(pins,containerId)");
 const second=preflight.indexOf("const second=observe(pins,containerId)");
 const verified=preflight.indexOf("const report=evaluateSignedDockerHostReadOnly(");
 const attested=preflight.indexOf("signDockerReadOnlyHostReport(");
 const printed=preflight.indexOf("process.stdout.write(JSON.stringify(result)");
 assert.ok(args>0&&args<host&&host<second&&second<verified&&verified<attested&&attested<printed);
 assert.match(review,/verifyDockerReadOnlyHostEvidence\(signed,rawKey.trim\(\),expected\)/);
 for(const source of [preflight,review]){
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/\bappendLabEvent\s*\(/);
  assert.doesNotMatch(source,/\breserveLabClaim\s*\(/);
  assert.doesNotMatch(source,/\bunlockContainer\s*\(/);
 }
 assert.doesNotMatch(review,/spawnSync\s*\(/);
});
