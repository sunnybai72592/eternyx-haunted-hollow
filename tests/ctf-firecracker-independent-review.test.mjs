import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {
  createSignedOperatorEvidence,
} from "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {
  createIndependentReview,verifyIndependentReview,requiredReviewArtifacts,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const reviewedAt="2026-11-23T20:00:00.000Z";
const capturedAt="2026-11-22T20:00:00.000Z";
const ACK="I_REVIEWED_INDEPENDENT_SOURCE_FILES";
function material(){
  const kp=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:kp.privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicKeyPem:kp.publicKey.export({format:"pem",type:"spki"}).toString(),
    trustedPublicFingerprint:createHash("sha256").update(
      kp.publicKey.export({format:"der",type:"spki"})).digest("hex"),
  };
}
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function signedOperator(mode,operator=material()){
  const guest=mode.includes("guest"),expiry=mode.includes("watchdog");
  const result={
    sessionId,unit:supervisedVmUnit(sessionId),
    accepted:true,teardownVerified:true,bootApiAccepted:true,
    offlineNetnsAttested:true,localKvmGuestObserved:true,
    independentDeadlineSeconds:900,publicLabsEnabled:false,
    cloudProvisioningAllowed:false,providerHardLimitVerified:false,
    ...(guest?{guestServiceFunctional:true,
      guestChallengeResponseVerified:true}:{}),
    ...(expiry?{full900SecondExpiryObserved:true,
      systemdTimeoutResultVerified:true,noCgroupDescendants:true}:{}),
  };
  return createSignedOperatorEvidence({
    config,result,mode,capturedAt,
    privateKeyPem:operator.privateKeyPem,
    publicKeyPem:operator.publicKeyPem,
    trustedPublicFingerprint:operator.trustedPublicFingerprint,
  });
}
function sampleArtifacts(mode){
  return Object.fromEntries(requiredReviewArtifacts(mode).map(name=>[
    name,Buffer.from("OFFLINE TEST FIXTURE ONLY: "+sessionId+" "+name+"\n","utf8"),
  ]));
}
function fixture(mode="guest-and-watchdog"){
  const operator=material(),reviewer=material();
  return {
    operatorReport:signedOperator(mode,operator),
    operatorPublicPem:operator.publicKeyPem,
    operatorFingerprint:operator.trustedPublicFingerprint,
    reviewerPrivatePem:reviewer.privateKeyPem,
    reviewerPublicPem:reviewer.publicKeyPem,
    reviewerFingerprint:reviewer.trustedPublicFingerprint,
    reviewerAck:ACK,
    reviewedAt,artifacts:sampleArtifacts(mode),
  };
}
const copy=x=>JSON.parse(JSON.stringify(x));
const verifyArgs=({reviewerPrivatePem,reviewerAck,reviewedAt,...rest},report)=>
  ({...rest,report});

test("guest, watchdog and combined operator records require exact review source sets",()=>{
  const expectations={
    "guest-vsock":["guest-challenge.txt"],
    "watchdog-900":["timeout-result.txt"],
    "guest-and-watchdog":["guest-challenge.txt","timeout-result.txt"],
  };
  for(const [mode,extra] of Object.entries(expectations)){
    const f=fixture(mode);
    const report=createIndependentReview(f);
    assert.deepEqual(report.statement.artifactDigests.map(x=>x.name),
      ["host-preflight.json","image-provenance.json",
        "supervisor-journal.txt","cgroup-death.txt",...extra]);
    const verified=verifyIndependentReview(verifyArgs(f,report));
    assert.equal(verified.operatorSignatureVerified,true);
    assert.equal(verified.reviewerSignatureVerified,true);
    assert.equal(verified.sourceFileDigestsVerified,true);
    assert.equal(verified.physicalHostAttested,false);
    assert.equal(verified.independentSourceAuthenticityVerified,false);
    assert.equal(verified.productionReady,false);
    assert.equal(verified.publicLabsEnabled,false);
  }
});
test("second signer must be independently pinned and distinct from operator",()=>{
  const f=fixture("guest-vsock");
  assert.throws(()=>createIndependentReview({
    ...f,reviewerFingerprint:f.operatorFingerprint,
  }),/distinct externally pinned|own hardware claims/);
  assert.throws(()=>createIndependentReview({
    ...f,reviewerPublicPem:f.operatorPublicPem,
  }),/distinct externally pinned/);
  assert.throws(()=>createIndependentReview({
    ...f,reviewerPrivatePem:f.operatorReport,
  }));
  assert.throws(()=>createIndependentReview({
    ...f,reviewerAck:"sure",
  }),/manual acknowledgment/);
});
test("no missing, extra, empty or overly large source passes",()=>{
  const mode="guest-and-watchdog";
  const f=fixture(mode);
  for(const change of [
    x=>delete x["timeout-result.txt"],
    x=>x["bonus.txt"]=Buffer.from("unexpected"),
    x=>x["cgroup-death.txt"]=Buffer.alloc(0),
    x=>x["supervisor-journal.txt"]=Buffer.alloc(128*1024+1),
    x=>x["host-preflight.json"]="unsafe string",
  ]){
    const artifacts={...f.artifacts};
    change(artifacts);
    assert.throws(()=>createIndependentReview({...f,artifacts}),
      /Missing or unexpected|length or binary/);
  }
});
test("signature binds exact case, source bytes and operator receipt",()=>{
  const f=fixture();
  const report=createIndependentReview(f);
  for(const change of [
    r=>r.statement.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    r=>r.statement.mode="guest-vsock",
    r=>r.statement.artifactDigests[0].sha256="e".repeat(64),
    r=>r.statement.artifactDigests[0].bytes=700,
    r=>r.statement.claims.productionReady=true,
    r=>r.statement.claims.hostMeasurementVerified=true,
    r=>r.statement.claims.systemdExpiryIndependentlyVerified=true,
    r=>r.statement.claims.publicLabsEnabled=true,
    r=>r.statement.operatorReceiptSha256="e".repeat(64),
    r=>r.statement.extra="unsupported",
    r=>r.reviewerSignature="A".repeat(86),
  ]){
    const bad=copy(report);change(bad);
    assert.throws(()=>verifyIndependentReview(verifyArgs(f,bad)));
  }
  const tamperedFiles={...f.artifacts,
    "supervisor-journal.txt":Buffer.from("changed by operator")};
  assert.throws(()=>verifyIndependentReview(
    {...verifyArgs(f,report),artifacts:tamperedFiles}),/differs/);
  const otherOperator=signedOperator("guest-and-watchdog",material());
  assert.throws(()=>verifyIndependentReview({
    ...verifyArgs(f,report),operatorReport:otherOperator,
  }));
});
test("wrong pinned public fingerprint and stolen reviewer key are rejected",()=>{
  const f=fixture();
  const report=createIndependentReview(f);
  const other=material();
  assert.throws(()=>verifyIndependentReview({
    ...verifyArgs(f,report),reviewerPublicPem:other.publicKeyPem,
  }),/independently pinned/);
  assert.throws(()=>verifyIndependentReview({
    ...verifyArgs(f,report),reviewerFingerprint:other.trustedPublicFingerprint,
  }));
  assert.throws(()=>verifyIndependentReview({
    ...verifyArgs(f,report),operatorFingerprint:other.trustedPublicFingerprint,
  }));
  const bad=copy(report);
  bad.statement.reviewerSignerFingerprint=f.operatorFingerprint;
  assert.throws(()=>verifyIndependentReview(verifyArgs(f,bad)));
});
test("time correlation prevents endorsing evidence before it exists",()=>{
  const f=fixture();
  for(const at of [
    "2026-11-21T00:00:00.000Z","2026-12-31T23:59:00.000Z",
    "not-a-date",
  ]){
    assert.throws(()=>createIndependentReview({...f,reviewedAt:at}));
  }
  assert.equal(createIndependentReview(f).statement.reviewedAt,reviewedAt);
});
test("CLI keeps endorsement manual and zero-network with fixed case paths",async()=>{
  const script=new URL("../scripts/cyber-range-independent-review.mjs",import.meta.url);
  const denied=spawnSync(process.execPath,[script.pathname,
    "--endorse","--confirm-independent-review",
    "--session",sessionId,
    "--operator-sha","a".repeat(64),
    "--reviewer-sha","b".repeat(64),
  ],{encoding:"utf8",env:{PATH:process.env.PATH}});
  assert.equal(denied.status,1);
  assert.match(denied.stderr,/Offline case review refused/);
  const [cli,engine,workflow]=await Promise.all([
    readFile(script,"utf8"),
    readFile(new URL(
      "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(cli,/--inspect/);
  assert.match(cli,/--endorse/);
  assert.match(cli,/--verify/);
  assert.match(cli,/ETERNYX_INDEPENDENT_REVIEW_ACK/);
  assert.match(workflow,/ctf-firecracker-independent-review.test.mjs/);
  assert.doesNotMatch(cli,/createServer|child_process|fetch\(|https?:\/\/|cloudProvisioningAllowed:true/);
  assert.doesNotMatch(engine,/createServer|fetch\(|cloudProvisioningAllowed:true/);
});
