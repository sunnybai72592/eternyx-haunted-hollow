import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim}
 from "../src/lib/dockerLabRecovery.mjs";
import {reconcileLiveStopCrashArtifacts,validateLiveStopForensicPins}
 from "../src/lib/dockerLiveStopForensics.mjs";
const hash=v=>createHash("sha256").update(v).digest("hex");
const pins=Object.freeze({
 originalSourceCommitSha:"a".repeat(40),currentReviewCommitSha:"b".repeat(40),
 daemonIdentitySha256:"c".repeat(64),socketEndpointSha256:"d".repeat(64),
 containerId:"e".repeat(64),imageSha256:"f".repeat(64),
 policySha256:"1".repeat(64),routeSnapshotSha256:"2".repeat(64),
 permitId:"33333333-3333-4333-8333-333333333333"
});
const agentId="44444444-4444-4444-8444-444444444444";
const claimId="55555555-5555-4555-8555-555555555555";
const now=Date.now();
const iso=ms=>new Date(now-ms).toISOString();
function good(){
 const runDir="/home/operator/private/eternyx-real-docker-stop-ABC123";
 const permit={
  schema:"eternyx-one-time-disposable-docker-stop-permit-v1",
  permitId:pins.permitId,containerId:pins.containerId,
  approvedCommit:pins.originalSourceCommitSha,runDir,
  agentId,claimId,usedAt:iso(120000)
 };
 const claim={agentId,claimId,operation:"stop",containerId:pins.containerId,
  events:["reserved","attempted"],outcome:null,attempted:true,
  acknowledged:false,attentionRequired:true};
 const hashes={
  permitRecordSha256:hash(JSON.stringify(permit)+"\n"),
  journalSha256:hash(JSON.stringify(claim)+"\n"),
  lockSha256:hash("durable-operator-lock")
 };
 const report={
  schema:"eternyx-docker-live-disposable-stop-worker-sigkill-v1",
  recordedAt:iso(60000),
  sourceCommitSha:pins.originalSourceCommitSha,
  containerId:pins.containerId,imageSha256:pins.imageSha256,
  daemonIdentitySha256:pins.daemonIdentitySha256,
  socketEndpointSha256:pins.socketEndpointSha256,
  policySha256:pins.policySha256,routeSnapshotSha256:pins.routeSnapshotSha256,
  permitId:pins.permitId,
  permitRecordSha256:hashes.permitRecordSha256,
  journalSha256:hashes.journalSha256,lockSha256:hashes.lockSha256,
  claimId,agentId,
  recordedAttemptedWithoutOutcome:true,workerSIGKILLObserved:true,
  stopCLIReportedReturn:true,realPinnedDockerContainerObservedExited:true,
  duplicateClaimDenied:true,staleLockPreserved:true,
  rootlessLiveHostInspectedBeforeAndAfter:true,
  rootlessHostPolicyAndRoutesStable:true,
  actualSignedAgentInterrupted:false,
  originalSignedDispatchTested:false,
  serverReceiptVerified:false,automaticRetryAuthorized:false,
  productionDeploymentAuthorized:false,stagingDockerExecutionAuthorized:false,
  independentHumanReviewRequired:true
 };
 return {report,permit,claim,hashes,pins,runDir,now};
}
test("one-time permit and unfinished real-stop claim correlate across separately pinned original/review commits",()=>{
 const evidence=reconcileLiveStopCrashArtifacts(good());
 assert.equal(evidence.status,"same_claim_evidence_correlated_unresolved");
 assert.equal(evidence.originalSourceCommitSha,pins.originalSourceCommitSha);
 assert.equal(evidence.currentReviewCommitSha,pins.currentReviewCommitSha);
 assert.equal(evidence.claimId,claimId);
 assert.equal(evidence.originalRawFilesMatched,true);
 assert.equal(evidence.originalStaleLockRetained,true);
 assert.equal(evidence.appendTerminalOutcomeAuthorized,false);
 assert.equal(evidence.receiptReplayAuthorized,false);
 assert.equal(evidence.automaticMutationRetryAuthorized,false);
 assert.equal(evidence.productionDeploymentAuthorized,false);
 assert.equal(evidence.independentDockerStopCausalityProven,false);
});
test("independent original and review commit pin syntax must remain exact",()=>{
 assert.throws(()=>validateLiveStopForensicPins({...pins,originalSourceCommitSha:"short"}));
 assert.throws(()=>validateLiveStopForensicPins({...pins,permitId:agentId.slice(1)}));
 assert.throws(()=>validateLiveStopForensicPins({...pins,routeSnapshotSha256:"0".repeat(63)}));
 assert.throws(()=>validateLiveStopForensicPins({...pins,extra:true}));
});
test("all original run identities, one-use permit, policy and state claims must match exact independent pins",()=>{
 const mutate=[
  x=>x.report.sourceCommitSha="0".repeat(40),
  x=>x.report.daemonIdentitySha256="0".repeat(64),
  x=>x.report.socketEndpointSha256="0".repeat(64),
  x=>x.report.imageSha256="0".repeat(64),
  x=>x.report.policySha256="0".repeat(64),
  x=>x.report.routeSnapshotSha256="0".repeat(64),
  x=>x.report.permitId="66666666-6666-4666-8666-666666666666",
  x=>x.report.claimId="66666666-6666-4666-8666-666666666666",
  x=>x.report.agentId="66666666-6666-4666-8666-666666666666",
  x=>x.report.productionDeploymentAuthorized=true,
  x=>x.report.automaticRetryAuthorized=true,
  x=>x.report.originalSignedDispatchTested=true,
  x=>x.report.recordedAttemptedWithoutOutcome=false,
  x=>x.report.rootlessLiveHostInspectedBeforeAndAfter=false,
  x=>x.report.workerSIGKILLObserved=false,
  x=>x.report.serverReceiptVerified=true,
  x=>x.report.extraUndocumentedSuccess=true,
  x=>x.permit.approvedCommit="0".repeat(40),
  x=>x.permit.runDir="/tmp/other",
  x=>x.permit.agentId="66666666-6666-4666-8666-666666666666",
  x=>x.permit.claimId="66666666-6666-4666-8666-666666666666",
  x=>x.permit.extraApproval=true,
  x=>x.hashes.journalSha256="0".repeat(64),
  x=>x.hashes.lockSha256="0".repeat(64),
  x=>x.hashes.permitRecordSha256="0".repeat(64),
  x=>x.claim.operation="restart",
  x=>x.claim.attempted=false,
  x=>x.claim.outcome="completed",
  x=>x.claim.acknowledged=true,
  x=>x.claim.attentionRequired=false,
  x=>x.claim.events=["reserved","attempted","completed"],
  x=>x.claim.extraOutcome=true
 ];
 for(let i=0;i<mutate.length;i++){
  const args=structuredClone(good());mutate[i](args);
  assert.throws(()=>reconcileLiveStopCrashArtifacts(args),undefined,
   "unexpectedly admitted changed forensic evidence variant "+i);
 }
});
test("stale report, future report, postdated permit and old permit are rejected",()=>{
 for(const mutate of [
  x=>x.report.recordedAt="2020-01-01T00:00:00.000Z",
  x=>x.report.recordedAt=new Date(now+900000).toISOString(),
  x=>x.report.recordedAt="2026-11-23",
  x=>x.permit.usedAt=new Date(now-10000).toISOString(),
  x=>x.permit.usedAt="2020-01-01T00:00:00.000Z"
 ]){
  const args=structuredClone(good());mutate(args);
  assert.throws(()=>reconcileLiveStopCrashArtifacts(args));
 }
});
test("real production journal writer creates an unresolved fsynced claim and retained lock, which matches forensic contract",()=>{
 if(process.platform==="win32")return;
 const root=mkdtempSync(join(tmpdir(),"eternyx-docker-review-journal-"));
 try{
  const a=randomUUID(),c=randomUUID();
  lockLabAgent(a,root);
  reserveLabClaim({agentId:a,claimId:c,operation:"stop",containerId:pins.containerId},root);
  appendLabEvent(c,"attempted",root);
  const record=readLabClaim(c,root);
  assert.deepEqual(record.events,["reserved","attempted"]);
  const args=good();args.claim=record;
  args.report.claimId=c;args.report.agentId=a;
  args.permit.claimId=c;args.permit.agentId=a;
  args.hashes.journalSha256=hash(readFileSync(join(root,"claim-"+c+".jsonl")));
  args.hashes.lockSha256=hash(readFileSync(join(root,"agent-"+a+".lock")));
  args.hashes.permitRecordSha256=hash(JSON.stringify(args.permit)+"\n");
  args.report.journalSha256=args.hashes.journalSha256;
  args.report.lockSha256=args.hashes.lockSha256;
  args.report.permitRecordSha256=args.hashes.permitRecordSha256;
  const review=reconcileLiveStopCrashArtifacts(args);
  assert.equal(review.originalAttemptedJournalStillUnresolved,true);
  assert.equal(review.clearStaleLockAuthorized,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("operator-only retrospective CLI refuses without independent approval and cannot contact Docker",()=>{
 const script=fileURLToPath(new URL("../scripts/docker-host-live-stop-forensics.mjs",import.meta.url));
 const run=spawnSync(process.execPath,[script,"--review","/tmp/not-approved"],{
  encoding:"utf8",timeout:12000,
  env:{...process.env,ETERNYX_DOCKER_LIVE_STOP_FORENSIC_APPROVAL:""}
 });
 assert.equal(run.status,1);
 assert.equal(run.stdout,"");
 assert.match(run.stderr,/Read-only live Docker stop forensics refused/);
});
test("retrospective review uses only literal Docker inspect and existing read-only host script",()=>{
 const script=readFileSync(new URL("../scripts/docker-host-live-stop-forensics.mjs",import.meta.url),"utf8");
 assert.match(script,/docker-host-network-evidence\.mjs/);
 assert.match(script,/validateLiveStopNoDrift\(beforeHost,afterHost\)/);
 assert.match(script,/validateLiveStopContainer\(o,/);
 assert.match(script,/originalStopAttributionIndependentlyVerified:false/);
 assert.doesNotMatch(script,/["']container["']\s*,\s*["'](?:stop|start|restart|exec)["']/);
 assert.doesNotMatch(script,/["']receipt_accepted["']|["']completed["']|["']guard_denied["']/);
});
