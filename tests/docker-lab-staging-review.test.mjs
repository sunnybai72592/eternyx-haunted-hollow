import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {buildDockerOwnerClaimExport,validateOwnerClaimExport}
  from "../src/lib/dockerLabOwnerExport.mjs";
import {reviewLocalClaimAgainstOwnerExport}
  from "../src/lib/dockerLabEvidenceReview.mjs";
import {fingerprintLabContainer,compareLabContainerDrift}
  from "../src/lib/dockerLabPolicyDrift.mjs";
import {reserveLabClaim,appendLabEvent}
  from "../src/lib/dockerLabRecovery.mjs";
import {signLabAudit} from "../src/lib/dockerLabAttestation.mjs";
const AGENT="33333333-3333-4333-8333-333333333333";
const CLAIM="44444444-4444-4444-8444-444444444444";
const REQUEST="22222222-2222-4222-8222-222222222222";
const ID="a".repeat(64);
const observedAt="2026-11-22T20:00:00.000Z";
function ownerRecord(status="reported_completed"){
 return {id:REQUEST,dispatch_claim_id:CLAIM,agent_id:AGENT,
  operation:"stop",container_id:ID,execution_status:status,
  dispatch_claimed_at:observedAt,
  dispatch_reported_at:status.startsWith("reported_")?observedAt:null};
}
const exportOwner=(row=ownerRecord())=>buildDockerOwnerClaimExport([row],observedAt,Date.parse(observedAt)+1000);
function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),"eternyx-lab-review-"));
 const privateKey=join(dir,"agent.pem"),pinned=join(dir,"agent.pub");
 const pair=generateKeyPairSync("ed25519");
 writeFileSync(privateKey,pair.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
 writeFileSync(pinned,pair.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"),{mode:0o600});
 try{return fn({dir,privateKey,pinned});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
function claim(dir,outcome="completed",acknowledged=true){
 reserveLabClaim({claimId:CLAIM,agentId:AGENT,operation:"stop",containerId:ID},dir);
 appendLabEvent(CLAIM,"attempted",dir);
 appendLabEvent(CLAIM,outcome,dir);
 if(acknowledged)appendLabEvent(CLAIM,"receipt_accepted",dir);
}
function inspect(){
 return {Id:ID,Image:"sha256:"+"1".repeat(64),Mounts:[],
  Config:{Image:"busybox@sha256:"+"f".repeat(64),User:"10001:10001",Labels:{
   "io.eternyx.operator.managed":"true","io.eternyx.operator.scope":"local-workbench"}},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",Binds:[],
   PortBindings:{},CapAdd:[],CapDrop:["ALL"],Devices:[],DeviceRequests:[],
   SecurityOpt:["no-new-privileges"],PidsLimit:64,Memory:134217728,RestartPolicy:{Name:"no"}}};
}
test("owner export strips unrelated metadata, is bounded and explicitly unauthenticated",()=>{
 const record={...ownerRecord(),privateToken:"SHOULD_NOT_EXPORT",debug:{secret:"SECRET"}};
 const snapshot=exportOwner(record);
 assert.equal(validateOwnerClaimExport(snapshot).requests.length,1);
 assert.equal(snapshot.authenticity,"unverified-browser-export");
 assert.doesNotMatch(JSON.stringify(snapshot),/privateToken|SHOULD_NOT_EXPORT|SECRET/);
 assert.equal(snapshot.requests[0].claimId,CLAIM);
 assert.throws(()=>buildDockerOwnerClaimExport(Array(31).fill(record),observedAt));
 assert.throws(()=>validateOwnerClaimExport({...snapshot,secret:"unknown"}));
 assert.throws(()=>validateOwnerClaimExport({...snapshot,requests:[snapshot.requests[0],snapshot.requests[0]]}),/Duplicate/);
});
test("owner-signed receipt and matching local journal still require signed pinned audit for no-attention comparison",()=>{
 fixture(({dir,privateKey,pinned})=>{
  claim(dir);
  const owner=exportOwner();
  const unsigned=reviewLocalClaimAgainstOwnerExport(owner,CLAIM,{journalDir:dir});
  assert.equal(unsigned.status,"consistent_agent_assertions");
  assert.equal(unsigned.attentionRequired,true);
  assert.equal(unsigned.serverExportVerified,false);
  const audit=signLabAudit(CLAIM,privateKey,dir);
  const verified=reviewLocalClaimAgainstOwnerExport(owner,CLAIM,{
   journalDir:dir,signedAudit:audit,pinnedAgentPublicKey:pinned});
  assert.equal(verified.status,"consistent_agent_assertions");
  assert.equal(verified.attentionRequired,false);
  assert.equal(verified.signedLocalProofVerified,true);
  assert.equal(verified.remoteOperationVerified,false);
 });
});
test("mismatch, missing journal, missing receipt and false owner success remain attention required",()=>{
 fixture(({dir,privateKey,pinned})=>{
  const owner=exportOwner();
  assert.equal(reviewLocalClaimAgainstOwnerExport(owner,CLAIM,{journalDir:dir}).status,
   "local_journal_missing_or_invalid");
  claim(dir,"failed",false);
  const result=reviewLocalClaimAgainstOwnerExport(owner,CLAIM,{journalDir:dir});
  assert.equal(result.status,"manual_investigation_required");
  assert.ok(result.findings.includes("agent_report_vs_local_outcome_mismatch"));
  assert.ok(result.findings.includes("server_reported_but_local_ack_missing"));
  const audit=signLabAudit(CLAIM,privateKey,dir);
  const row=exportOwner({...ownerRecord("claimed"),container_id:"b".repeat(64)});
  const bad=reviewLocalClaimAgainstOwnerExport(row,CLAIM,{
    journalDir:dir,signedAudit:audit,pinnedAgentPublicKey:pinned,now:Date.parse(observedAt)+301000});
  assert.equal(bad.attentionRequired,true);
  assert.ok(bad.findings.includes("container_identity_mismatch"));
  assert.ok(bad.findings.includes("claim_older_than_receipt_window"));
  assert.equal(reviewLocalClaimAgainstOwnerExport(owner,"77777777-7777-4777-8777-777777777777",{journalDir:dir}).status,
   "not_in_bounded_export");
 });
});
test("invalid, forged or unrelated pinned signatures cannot clear attention flag",()=>{
 fixture(({dir,privateKey,pinned})=>{
  claim(dir);
  const proof=signLabAudit(CLAIM,privateKey,dir);
  const altered={...proof,signature:"A".repeat(86)};
  const result=reviewLocalClaimAgainstOwnerExport(exportOwner(),CLAIM,{
   journalDir:dir,signedAudit:altered,pinnedAgentPublicKey:pinned});
  assert.equal(result.attentionRequired,true);
  assert.ok(result.findings.includes("local_audit_signature_invalid"));
  assert.throws(()=>reviewLocalClaimAgainstOwnerExport(exportOwner(),CLAIM,{journalDir:dir,signedAudit:proof}));
 });
});
test("pinned baseline policy digest detects changed resource limits and unsafe Docker targets",()=>{
 const baseline=inspect(),pin=fingerprintLabContainer(baseline,ID);
 assert.equal(pin.policyChecksPassed,true);
 assert.equal(pin.executionAuthorized,false);
 const same=compareLabContainerDrift(baseline,structuredClone(baseline),ID,pin.policySha256);
 assert.equal(same.driftDetected,false);
 assert.equal(same.realDockerEngineChecked,false);
 const changed=structuredClone(baseline);
 changed.HostConfig.Memory=268435456;
 const drift=compareLabContainerDrift(baseline,changed,ID,pin.policySha256);
 assert.equal(drift.driftDetected,true);
 assert.ok(drift.changedFields.includes("memoryBytes"));
 assert.equal(drift.attentionRequired,true);
 const unsafe=structuredClone(baseline);
 unsafe.HostConfig.NetworkMode="host";
 assert.equal(compareLabContainerDrift(baseline,unsafe,ID,pin.policySha256).status,
  "unsafe_or_invalid_current_capture");
 assert.throws(()=>compareLabContainerDrift(baseline,changed,ID,"b".repeat(64)),/pinned/);
 assert.throws(()=>fingerprintLabContainer(unsafe,ID));
});
test("staging review CLI performs real local reconciliation, fingerprint and drift in separate subprocesses",()=>{
 fixture(({dir,privateKey,pinned})=>{
  claim(dir);
  const ownerPath=join(dir,"owner.json"),proofPath=join(dir,"proof.json");
  const baselinePath=join(dir,"baseline.json"),currentPath=join(dir,"current.json");
  writeFileSync(ownerPath,JSON.stringify(exportOwner()),{mode:0o600});
  writeFileSync(proofPath,JSON.stringify(signLabAudit(CLAIM,privateKey,dir)),{mode:0o600});
  writeFileSync(baselinePath,JSON.stringify(inspect()),{mode:0o600});
  writeFileSync(currentPath,JSON.stringify(inspect()),{mode:0o600});
  const cli=fileURLToPath(new URL("../scripts/docker-lab-review.mjs",import.meta.url));
  const exec=args=>spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:12000,
   env:{...process.env,DOCKER_HOST:"",DOCKER_CONTEXT:"",DOCKER_CONFIG:""}});
  const reconciled=exec(["reconcile",ownerPath,CLAIM,"--journal-dir",dir,
    "--audit-proof",proofPath,"--pinned-agent-key",pinned]);
  assert.equal(reconciled.status,0,reconciled.stderr);
  assert.equal(JSON.parse(reconciled.stdout).signedLocalProofVerified,true);
  const without=exec(["reconcile",ownerPath,CLAIM,"--journal-dir",dir]);
  assert.equal(without.status,1);
  const fingerprint=exec(["fingerprint",baselinePath,ID]);
  assert.equal(fingerprint.status,0,fingerprint.stderr);
  const hash=JSON.parse(fingerprint.stdout).policySha256;
  const same=exec(["drift",baselinePath,currentPath,ID,hash]);
  assert.equal(same.status,0,same.stderr);
  const bad=inspect();bad.HostConfig.Privileged=true;
  writeFileSync(currentPath,JSON.stringify(bad),{mode:0o600});
  const rejected=exec(["drift",baselinePath,currentPath,ID,hash]);
  assert.equal(rejected.status,1);
  const output=JSON.parse(rejected.stdout);
  assert.equal(output.executionAuthorized,false);
  assert.equal(output.driftDetected,true);
 });
});
test("offline acceptance never claims host, RLS or real staging checks were performed",()=>{
 const source=readFileSync(new URL("../scripts/docker-lab-review.mjs",import.meta.url),"utf8");
 assert.match(source,/stagedDatabaseTested:false/);
 assert.match(source,/realDockerInspected:false/);
 assert.match(source,/hostOwnershipAttested:false/);
 assert.match(source,/executionAuthorized:false/);
 assert.doesNotMatch(source,/docker\.sock|fetch\(|spawnSync|Deno\.Command|execSync/);
});
test("browser owner export button is authenticated and contains no secret-bearing fields",()=>{
 const ui=readFileSync(new URL("../src/pages/DockerControlReview.tsx",import.meta.url),"utf8");
 assert.match(ui,/buildDockerOwnerClaimExport\(requests,observedAt\)/);
 assert.match(ui,/!user\?\.id\|\|!loaded\|\|!observedAt/);
 assert.match(ui,/Export owner claim snapshot/);
 assert.doesNotMatch(ui,/service_role|docker\.sock/);
});
