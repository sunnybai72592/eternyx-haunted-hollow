import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
  auditOfflineRuntimeObservations,requiredRuntimeObservationFiles,
} from "../infrastructure/cyber-range/provider/firecracker-runtime-observations.mjs";
import {createSignedOperatorEvidence} from
  "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const at="2026-11-23T11:00:00.000Z";
const canonical=x=>Buffer.from(JSON.stringify(x)+"\n");
const hash=x=>createHash("sha256").update(x).digest("hex");
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function material(){
  const pair=generateKeyPairSync("ed25519");
  return {
    privatePem:pair.privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicPem:pair.publicKey.export({format:"pem",type:"spki"}).toString(),
    fingerprint:hash(pair.publicKey.export({format:"der",type:"spki"})),
  };
}
const observationValues={
  supervisor:{
    jailed:true,hostNetworkDenied:true,externalWatchdogArmed:true,
    cgroupEnforced:true,publicIngressEnabled:false,
    cloudProvisioningAllowed:false,
  },
  cgroup:{descendantCount:0,dead:true,teardownVerified:true},
  guest:{
    localVsockOnly:true,challengeResponseVerified:true,
    guestServiceFunctional:true,guestIdentityCryptographicallyProven:false,
  },
  expiry:{
    deadlineSeconds:900,systemdTimeoutResult:"timeout",
    cgroupDescendantCount:0,fullExpiryObserved:true,
    cloudProvisioningAllowed:false,
  },
};
function fixture(mode="guest-and-watchdog"){
  const key=material(),guest=mode.includes("guest"),
    expiry=mode.includes("watchdog");
  const result={
    sessionId,unit:supervisedVmUnit(sessionId),accepted:true,
    bootApiAccepted:true,offlineNetnsAttested:true,
    localKvmGuestObserved:true,teardownVerified:true,
    independentDeadlineSeconds:900,publicLabsEnabled:false,
    cloudProvisioningAllowed:false,providerHardLimitVerified:false,
    ...(guest?{guestServiceFunctional:true,
      guestChallengeResponseVerified:true}:{}),
    ...(expiry?{full900SecondExpiryObserved:true,
      systemdTimeoutResultVerified:true,noCgroupDescendants:true}:{}),
  };
  const operatorReport=createSignedOperatorEvidence({
    config,result,mode,capturedAt:at,
    privateKeyPem:key.privatePem,publicKeyPem:key.publicPem,
    trustedPublicFingerprint:key.fingerprint,
  });
  const artifacts={
    "host-preflight.json":canonical({
      schemaVersion:1,classification:"operator-collected-offline-preflight",
      sessionId,unit:supervisedVmUnit(sessionId),
      capturedAt:"2026-11-23T10:30:00.000Z",
      offlineOnly:true,loopbackOnly:true,pinnedHostExecutables:true,
      pinnedGuestImages:true,readyForPublicHostedLabs:false,
      publicLabsEnabled:false,cloudProvisioningAllowed:false,
    }),
    "image-provenance.json":canonical({
      schemaVersion:1,classification:"operator-collected-image-digest-inventory",
      sessionId,capturedAt:"2026-11-23T10:00:00.000Z",
      pins:{...operatorReport.payload.baseline.payload.pins},
      imageDigestProvenanceIndependentlyVerified:false,
      rootfsReadOnly:true,publicLabsEnabled:false,
      cloudProvisioningAllowed:false,
    }),
    "supervisor-journal.txt":Buffer.from("FIXTURE supervisor; NOT PROVEN\n"),
    "cgroup-death.txt":Buffer.from("FIXTURE cgroup; NOT PROVEN\n"),
    ...(guest?{"guest-challenge.txt":Buffer.from(
      "FIXTURE guest; NOT PROVEN\n")}:{}),
    ...(expiry?{"timeout-result.txt":Buffer.from(
      "FIXTURE timeout; NOT PROVEN\n")}:{}),
  };
  const sidecars=Object.fromEntries(requiredRuntimeObservationFiles(mode)
    .map(({kind,source,sidecar})=>[sidecar,canonical({
      schemaVersion:1,
      classification:"operator-collected-"+kind+"-observation",
      sessionId,unit:supervisedVmUnit(sessionId),
      capturedAt:"2026-11-23T10:45:00.000Z",
      sourceSha256:hash(artifacts[source]),
      observations:structuredClone(observationValues[kind]),
    })]));
  return {
    operatorReport,operatorPublicPem:key.publicPem,
    operatorFingerprint:key.fingerprint,artifacts,sidecars,
  };
}
const mutate=(f,name,action)=>{
  const d=JSON.parse(f.sidecars[name].toString("utf8"));
  action(d);
  f.sidecars[name]=canonical(d);
};
test("all three modes correlate exact sidecars with reviewer raw transcripts",()=>{
  for(const mode of [
    "guest-vsock","watchdog-900","guest-and-watchdog",
  ]){
    const f=fixture(mode);
    const result=auditOfflineRuntimeObservations(f);
    assert.equal(result.sessionId,sessionId);
    assert.equal(result.mode,mode);
    assert.deepEqual(result.checkedObservationKinds,
      requiredRuntimeObservationFiles(mode).map(x=>x.kind));
    assert.equal(result.referencedTranscriptDigestsMatched,true);
    assert.equal(result.sessionAndSystemdUnitMatched,true);
    assert.equal(result.sidecarsIncludedInEarlierSignedReview,false);
    assert.equal(result.rawHostLogsSemanticallyVerified,false);
    assert.equal(result.independentSourceAuthenticityVerified,false);
    assert.equal(result.physicalHostAttested,false);
    assert.equal(result.publicLabsEnabled,false);
    assert.equal(result.productionReady,false);
  }
});
test("wrong UUID, unit, digest or extra sidecar metadata never passes",()=>{
  for(const change of [
    x=>x.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    x=>x.unit="fake.service",
    x=>x.sourceSha256="f".repeat(64),
    x=>x.classification="independent-attestation",
    x=>x.schemaVersion=2,
    x=>x.untrusted=true,
  ]){
    const f=fixture();
    mutate(f,"runtime-supervisor.json",change);
    assert.throws(()=>auditOfflineRuntimeObservations(f));
  }
});
test("every host, teardown, guest and watchdog flag is checked exactly",()=>{
  for(const mode of ["guest-and-watchdog"]){
    for(const [kind,expectations] of Object.entries(observationValues)){
      const file=kind==="expiry"?"runtime-timeout.json":"runtime-"+kind+".json";
      for(const [field,wanted] of Object.entries(expectations)){
        const f=fixture(mode);
        mutate(f,file,x=>{
          x.observations[field]=
            typeof wanted==="boolean"?!wanted:
            typeof wanted==="number"?wanted+1:"not-timeout";
        });
        assert.throws(()=>auditOfflineRuntimeObservations(f),
          /contradicts/);
      }
    }
  }
});
test("unrelated, swapped, missing or modified raw transcripts are rejected",()=>{
  const f=fixture("guest-and-watchdog");
  for(const name of [
    "supervisor-journal.txt","cgroup-death.txt","guest-challenge.txt",
    "timeout-result.txt",
  ]){
    const changed={...f.artifacts,[name]:Buffer.from("replaced\n")};
    assert.throws(()=>auditOfflineRuntimeObservations({
      ...f,artifacts:changed,
    }),/contradicts/);
  }
  const missing=fixture();
  delete missing.sidecars["runtime-guest.json"];
  assert.throws(()=>auditOfflineRuntimeObservations(missing),/Missing or unexpected/);
  const extra=fixture("guest-vsock");
  extra.sidecars["runtime-timeout.json"]=Buffer.from("{}\n");
  assert.throws(()=>auditOfflineRuntimeObservations(extra),/Missing or unexpected/);
});
test("sidecars must be canonical, bounded, time correlated and unambiguous",()=>{
  const bad=[
    x=>Buffer.concat([x,Buffer.from("\n")]),
    x=>Buffer.from(x.toString("utf8").trim()),
    x=>Buffer.alloc(4097,0x41),
    x=>Buffer.from('{"schemaVersion":1,"schemaVersion":1}\n'),
    x=>Buffer.from("not json"),
    x=>Buffer.alloc(0),
  ];
  for(const fn of bad){
    const f=fixture();
    f.sidecars["runtime-cgroup.json"]=fn(f.sidecars["runtime-cgroup.json"]);
    assert.throws(()=>auditOfflineRuntimeObservations(f));
  }
  for(const timestamp of [
    "2026-11-23T11:05:00.000Z",
    "2026-11-23T10:25:00.000Z",
    "2026-11-20T10:45:00.000Z",
    "2026-11-23T10:45:00Z",
    "2026-02-30T10:00:00.000Z",
  ]){
    const f=fixture();
    mutate(f,"runtime-cgroup.json",x=>{x.capturedAt=timestamp;});
    assert.throws(()=>auditOfflineRuntimeObservations(f));
  }
});
test("different trusted operator signer or modified signed receipt fails",()=>{
  const f=fixture(),other=fixture();
  assert.throws(()=>auditOfflineRuntimeObservations({
    ...f,operatorPublicPem:other.operatorPublicPem,
  }));
  assert.throws(()=>auditOfflineRuntimeObservations({
    ...f,operatorFingerprint:other.operatorFingerprint,
  }));
  const forged=structuredClone(f.operatorReport);
  forged.payload.observed.teardownVerified=false;
  assert.throws(()=>auditOfflineRuntimeObservations({
    ...f,operatorReport:forged,
  }));
});
test("new audit is read-only, no KVM and requires already signed decision",async()=>{
  const [cli,review,workflow]=await Promise.all([
    readFile(new URL("../scripts/cyber-range-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL("../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL("../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(cli,/--audit-runtime/);
  assert.match(review,/verifySignedReviewDisposition/);
  assert.match(review,/auditOfflineRuntimeObservations/);
  assert.match(workflow,/ctf-firecracker-runtime-observations.test.mjs/);
  assert.doesNotMatch(cli,/createServer|fetch\(|startInstance|https?:\/\//);
  const script=fileURLToPath(new URL(
    "../scripts/cyber-range-independent-review.mjs",import.meta.url));
  const run=spawnSync(process.execPath,[script,
    "--audit-runtime","--session",sessionId,
    "--operator-sha","a".repeat(64),
    "--reviewer-sha","b".repeat(64),
  ],{encoding:"utf8",env:{PATH:process.env.PATH}});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Offline case review refused/);
});
