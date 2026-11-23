import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
  auditOperatorEvidenceConsistency,
} from "../infrastructure/cyber-range/provider/firecracker-evidence-consistency.mjs";
import {createSignedOperatorEvidence} from
  "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const created="2026-11-23T11:00:00.000Z";
const modes=["guest-vsock","watchdog-900","guest-and-watchdog"];
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function signingKeys(){
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicKeyPem:publicKey.export({format:"pem",type:"spki"}).toString(),
    trustedPublicFingerprint:createHash("sha256").update(
      publicKey.export({format:"der",type:"spki"})).digest("hex"),
  };
}
function canonical(x){return Buffer.from(JSON.stringify(x)+"\n");}
function fixture(mode="guest-and-watchdog"){
  const keys=signingKeys();
  const guest=mode.includes("guest"),expiry=mode.includes("watchdog");
  const result={
    sessionId,unit:supervisedVmUnit(sessionId),
    accepted:true,bootApiAccepted:true,offlineNetnsAttested:true,
    localKvmGuestObserved:true,teardownVerified:true,
    independentDeadlineSeconds:900,publicLabsEnabled:false,
    cloudProvisioningAllowed:false,providerHardLimitVerified:false,
    ...(guest?{
      guestServiceFunctional:true,guestChallengeResponseVerified:true,
    }:{}),
    ...(expiry?{
      full900SecondExpiryObserved:true,
      systemdTimeoutResultVerified:true,noCgroupDescendants:true,
    }:{}),
  };
  const operatorReport=createSignedOperatorEvidence({
    config,result,mode,capturedAt:created,
    privateKeyPem:keys.privateKeyPem,
    publicKeyPem:keys.publicKeyPem,
    trustedPublicFingerprint:keys.trustedPublicFingerprint,
  });
  const pins={...operatorReport.payload.baseline.payload.pins};
  const artifacts={
    "host-preflight.json":canonical({
      schemaVersion:1,
      classification:"operator-collected-offline-preflight",
      sessionId,unit:supervisedVmUnit(sessionId),
      capturedAt:"2026-11-23T10:30:00.000Z",
      offlineOnly:true,loopbackOnly:true,
      pinnedHostExecutables:true,pinnedGuestImages:true,
      readyForPublicHostedLabs:false,publicLabsEnabled:false,
      cloudProvisioningAllowed:false,
    }),
    "image-provenance.json":canonical({
      schemaVersion:1,
      classification:"operator-collected-image-digest-inventory",
      sessionId,capturedAt:"2026-11-23T10:00:00.000Z",
      pins,rootfsReadOnly:true,
      imageDigestProvenanceIndependentlyVerified:false,
      publicLabsEnabled:false,cloudProvisioningAllowed:false,
    }),
    "supervisor-journal.txt":Buffer.from("OPERATOR EXAMPLE; NOT PROOF\n"),
    "cgroup-death.txt":Buffer.from("OPERATOR EXAMPLE; NOT PROOF\n"),
    ...(guest?{
      "guest-challenge.txt":Buffer.from("OPERATOR EXAMPLE; NOT PROOF\n"),
    }:{}),
    ...(expiry?{
      "timeout-result.txt":Buffer.from("OPERATOR EXAMPLE; NOT PROOF\n"),
    }:{}),
  };
  return {
    operatorReport,operatorPublicPem:keys.publicKeyPem,
    operatorFingerprint:keys.trustedPublicFingerprint,artifacts,
  };
}
function changeArtifact(f,name,fn){
  const data=JSON.parse(f.artifacts[name].toString("utf8"));
  fn(data);
  f.artifacts[name]=canonical(data);
}
test("all signed modes correlate two preflight/inventory records without host attestation",()=>{
  for(const mode of modes){
    const audit=auditOperatorEvidenceConsistency(fixture(mode));
    assert.equal(audit.mode,mode);
    assert.equal(audit.sessionId,sessionId);
    assert.equal(audit.metadataConsistencyVerified,true);
    assert.equal(audit.exactSessionAndUnitMatched,true);
    assert.equal(audit.pinnedKernelRootfsAndHostBinariesMatched,true);
    assert.equal(audit.metadataTimestampWindowMatched,true);
    assert.equal(audit.independentSourceAuthenticityVerified,false);
    assert.equal(audit.physicalHostAttested,false);
    assert.equal(audit.rawSupervisorJournalSemanticallyVerified,false);
    assert.equal(audit.publicLabsEnabled,false);
    assert.equal(audit.productionReady,false);
  }
});
test("host preflight cannot substitute session, unit, offline, ingress or public readiness",()=>{
  const changes=[
    d=>d.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    d=>d.unit="arbitrary.service",
    d=>d.loopbackOnly=false,
    d=>d.offlineOnly=false,
    d=>d.pinnedHostExecutables=false,
    d=>d.pinnedGuestImages=false,
    d=>d.readyForPublicHostedLabs=true,
    d=>d.cloudProvisioningAllowed=true,
    d=>d.publicLabsEnabled=true,
    d=>d.classification="independent-attested-host",
    d=>d.schemaVersion=999,
    d=>d.unchecked="untrusted",
  ];
  for(const modify of changes){
    const f=fixture();
    changeArtifact(f,"host-preflight.json",modify);
    assert.throws(()=>auditOperatorEvidenceConsistency(f));
  }
});
test("image provenance must exactly match all four signer-bound binary pins",()=>{
  for(const pin of [
    "kernelSha256","rootfsSha256","jailerSha256","firecrackerSha256",
  ]){
    const f=fixture("watchdog-900");
    changeArtifact(f,"image-provenance.json",d=>{d.pins[pin]="f".repeat(64);});
    assert.throws(()=>auditOperatorEvidenceConsistency(f),/Image digest inventory/);
  }
  for(const change of [
    d=>d.imageDigestProvenanceIndependentlyVerified=true,
    d=>d.rootfsReadOnly=false,
    d=>d.publicLabsEnabled=true,
    d=>d.cloudProvisioningAllowed=true,
    d=>d.pins.extra="f".repeat(64),
    d=>delete d.pins.kernelSha256,
    d=>d.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
  ]){
    const f=fixture();
    changeArtifact(f,"image-provenance.json",change);
    assert.throws(()=>auditOperatorEvidenceConsistency(f),/Image digest inventory/);
  }
});
test("metadata timestamp order and one-day window must match receipt capture",()=>{
  const invalidDates=[
    "2026-11-23T12:00:00.000Z",
    "2026-11-20T00:00:00.000Z",
    "2026-11-23T10:30:00Z",
    "never",
    "2026-02-30T10:00:00.000Z",
  ];
  for(const at of invalidDates){
    const f=fixture();
    changeArtifact(f,"host-preflight.json",d=>{d.capturedAt=at;});
    assert.throws(()=>auditOperatorEvidenceConsistency(f));
  }
  const afterPreflight=fixture();
  changeArtifact(afterPreflight,"image-provenance.json",
    d=>{d.capturedAt="2026-11-23T10:45:00.000Z";});
  assert.throws(()=>auditOperatorEvidenceConsistency(afterPreflight),
    /follows host preflight/);
});
test("ambiguous, malformed, oversize and missing JSON metadata never pass",()=>{
  const changes=[
    b=>Buffer.concat([b,Buffer.from("\n")]),
    b=>Buffer.from(b.toString().replace(',"pins"',',"pins"')),
    b=>Buffer.from('{"schemaVersion":1,"schemaVersion":1}\n'),
    b=>Buffer.from("not json"),
    b=>Buffer.alloc(4097,"A"),
    b=>Buffer.alloc(0),
    b=>Buffer.from(b.toString().replace(/"/g,'\\"')),
  ];
  for(const m of changes){
    const f=fixture();
    f.artifacts["image-provenance.json"]=m(
      f.artifacts["image-provenance.json"]);
    if(!f.artifacts["image-provenance.json"].equals(
      fixture().artifacts["image-provenance.json"]))
      assert.throws(()=>auditOperatorEvidenceConsistency(f));
  }
  const f=fixture();
  delete f.artifacts["host-preflight.json"];
  assert.throws(()=>auditOperatorEvidenceConsistency(f),/Incomplete/);
});
test("signed operator key substitution and changed receipt are rejected",()=>{
  const f=fixture();
  const wrong=fixture();
  assert.throws(()=>auditOperatorEvidenceConsistency({
    ...f,operatorPublicPem:wrong.operatorPublicPem,
  }));
  assert.throws(()=>auditOperatorEvidenceConsistency({
    ...f,operatorFingerprint:wrong.operatorFingerprint,
  }));
  const broken=structuredClone(f.operatorReport);
  broken.payload.baseline.payload.pins.kernelSha256="e".repeat(64);
  assert.throws(()=>auditOperatorEvidenceConsistency({
    ...f,operatorReport:broken,
  }));
});
test("existing reviewer runtime enforces metadata check before signing/verifying",async()=>{
  const source=await readFile(new URL(
    "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
    import.meta.url),"utf8");
  const cli=await readFile(new URL(
    "../scripts/cyber-range-independent-review.mjs",
    import.meta.url),"utf8");
  const workflow=await readFile(new URL(
    "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
    import.meta.url),"utf8");
  assert.match(source,/auditOperatorEvidenceConsistency/);
  assert.match(source,/auditIndependentReviewConsistency/);
  assert.match(cli,/--audit-consistency/);
  assert.match(workflow,/ctf-firecracker-evidence-consistency.test.mjs/);
  assert.doesNotMatch(cli,/createServer|fetch\(|https?:\/\/|startInstance/);
  const script=fileURLToPath(new URL(
    "../scripts/cyber-range-independent-review.mjs",import.meta.url));
  const denied=spawnSync(process.execPath,[script,"--audit-consistency",
    "--session",sessionId,"--operator-sha","a".repeat(64),
    "--reviewer-sha","b".repeat(64)],{
    encoding:"utf8",env:{PATH:process.env.PATH},
  });
  assert.equal(denied.status,1);
  assert.match(denied.stderr,/Offline case review refused/);
});
