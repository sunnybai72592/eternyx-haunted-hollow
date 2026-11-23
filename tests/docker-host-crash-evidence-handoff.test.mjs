import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {prepareDockerHostCrashHandoff,authorHostCrashEvidence,
 countersignHostCrashEvidence,verifyHostCrashEvidence}
 from "../src/lib/dockerHostCrashEvidenceHandoff.mjs";
const H=x=>x.repeat(64),C="c".repeat(40);
const CLAIM="44444444-4444-4444-8444-444444444444",AGENT="33333333-3333-4333-8333-333333333333";
const now=Date.parse("2026-11-23T16:30:00.000Z");
const pins=Object.freeze({
 approvedSourceCommitSha:C,daemonIdentitySha256:H("a"),
 socketEndpointSha256:H("b"),containerId:H("d"),imageSha256:H("e"),
 managedContainerPolicySha256:H("f"),routeSnapshotSha256:H("7")
});
const baseline=()=>({
 schema:"eternyx-docker-real-host-network-evidence-v1",
 scope:"operator_initiated_read_only_real_host",
 capturedAt:"2026-11-23T16:20:00.000Z",approvedSourceCommitSha:C,
 daemonIdentitySha256:pins.daemonIdentitySha256,
 socketEndpointSha256:pins.socketEndpointSha256,
 containerId:pins.containerId,imageSha256:pins.imageSha256,
 managedContainerPolicySha256:pins.managedContainerPolicySha256,
 routeSnapshotSha256:pins.routeSnapshotSha256,
 journalClaimsChecked:3,rootlessEngineObserved:true,noDefaultRoutesObserved:true,
 kernelForwardingDisabledObserved:true,stableRouteSnapshots:true,
 containerPolicyStableObserved:true,realDockerEngineReadOnlyContacted:true,
 independentOperatorSiteReviewRequired:true,
 hostNetworkReachabilityActivelyTested:false,externalNetworkIsolationProved:false,
 independentHostAttestation:false,controlledCrashRecoveryTestPerformed:false,
 remoteSignedDispatchTested:false,labContainerMutationPerformed:false,
 stagingDockerExecutionAuthorized:false,productionDeploymentAuthorized:false
});
const triage=()=>({
 schema:"eternyx-docker-host-crash-triage-v1",
 scope:"operator_initiated_local_unix_socket_read_only_crash_triage",
 observedAt:"2026-11-23T16:27:00.000Z",
 approvedSourceCommitSha:C,daemonIdentitySha256:pins.daemonIdentitySha256,
 socketEndpointSha256:pins.socketEndpointSha256,containerId:pins.containerId,
 imageSha256:pins.imageSha256,managedContainerPolicySha256:pins.managedContainerPolicySha256,
 stableHostRouteSnapshotSha256:pins.routeSnapshotSha256,
 claimId:CLAIM,agentId:AGENT,claimOperation:"stop",claimJournalStage:"attempted_outcome_unknown",
 attemptedRecorded:true,recordedOutcome:null,journalClaimsChecked:4,
 unresolvedClaimsObserved:true,pinnedRootlessEngineObserved:true,
 networkNoneObserved:true,stableDoubleInspectObserved:true,
 realDockerEngineReadOnlyContacted:true,kernelForwardingDisabledObserved:true,
 externalOperatorReviewRequired:true,independentOperatorReviewRequired:true,
 localMutationReexecuted:false,mutationOutcomeIndependentlyVerified:false,
 automaticRetryAuthorized:false,receiptOnlyReplayAuthorized:false,
 controlledCrashRecoveryTestPerformed:false,independentHostAttestation:false,
 externalNetworkIsolationProved:false,productionDeploymentAuthorized:false,
 stagingDockerExecutionAuthorized:false,actualCrashInjectedByThisCommand:false,
 operatorProcessClearanceIndependentlyVerified:false
});
const raw=o=>Buffer.from(JSON.stringify(o,null,2)+"\n");
const input=(b=baseline(),t=triage())=>({baselineBytes:raw(b),triageBytes:raw(t),pins,now});
const author=generateKeyPairSync("ed25519");
const reviewer=generateKeyPairSync("ed25519");
test("real report-shaped baseline and crash triage bind all pinned identities, routes, raw bytes and claim",()=>{
 const candidate=prepareDockerHostCrashHandoff(input());
 assert.equal(candidate.sourceCommitSha,C);
 assert.equal(candidate.claimId,CLAIM);
 assert.equal(candidate.claimStage,"attempted_outcome_unknown");
 assert.equal(candidate.automaticRetryAuthorized,false);
 assert.equal(candidate.actualCrashWitnessedByReview,false);
 assert.match(candidate.baselineFileSha256,/^[a-f0-9]{64}$/);
 assert.match(candidate.triageFileSha256,/^[a-f0-9]{64}$/);
});
test("two independent Ed25519 keys sign the SAME full candidate and verify original bytes",()=>{
 const files=input();
 const candidate=prepareDockerHostCrashHandoff(files);
 const authored=authorHostCrashEvidence(candidate,author.privateKey);
 const signed=countersignHostCrashEvidence(authored,reviewer.privateKey,author.publicKey);
 const result=verifyHostCrashEvidence({
  packageBytes:raw(signed),...files,
  authorPublicKey:author.publicKey,reviewerPublicKey:reviewer.publicKey
 });
 assert.equal(result.evidenceDigestsMatched,true);
 assert.equal(result.twoDistinctKeySignaturesVerified,true);
 assert.equal(result.physicalIsolationIndependentlyEstablished,false);
 assert.equal(result.realCrashInjectionIndependentlyWitnessed,false);
 assert.equal(result.productionDeploymentAuthorized,false);
});
test("same signer cannot approve own work",()=>{
 const signed=authorHostCrashEvidence(prepareDockerHostCrashHandoff(input()),author.privateKey);
 assert.throws(()=>countersignHostCrashEvidence(signed,author.privateKey,author.publicKey),/reuse author key/);
});
test("modified baseline bytes, triage bytes, identity pins or signatures are refused",()=>{
 const files=input(),a=authorHostCrashEvidence(prepareDockerHostCrashHandoff(files),author.privateKey);
 const s=countersignHostCrashEvidence(a,reviewer.privateKey,author.publicKey);
 for(const changed of [
  {baselineBytes:Buffer.concat([files.baselineBytes,Buffer.from(" ")])},
  {triageBytes:Buffer.concat([files.triageBytes,Buffer.from(" ")])},
  {pins:{...pins,daemonIdentitySha256:H("0")}},
  {packageBytes:raw({...s,authorSignature:"A".repeat(86)})},
  {reviewerPublicKey:author.publicKey}
 ]){
  assert.throws(()=>verifyHostCrashEvidence({
   packageBytes:raw(s),...files,authorPublicKey:author.publicKey,
   reviewerPublicKey:reviewer.publicKey,...changed
  }));
 }
});
test("baseline contradictions, wrong source, unsafe flags and stale evidence fail closed",()=>{
 const cases=[
  [()=>{const b=baseline();b.rootlessEngineObserved=false;return b;},triage()],
  [()=>{const b=baseline();b.productionDeploymentAuthorized=true;return b;},triage()],
  [()=>{const b=baseline();b.capturedAt="2026-11-21T16:20:00.000Z";return b;},triage()],
  [()=>{const b=baseline();b.approvedSourceCommitSha="0".repeat(40);return b;},triage()],
  [baseline(),(()=>{const t=triage();t.socketEndpointSha256=H("0");return t;})()],
  [baseline(),(()=>{const t=triage();t.automaticRetryAuthorized=true;return t;})()],
  [baseline(),(()=>{const t=triage();t.mutationOutcomeIndependentlyVerified=true;return t;})()],
  [baseline(),(()=>{const t=triage();t.journalClaimsChecked=3;return t;})()],
  [baseline(),(()=>{const t=triage();t.observedAt="2026-11-23T16:19:00.000Z";return t;})()],
  [baseline(),(()=>{const t=triage();t.stableHostRouteSnapshotSha256=H("1");return t;})()],
  [baseline(),(()=>{const t=triage();t.claimJournalStage="terminal_unacknowledged";return t;})()]
 ];
 for(const [b,t] of cases)assert.throws(()=>prepareDockerHostCrashHandoff(input(b,t)));
});
test("guard-denied terminal without attempted journal is supported without an execution claim",()=>{
 const t=triage();t.claimJournalStage="terminal_unacknowledged";
 t.recordedOutcome="guard_denied";t.attemptedRecorded=false;
 const c=prepareDockerHostCrashHandoff(input(baseline(),t));
 assert.equal(c.recordedOutcome,"guard_denied");
 assert.equal(c.claimResultIndependentlyVerified,false);
});
test("reviewer cannot sign a modified candidate or invalid author signature",()=>{
 const candidate=prepareDockerHostCrashHandoff(input());
 const a=authorHostCrashEvidence(candidate,author.privateKey);
 assert.throws(()=>countersignHostCrashEvidence({...a,candidate:{...candidate,claimId:AGENT}},
  reviewer.privateKey,author.publicKey));
 assert.throws(()=>countersignHostCrashEvidence({...a,authorSignature:"A".repeat(86)},
  reviewer.privateKey,author.publicKey));
});
test("CLI denies unapproved invocation before reading any report or signing keys",()=>{
 const script=fileURLToPath(new URL("../scripts/docker-host-crash-evidence-handoff.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[script,"author","/tmp/baseline","/tmp/triage","/tmp/key"],{
  encoding:"utf8",timeout:10000,
  env:{...process.env,ETERNYX_DOCKER_HOST_EVIDENCE_HANDOFF_APPROVAL:""}
 });
 assert.equal(r.status,1);assert.equal(r.stdout,"");
 assert.match(r.stderr,/Host crash evidence review refused/);
});
