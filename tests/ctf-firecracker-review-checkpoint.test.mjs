import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
  buildCaseCheckpoint,checkpointBytes,checkpointFilenames,
  verifyCaseCheckpoint,
} from "../infrastructure/cyber-range/provider/firecracker-review-checkpoint.mjs";
import {
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
const SHA=x=>createHash("sha256").update(x).digest("hex");
const str=x=>Buffer.from(JSON.stringify(x)+"\n");
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function key(){
  const pair=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:pair.privateKey.export({
      format:"pem",type:"pkcs8",
    }).toString(),
    publicKeyPem:pair.publicKey.export({
      format:"pem",type:"spki",
    }).toString(),
    fingerprint:SHA(pair.publicKey.export({
      format:"der",type:"spki",
    })),
  };
}
function fixture(mode="guest-and-watchdog",decision="reviewed-for-archival"){
  const op=key(),rev=key(),guest=mode.includes("guest"),
    expiry=mode.includes("watchdog");
  const result={
    sessionId,unit:supervisedVmUnit(sessionId),
    accepted:true,teardownVerified:true,bootApiAccepted:true,
    offlineNetnsAttested:true,localKvmGuestObserved:true,
    independentDeadlineSeconds:900,
    publicLabsEnabled:false,cloudProvisioningAllowed:false,
    providerHardLimitVerified:false,
    ...(guest?{guestServiceFunctional:true,
      guestChallengeResponseVerified:true}:{}),
    ...(expiry?{full900SecondExpiryObserved:true,
      systemdTimeoutResultVerified:true,noCgroupDescendants:true}:{}),
  };
  const operatorReport=createSignedOperatorEvidence({
    config,result,mode,capturedAt,
    privateKeyPem:op.privateKeyPem,publicKeyPem:op.publicKeyPem,
    trustedPublicFingerprint:op.fingerprint,
  });
  const artifacts=Object.fromEntries(requiredReviewArtifacts(mode).map(name=>
    [name,Buffer.from("LOCAL OFFLINE NO-HARDWARE FIXTURE: "+name+"\n")]));
  const context={
    operatorReport,operatorPublicPem:op.publicKeyPem,
    operatorFingerprint:op.fingerprint,
    reviewerPublicPem:rev.publicKeyPem,
    reviewerPrivatePem:rev.privateKeyPem,
    reviewerFingerprint:rev.fingerprint,artifacts,
  };
  const reviewReport=createIndependentReview({
    ...context,reviewerAck:"I_REVIEWED_INDEPENDENT_SOURCE_FILES",reviewedAt,
  });
  const reasons=decision==="reviewed-for-archival"?[]:
    ["independent-host-source-not-established"];
  const dispositionReport=createSignedReviewDisposition({
    ...context,reviewReport,decision,reasons,decidedAt,
    acknowledgment:"I_APPROVE_OFFLINE_REVIEW_DISPOSITION",
  });
  const {reviewerPrivatePem,...verifyContext}=context;
  const verifiedDisposition=verifySignedReviewDisposition({
    ...verifyContext,reviewReport,report:dispositionReport,
  });
  const files={
    "operator-report.json":str(operatorReport),
    "operator-public.pem":Buffer.from(op.publicKeyPem),
    "review-verdict.json":str(reviewReport),
    "review-disposition.json":str(dispositionReport),
    "reviewer-public.pem":Buffer.from(rev.publicKeyPem),
    ...artifacts,
  };
  return {verifiedDisposition,files,
    operatorFingerprint:op.fingerprint,reviewerFingerprint:rev.fingerprint};
}
const checkpoint=source=>buildCaseCheckpoint(source);
const copy=x=>JSON.parse(JSON.stringify(x));

test("all three modes and review outcomes have stable, ordered source digests",()=>{
  for(const mode of ["guest-vsock","watchdog-900","guest-and-watchdog"]){
    for(const decision of [
      "reviewed-for-archival","follow-up-required","evidence-rejected",
    ]){
      const f=fixture(mode,decision);
      const c=checkpoint(f);
      assert.deepEqual(c.doc.fileDigests.map(x=>x.name),
        checkpointFilenames(mode));
      assert.equal(c.doc.mode,mode);
      assert.equal(c.doc.decision,decision);
      assert.equal(c.doc.trustLimits.physicalHostAttested,false);
      assert.equal(c.doc.trustLimits.publicLabsEnabled,false);
      assert.equal(c.doc.trustLimits.productionReady,false);
      assert.equal(c.checkpointSha256,SHA(c.bytes));
      assert.ok(c.bytes.equals(checkpointBytes(c.doc)));
      const v=verifyCaseCheckpoint({
        savedBytes:c.bytes,recomputed:c,
        externallyPinnedSha256:c.checkpointSha256,
      });
      assert.equal(v.sourceHashesMatchSealedCheckpoint,true);
      assert.equal(v.externalChecksumMatched,true);
      assert.equal(v.productionReady,false);
      assert.equal(v.physicalHostAttested,false);
      assert.equal(v.privateKeyUsed,false);
    }
  }
});
test("checkpoint detects original source changed, removed, extra or non-binary",()=>{
  const f=fixture();
  const original=checkpoint(f);
  for(const mutate of [
    o=>o["supervisor-journal.txt"]=Buffer.from("changed\n"),
    o=>o["review-disposition.json"]=Buffer.from("modified signature\n"),
    o=>delete o["guest-challenge.txt"],
    o=>o.extra=Buffer.from("extra source"),
    o=>o["operator-report.json"]="malformed string",
    o=>o["cgroup-death.txt"]=Buffer.alloc(0),
    o=>o["image-provenance.json"]=Buffer.alloc(128*1024+1),
  ]){
    const changed={...f.files};
    mutate(changed);
    try{
      const rebuilt=checkpoint({...f,files:changed});
      assert.throws(()=>verifyCaseCheckpoint({
        savedBytes:original.bytes,recomputed:rebuilt,
        externallyPinnedSha256:original.checkpointSha256,
      }));
    }catch(err){
      assert.match(String(err),/checkpoint source|source bytes|source set/);
    }
  }
});
test("wrong externally pinned SHA rejects rollback even when local digest is valid",()=>{
  const c=checkpoint(fixture("guest-vsock"));
  assert.throws(()=>verifyCaseCheckpoint({
    savedBytes:c.bytes,recomputed:c,externallyPinnedSha256:"f".repeat(64),
  }),/mismatch or rollback/);
  assert.throws(()=>verifyCaseCheckpoint({
    savedBytes:c.bytes,recomputed:c,
  }),/independently recorded/);
  const tampered=Buffer.from(c.bytes);
  tampered[9]^=1;
  assert.throws(()=>verifyCaseCheckpoint({
    savedBytes:tampered,recomputed:c,
    externallyPinnedSha256:c.checkpointSha256,
  }));
});
test("invalid trust claims, format escalation and unsupported filenames rejected",()=>{
  const c=checkpoint(fixture());
  for(const modify of [
    x=>x.trustLimits.productionReady=true,
    x=>x.trustLimits.publicLabsEnabled=true,
    x=>x.trustLimits.physicalHostAttested=true,
    x=>x.trustLimits.independentSourceAuthenticityVerified=true,
    x=>x.trustLimits.externalPinRequiredForRollbackDetection=false,
    x=>x.schemaVersion=3,
    x=>x.classification="hardware-attested",
    x=>x.sessionId="not-a-session",
    x=>x.fileDigests[0].sha256="f".repeat(63),
    x=>x.fileDigests[0].name="private-key.pem",
    x=>x.fileDigests[0].bytes=0,
    x=>x.fileDigests.push({
      name:"bonus",sha256:"d".repeat(64),bytes:2,
    }),
    x=>x.extra="provenance",
  ]){
    const altered=copy(c.doc);
    modify(altered);
    assert.throws(()=>checkpointBytes(altered));
  }
});
test("unverified or self-signed status cannot be checkpointed",()=>{
  const f=fixture();
  for(const mutation of [
    x=>x.operatorSignatureVerified=false,
    x=>x.reviewerSignatureVerified=false,
    x=>x.reviewerDispositionSignatureVerified=false,
    x=>x.productionReady=true,
    x=>x.publicLabsEnabled=true,
    x=>x.physicalHostAttested=true,
    x=>x.independentHostEvidenceVerified=true,
  ]){
    const status={...f.verifiedDisposition};
    mutation(status);
    assert.throws(()=>checkpoint({...f,verifiedDisposition:status}),
      /Signed review must/);
  }
  assert.throws(()=>checkpoint({
    ...f,reviewerFingerprint:f.operatorFingerprint,
  }),/Signed review must/);
});
test("CLI requires external pin for verify and separate manual approval for seal",async()=>{
  const script=new URL("../scripts/cyber-range-review-checkpoint.mjs",import.meta.url);
  const base=["--session",sessionId,"--operator-sha","a".repeat(64),
    "--reviewer-sha","b".repeat(64)];
  for(const args of [
    ["--seal","--confirm-case-checkpoint",...base],
    ["--verify",...base],
    ["--verify",...base,"--checkpoint-sha","invalid"],
  ]){
    const run=spawnSync(process.execPath,[fileURLToPath(script),...args],{
      encoding:"utf8",env:{PATH:process.env.PATH},
    });
    assert.equal(run.status,1);
    assert.match(run.stderr,/Offline checkpoint refused/);
  }
  const [cli,review,workflow]=await Promise.all([
    readFile(script,"utf8"),
    readFile(new URL(
      "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(cli,/ETERNYX_CASE_CHECKPOINT_ACK/);
  assert.match(review,/verifySignedReviewDisposition/);
  assert.match(review,/publishOfflineEvidence/);
  assert.match(workflow,/ctf-firecracker-review-checkpoint.test.mjs/);
  assert.doesNotMatch(cli,/createServer|fetch\(|startInstance|https?:\/\//);
});
