import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
  DISPOSITION_ACK,DISPOSITION_REASONS,DISPOSITION_STATUSES,
  createSignedReviewDisposition,verifySignedReviewDisposition,
} from "../infrastructure/cyber-range/provider/firecracker-review-disposition.mjs";
import {
  createIndependentReview,requiredReviewArtifacts,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {createSignedOperatorEvidence} from
  "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const capturedAt="2026-11-22T20:00:00.000Z";
const reviewedAt="2026-11-23T20:00:00.000Z";
const decidedAt="2026-11-23T21:00:00.000Z";
const altSession="c726a7dc-4e18-4113-bf51-d7147c581002";
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function keys(){
  const key=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:key.privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicKeyPem:key.publicKey.export({format:"pem",type:"spki"}).toString(),
    fingerprint:createHash("sha256").update(key.publicKey.export({
      format:"der",type:"spki",
    })).digest("hex"),
  };
}
function fixture(mode="guest-and-watchdog"){
  const operator=keys(),reviewer=keys();
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
  const operatorReport=createSignedOperatorEvidence({
    config,result,mode,capturedAt,
    privateKeyPem:operator.privateKeyPem,
    publicKeyPem:operator.publicKeyPem,
    trustedPublicFingerprint:operator.fingerprint,
  });
  const artifacts=Object.fromEntries(requiredReviewArtifacts(mode).map(
    name=>[name,Buffer.from("LOCAL OFFLINE TEST DATA: "+name+"\n")]));
  const reviewArgs={
    operatorReport,operatorPublicPem:operator.publicKeyPem,
    operatorFingerprint:operator.fingerprint,
    reviewerPrivatePem:reviewer.privateKeyPem,
    reviewerPublicPem:reviewer.publicKeyPem,
    reviewerFingerprint:reviewer.fingerprint,
    artifacts,
  };
  const reviewReport=createIndependentReview({
    ...reviewArgs,reviewerAck:"I_REVIEWED_INDEPENDENT_SOURCE_FILES",
    reviewedAt,
  });
  return {...reviewArgs,reviewReport};
}
const clone=x=>JSON.parse(JSON.stringify(x));
function signed(f,decision="reviewed-for-archival",reasons=[]){
  return createSignedReviewDisposition({
    ...f,decision,reasons,decidedAt,acknowledgment:DISPOSITION_ACK,
  });
}
function verifier(f,report){
  const {reviewerPrivatePem,...rest}=f;
  return {...rest,report};
}
test("all modes and three constrained decisions bind signatures and reviewed sources",()=>{
  for(const mode of ["guest-vsock","watchdog-900","guest-and-watchdog"]){
    for(const decision of DISPOSITION_STATUSES){
      const f=fixture(mode);
      const reasons=decision==="reviewed-for-archival"?[]:[
        "independent-host-source-not-established",
      ];
      const report=signed(f,decision,reasons);
      const verified=verifySignedReviewDisposition(verifier(f,report));
      assert.equal(verified.sessionId,sessionId);
      assert.equal(verified.mode,mode);
      assert.equal(verified.decision,decision);
      assert.deepEqual(verified.reasons,reasons);
      assert.equal(verified.operatorSignatureVerified,true);
      assert.equal(verified.reviewerSignatureVerified,true);
      assert.equal(verified.reviewerDispositionSignatureVerified,true);
      assert.equal(verified.boundToExactReviewedFiles,true);
      assert.equal(verified.physicalHostAttested,false);
      assert.equal(verified.independentHostEvidenceVerified,false);
      assert.equal(verified.publicLabsEnabled,false);
      assert.equal(verified.productionReady,false);
    }
  }
});
test("explicit manual acknowledgment and independently pinned reviewer key required",()=>{
  const f=fixture();
  assert.throws(()=>createSignedReviewDisposition({
    ...f,decision:"reviewed-for-archival",decidedAt,
  }),/manual/);
  assert.throws(()=>createSignedReviewDisposition({
    ...f,decision:"reviewed-for-archival",decidedAt,
    acknowledgment:DISPOSITION_ACK,
    reviewerPrivatePem:keys().privateKeyPem,
  }),/not pinned/);
  assert.throws(()=>createSignedReviewDisposition({
    ...f,decision:"reviewed-for-archival",decidedAt,
    acknowledgment:DISPOSITION_ACK,
    reviewerFingerprint:f.operatorFingerprint,
  }));
});
test("status and controlled reason policy fails closed",()=>{
  const f=fixture();
  for(const [decision,reasons] of [
    ["approve-public-labs",[]],
    ["reviewed-for-archival",["human-log-inspection-incomplete"]],
    ["follow-up-required",[]],
    ["evidence-rejected",[]],
    ["follow-up-required",["unlisted-risk"]],
    ["evidence-rejected",["other-documented-in-private-case",
      "other-documented-in-private-case"]],
    ["evidence-rejected",["other-documented-in-private-case",
      "image-origin-not-independently-established"]],
    ["evidence-rejected",["other-documented-in-private-case",1]],
    ["evidence-rejected",Array(100).fill("human-log-inspection-incomplete")],
  ]){
    assert.throws(()=>signed(f,decision,reasons));
  }
  assert.ok(DISPOSITION_REASONS.includes("human-log-inspection-incomplete"));
});
test("signed fields, public-readiness flags and reason list cannot be altered",()=>{
  const f=fixture();
  const report=signed(f,"follow-up-required",[
    "guest-identity-not-cryptographically-proven",
    "human-log-inspection-incomplete",
  ]);
  for(const modify of [
    r=>r.statement.decision="reviewed-for-archival",
    r=>r.statement.reasons=[],
    r=>r.statement.reasons[0]="other-documented-in-private-case",
    r=>r.statement.sessionId=altSession,
    r=>r.statement.mode="guest-vsock",
    r=>r.statement.operatorReceiptSha256="d".repeat(64),
    r=>r.statement.reviewReceiptSha256="d".repeat(64),
    r=>r.statement.operatorSignerFingerprint="d".repeat(64),
    r=>r.statement.reviewerSignerFingerprint="d".repeat(64),
    r=>r.statement.claims.productionReady=true,
    r=>r.statement.claims.publicLabsEnabled=true,
    r=>r.statement.claims.hardwareAttested=true,
    r=>r.statement.claims.independentHostEvidenceVerified=true,
    r=>r.statement.claims.unexpected=true,
    r=>r.statement.unexpected=true,
    r=>r.signature="A".repeat(86),
    r=>r.unexpected=true,
  ]){
    const altered=clone(report);modify(altered);
    assert.throws(()=>verifySignedReviewDisposition(verifier(f,altered)));
  }
});
test("changed operator receipt, earlier reviewer record, source files and signer fail",()=>{
  const f=fixture();
  const report=signed(f);
  const other=fixture();
  for(const changes of [
    {operatorReport:other.operatorReport},
    {reviewReport:other.reviewReport},
    {operatorPublicPem:other.operatorPublicPem},
    {reviewerPublicPem:other.reviewerPublicPem},
    {operatorFingerprint:other.operatorFingerprint},
    {reviewerFingerprint:other.reviewerFingerprint},
    {artifacts:{...f.artifacts,
      "supervisor-journal.txt":Buffer.from("altered source\n")}},
  ]){
    assert.throws(()=>verifySignedReviewDisposition({
      ...verifier(f,report),...changes,
    }));
  }
});
test("disposition time must follow reviewer within 30 days",()=>{
  const f=fixture();
  for(const at of [
    "2026-11-22T20:00:00.000Z",
    "2027-01-01T20:00:00.000Z",
    "not-an-iso-date",
    "2026-11-23T21:00:00Z",
    "2026-02-30T20:00:00.000Z",
  ]){
    assert.throws(()=>createSignedReviewDisposition({
      ...f,decision:"reviewed-for-archival",acknowledgment:DISPOSITION_ACK,
      decidedAt:at,
    }));
  }
});
test("new CLI actions require distinct root authorization; CI runs no VM",async()=>{
  const file=new URL("../scripts/cyber-range-independent-review.mjs",import.meta.url);
  const cli=await readFile(file,"utf8");
  const workflow=await readFile(new URL(
    "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
    import.meta.url),"utf8");
  const core=await readFile(new URL(
    "../infrastructure/cyber-range/provider/firecracker-review-disposition.mjs",
    import.meta.url),"utf8");
  assert.match(cli,/--decide/);
  assert.match(cli,/--verify-decision/);
  assert.match(cli,/I_APPROVE_OFFLINE_REVIEW_DISPOSITION/);
  assert.match(workflow,/ctf-firecracker-review-disposition.test.mjs/);
  assert.doesNotMatch(core,/fetch\(|createServer|startInstance|https?:\/\/|child_process/);
  const output=spawnSync(process.execPath,[fileURLToPath(file),
    "--decide","--confirm-independent-disposition",
    "--session",sessionId,"--operator-sha","a".repeat(64),
    "--reviewer-sha","b".repeat(64),
    "--decision","reviewed-for-archival","--reasons","none",
  ],{encoding:"utf8",env:{PATH:process.env.PATH}});
  assert.equal(output.status,1);
  assert.match(output.stderr,/Offline case review refused/);
});
