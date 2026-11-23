import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {composeOfflineCaseAudit} from
  "../infrastructure/cyber-range/provider/firecracker-complete-case-audit.mjs";

const id="123e4567-e89b-42d3-a456-426614174001";
const op="a".repeat(64),rev="b".repeat(64),pin="c".repeat(64),
  addPin="d".repeat(64);
const modes=["guest-vsock","watchdog-900","guest-and-watchdog"];
const decisions=["reviewed-for-archival","follow-up-required","evidence-rejected"];
const copy=x=>structuredClone(x);
function fixture(mode="guest-and-watchdog",decision="follow-up-required",
  committedImport=true){
  const identity={sessionId:id,mode};
  const reasons=decision==="reviewed-for-archival"?[]:
    ["independent-host-source-not-established"];
  const kinds=["supervisor","cgroup",
    ...(mode.includes("guest")?["guest"]:[]),
    ...(mode.includes("watchdog")?["expiry"]:[])];
  return {
    ...identity,operatorFingerprint:op,reviewerFingerprint:rev,
    externallyPinnedCheckpointSha256:pin,
    externallyPinnedAddendumSha256:addPin,
    committedImport,
    review:{...identity,
      operatorSignatureVerified:true,reviewerSignatureVerified:true,
      secondSignerDistinct:true,sourceFileDigestsVerified:true,
      physicalHostAttested:false,productionReady:false,
      publicLabsEnabled:false,
    },
    consistency:{...identity,
      metadataConsistencyVerified:true,
      pinnedKernelRootfsAndHostBinariesMatched:true,
      offlinePolicyFieldsMatched:true,
      metadataTimestampWindowMatched:true,
      independentSourceAuthenticityVerified:false,
      physicalHostAttested:false,productionReady:false,
      publicLabsEnabled:false,
    },
    disposition:{...identity,decision,reasons,
      operatorSignatureVerified:true,reviewerSignatureVerified:true,
      reviewerDispositionSignatureVerified:true,
      boundToExactReviewedFiles:true,
      physicalHostAttested:false,independentHostEvidenceVerified:false,
      productionReady:false,publicLabsEnabled:false,
    },
    checkpoint:{...identity,decision,reasons,
      checkpointSha256:pin,sourceHashesMatchSealedCheckpoint:true,
      externalChecksumMatched:true,privateKeyUsed:false,
      independentSourceAuthenticityVerified:false,
      physicalHostAttested:false,productionReady:false,
      publicLabsEnabled:false,
    },
    runtime:{...identity,checkedObservationKinds:kinds,
      referencedTranscriptDigestsMatched:true,
      observationFlagsInternallyConsistent:true,
      sessionAndSystemdUnitMatched:true,captureWindowMatched:true,
      sidecarsIncludedInEarlierSignedReview:false,
      rawHostLogsSemanticallyVerified:false,
      independentSourceAuthenticityVerified:false,
      physicalHostAttested:false,productionReady:false,
      publicLabsEnabled:false,
    },
    addendum:{...identity,decision,
      checkpointSha256:pin,addendumSha256:addPin,
      matchedSidecars:kinds.length,reviewerSignatureVerified:true,
      operatorSidecarsCryptographicallyBound:true,
      externallyPinnedCaseAndAddendumDigestsVerified:true,
      sidecarsIndependentlyAuthenticated:false,
      physicalHostAttested:false,productionReady:false,
      publicLabsEnabled:false,
    },
    snapshot:{...identity,verifiedSourceFiles:18,
      stableAcrossSecondPass:true,noStagingRemnants:true,
      physicalHostAttested:false,
      independentSourceAuthenticityVerified:false,
      productionReady:false,publicLabsEnabled:false,
    },
  };
}
test("all nine operating mode and disposition combinations remain offline-only",()=>{
  for(const mode of modes)for(const decision of decisions){
    const input=fixture(mode,decision);
    const result=composeOfflineCaseAudit(input);
    assert.equal(result.sessionId,id);
    assert.equal(result.mode,mode);
    assert.equal(result.decision,decision);
    assert.equal(result.provenance.importedWithCommittedJournal,true);
    assert.equal(result.provenance.legacyManualStaging,false);
    assert.equal(result.provenance.checkpointSha256,pin);
    assert.equal(result.provenance.addendumSha256,addPin);
    assert.equal(result.provenance.signedRuntimeSidecars,
      input.runtime.checkedObservationKinds.length);
    assert.equal(result.physicalHostAttested,false);
    assert.equal(result.independentHostEvidenceVerified,false);
    assert.equal(result.productionReady,false);
    assert.equal(result.publicLabsEnabled,false);
    assert.equal(result.privateSigningKeyRead,false);
    assert.equal(result.unresolvedIndependentProof.length,5);
    assert.equal(result.dispositionClassification,
      decision==="reviewed-for-archival"?"archival-file-review-only":decision);
    assert.ok(Object.values(result.integrityChecks).every(x=>x===true));
  }
});
test("legacy manually staged case never claims a committed import journal",()=>{
  const result=composeOfflineCaseAudit(fixture("guest-vsock",
    "reviewed-for-archival",false));
  assert.equal(result.provenance.importedWithCommittedJournal,false);
  assert.equal(result.provenance.legacyManualStaging,true);
  assert.equal(result.dispositionClassification,"archival-file-review-only");
  assert.equal(result.physicalHostAttested,false);
});
test("all mandatory verification steps are required; no partial pass",()=>{
  const baseline=fixture();
  for(const [layer,field] of [
    ["review","operatorSignatureVerified"],
    ["review","reviewerSignatureVerified"],
    ["review","secondSignerDistinct"],
    ["review","sourceFileDigestsVerified"],
    ["consistency","metadataConsistencyVerified"],
    ["consistency","pinnedKernelRootfsAndHostBinariesMatched"],
    ["consistency","offlinePolicyFieldsMatched"],
    ["consistency","metadataTimestampWindowMatched"],
    ["disposition","reviewerDispositionSignatureVerified"],
    ["disposition","boundToExactReviewedFiles"],
    ["checkpoint","sourceHashesMatchSealedCheckpoint"],
    ["checkpoint","externalChecksumMatched"],
    ["runtime","referencedTranscriptDigestsMatched"],
    ["runtime","observationFlagsInternallyConsistent"],
    ["runtime","sessionAndSystemdUnitMatched"],
    ["runtime","captureWindowMatched"],
    ["addendum","reviewerSignatureVerified"],
    ["addendum","operatorSidecarsCryptographicallyBound"],
    ["addendum","externallyPinnedCaseAndAddendumDigestsVerified"],
    ["snapshot","stableAcrossSecondPass"],
    ["snapshot","noStagingRemnants"],
  ]){
    const input=copy(baseline);
    input[layer][field]=false;
    assert.throws(()=>composeOfflineCaseAudit(input),/Incomplete offline case audit/);
  }
});
test("fabricated hardware/public readiness or invalid independence claims fail closed",()=>{
  const baseline=fixture();
  for(const [layer,field] of [
    ["review","physicalHostAttested"],
    ["review","productionReady"],
    ["disposition","independentHostEvidenceVerified"],
    ["consistency","independentSourceAuthenticityVerified"],
    ["checkpoint","independentSourceAuthenticityVerified"],
    ["runtime","sidecarsIncludedInEarlierSignedReview"],
    ["runtime","rawHostLogsSemanticallyVerified"],
    ["addendum","sidecarsIndependentlyAuthenticated"],
    ["addendum","publicLabsEnabled"],
    ["snapshot","physicalHostAttested"],
  ]){
    const input=copy(baseline);
    input[layer][field]=true;
    assert.throws(()=>composeOfflineCaseAudit(input),/trust boundary/);
  }
});
test("cross-case replay, wrong trusted SHA, mismatch decisions and reasons refuse",()=>{
  const baseline=fixture();
  for(const mutate of [
    x=>x.review.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    x=>x.addendum.mode="guest-vsock",
    x=>x.runtime.mode="watchdog-900",
    x=>x.disposition.decision="reviewed-for-archival",
    x=>x.addendum.decision="evidence-rejected",
    x=>x.checkpoint.reasons=[],
    x=>x.addendum.checkpointSha256="e".repeat(64),
    x=>x.checkpoint.checkpointSha256="e".repeat(64),
    x=>x.addendum.addendumSha256="e".repeat(64),
    x=>x.externallyPinnedCheckpointSha256="e".repeat(64),
    x=>x.externallyPinnedAddendumSha256="e".repeat(64),
    x=>x.operatorFingerprint=rev,
    x=>x.snapshot.verifiedSourceFiles=2,
    x=>x.addendum.matchedSidecars=1,
    x=>x.runtime.checkedObservationKinds=["guest","supervisor","cgroup","expiry"],
  ]){
    const input=copy(baseline);
    mutate(input);
    assert.throws(()=>composeOfflineCaseAudit(input));
  }
});
test("missing external pins, unsigned layers, malformed modes and invalid counts fail",()=>{
  const baseline=fixture();
  for(const mutate of [
    x=>delete x.externallyPinnedCheckpointSha256,
    x=>delete x.externallyPinnedAddendumSha256,
    x=>delete x.disposition,
    x=>x.sessionId="not-a-session",
    x=>x.mode="remote-labs",
    x=>x.committedImport="verified",
    x=>x.reviewerFingerprint="not-sha",
    x=>x.snapshot.verifiedSourceFiles=NaN,
    x=>x.addendum.matchedSidecars=3.5,
  ]){
    const input=copy(baseline);
    mutate(input);
    assert.throws(()=>composeOfflineCaseAudit(input));
  }
});
test("CLI remains read-only and never leaks private case data on invalid inputs",async()=>{
  const cli=new URL("../scripts/cyber-range-complete-case-audit.mjs",
    import.meta.url);
  const flags=["--session",id,"--operator-sha",op,"--reviewer-sha",rev,
    "--checkpoint-sha",pin,"--addendum-sha",addPin];
  for(const args of [
    ["--audit",...flags.slice(0,-2)],
    ["--audit",...flags,"--session",id],
    ["--audit",...flags.slice(0,9),"not-hash"],
    ["--wrong",...flags],
    ["--audit",...flags],
  ]){
    const run=spawnSync(process.execPath,[fileURLToPath(cli),...args],{
      encoding:"utf8",env:{PATH:process.env.PATH},timeout:3000,
    });
    assert.equal(run.status,1);
    assert.match(run.stderr,/Offline complete case audit refused/);
    assert.doesNotMatch(run.stderr,/\/etc\/|\/var\/|PRIVATE KEY|BEGIN PUBLIC/);
  }
  const [cliSource,reviewSource,workflow]=await Promise.all([
    readFile(cli,"utf8"),
    readFile(new URL(
      "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.doesNotMatch(cliSource,/createServer|fetch\(|https?:\/\/|startInstance/);
  assert.match(reviewSource,/auditCompleteIndependentReviewCase/);
  assert.match(reviewSource,/verifyIndependentRuntimeAddendum/);
  assert.match(reviewSource,/verifyIndependentCaseCheckpoint/);
  assert.match(reviewSource,/verifyStableOfflineCaseSnapshot/);
  assert.match(workflow,/ctf-firecracker-complete-case-audit.test.mjs/);
});
