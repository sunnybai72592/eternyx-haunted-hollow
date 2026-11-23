import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,generateKeyPairSync,
} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
  createOperatorHandoff,verifyOperatorHandoff,canonicalHandoffBytes,
  exportOperatorHandoff,importOperatorHandoff,
} from "../infrastructure/cyber-range/provider/firecracker-operator-handoff.mjs";
import {createSignedOperatorEvidence} from
  "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const config={
  sessionId,uid:22001,gid:22001,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function keys(){
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicKeyPem:publicKey.export({format:"pem",type:"spki"}).toString(),
    fingerprint:createHash("sha256").update(publicKey.export({
      format:"der",type:"spki",
    })).digest("hex"),
  };
}
const modes=["guest-vsock","watchdog-900","guest-and-watchdog"];
function fixture(mode="guest-and-watchdog",key=keys()){
  const guest=mode.includes("guest"),expiry=mode.includes("watchdog");
  const result={
    sessionId,unit:supervisedVmUnit(sessionId),
    accepted:true,teardownVerified:true,bootApiAccepted:true,
    offlineNetnsAttested:true,localKvmGuestObserved:true,
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
  const receipt=createSignedOperatorEvidence({
    config,result,mode,capturedAt:"2026-11-22T23:00:00.000Z",
    privateKeyPem:key.privateKeyPem,publicKeyPem:key.publicKeyPem,
    trustedPublicFingerprint:key.fingerprint,
  });
  return {
    receipt,publicPem:key.publicKeyPem,
    trustedOperatorFingerprint:key.fingerprint,key,
  };
}
function make(mode){
  const input=fixture(mode);
  const handoff=createOperatorHandoff({
    operatorReport:input.receipt,
    operatorPublicPem:input.publicPem,
    trustedOperatorFingerprint:input.trustedOperatorFingerprint,
  });
  return {...input,...handoff};
}
const clone=value=>JSON.parse(JSON.stringify(value));
function verify(data,env,expectedSha=env.transportSha256){
  return verifyOperatorHandoff(data,{
    expectedSessionId:sessionId,
    trustedOperatorFingerprint:env.trustedOperatorFingerprint,
    expectedTransportSha256:expectedSha,
  });
}

test("all signed operator modes round-trip a canonical bounded handoff",()=>{
  for(const mode of modes){
    const handoff=make(mode);
    const {envelope,transportSha256,bytes}=handoff;
    assert.equal(envelope.mode,mode);
    assert.equal(envelope.sessionId,sessionId);
    assert.equal(envelope.claims.operatorSelfReported,true);
    assert.equal(envelope.claims.independentSourcesIncluded,false);
    assert.equal(envelope.claims.hardwareAttested,false);
    assert.equal(envelope.claims.publicLabsEnabled,false);
    assert.equal(envelope.claims.productionReady,false);
    assert.ok(bytes.equals(canonicalHandoffBytes(envelope)));
    assert.equal(transportSha256,createHash("sha256").update(bytes).digest("hex"));
    const v=verify(envelope,handoff);
    assert.equal(v.operatorSignatureVerified,true);
    assert.equal(v.operatorKeyPinned,true);
    assert.equal(v.externalTransportDigestVerified,true);
    assert.equal(v.independentSourcesIncluded,false);
    assert.equal(v.productionReady,false);
    assert.equal(v.publicLabsEnabled,false);
    assert.equal(v.mode,mode);
  }
});

test("a separately obtained transfer SHA is required for provenance of bytes",()=>{
  const h=make("guest-vsock");
  assert.throws(()=>verify(h.envelope,h,"f".repeat(64)),/transport digest/);
  const v=verifyOperatorHandoff(h.envelope,{
    expectedSessionId:sessionId,
    trustedOperatorFingerprint:h.trustedOperatorFingerprint,
  });
  assert.equal(v.externalTransportDigestVerified,false);
  assert.equal(v.operatorSignatureVerified,true);
  assert.notEqual(v.operatorKeyPinned,false);
  assert.throws(()=>verify(h.envelope,h,"bad"),/transport digest/);
});

test("tamper, replay and unsupported claims fail before handoff verification",()=>{
  const h=make("guest-and-watchdog");
  const modifications=[
    e=>e.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    e=>e.mode="guest-vsock",
    e=>e.operatorSignerFingerprint="f".repeat(64),
    e=>e.operatorReportSha256="f".repeat(64),
    e=>e.claims.hardwareAttested=true,
    e=>e.claims.productionReady=true,
    e=>e.claims.publicLabsEnabled=true,
    e=>e.claims.independentSourcesIncluded=true,
    e=>e.claims.operatorSelfReported=false,
    e=>e.claims.extra="unapproved",
    e=>e.extra="unapproved",
    e=>e.operatorReport.payload.observed.teardownVerified=false,
    e=>e.operatorReport.payload.baseline.payload.pins.kernelSha256=
      "d".repeat(64),
    e=>e.operatorReport.signature="A".repeat(86),
  ];
  for(const modify of modifications){
    const altered=clone(h.envelope);
    modify(altered);
    assert.throws(()=>verify(altered,h));
  }
  assert.throws(()=>verifyOperatorHandoff(h.envelope,{
    expectedSessionId:"c726a7dc-4e18-4113-bf51-d7147c581002",
    trustedOperatorFingerprint:h.trustedOperatorFingerprint,
    expectedTransportSha256:h.transportSha256,
  }));
});
test("a swapped public key or a hostile signing key cannot be self-trusted",()=>{
  const h=make("guest-vsock");
  const replacement=keys();
  assert.throws(()=>createOperatorHandoff({
    operatorReport:h.receipt,
    operatorPublicPem:replacement.publicKeyPem,
    trustedOperatorFingerprint:h.trustedOperatorFingerprint,
  }),/Unpinned/);
  assert.throws(()=>createOperatorHandoff({
    operatorReport:h.receipt,
    operatorPublicPem:h.publicPem,
    trustedOperatorFingerprint:replacement.fingerprint,
  }),/Unpinned/);
  const altered=clone(h.envelope);
  altered.operatorPublicPem=replacement.publicKeyPem;
  assert.throws(()=>verify(altered,h));
  const privateLeak=clone(h.envelope);
  privateLeak.operatorPublicPem=h.key.privateKeyPem;
  assert.throws(()=>verify(privateLeak,h),/public PEM/);
});
test("handoff cannot smuggle raw logs or oversized payloads in extra fields",()=>{
  const h=make();
  const rogue=clone(h.envelope);
  rogue["supervisor-journal.txt"]="fixture raw log";
  assert.throws(()=>canonicalHandoffBytes(rogue),/Malformed/);
  assert.throws(()=>verify(rogue,h));
  const huge=clone(h.envelope);
  huge.operatorPublicPem="A".repeat(30_000);
  assert.throws(()=>canonicalHandoffBytes(huge),/exceeds bounded size/);
  assert.throws(()=>verify(huge,h));
  assert.doesNotMatch(h.bytes.toString(),/PRIVATE KEY|supervisor-journal\.txt/);
});
test("operator/reviewer production directory overrides are refused",async()=>{
  await assert.rejects(exportOperatorHandoff({
    sessionId,trustedOperatorFingerprint:"a".repeat(64),
    evidenceDir:"/tmp/untrusted-receipts",
  }),/Unsafe operator handoff directory/);
  await assert.rejects(importOperatorHandoff({
    sessionId,trustedOperatorFingerprint:"a".repeat(64),
    expectedTransportSha256:"b".repeat(64),
    caseDir:"/tmp/untrusted-reviews",
  }),/Unsafe operator handoff directory/);
});
test("CLI transfer and import both deny execution without explicit approvals",()=>{
  const script=fileURLToPath(new URL(
    "../scripts/cyber-range-operator-handoff.mjs",import.meta.url));
  const options=["--session",sessionId,"--operator-sha","a".repeat(64)];
  for(const args of [
    ["--export","--confirm-offline-transfer",...options],
    ["--import","--confirm-offline-receipt",...options,
      "--transport-sha","b".repeat(64)],
  ]){
    const r=spawnSync(process.execPath,[script,...args],{
      encoding:"utf8",env:{PATH:process.env.PATH},
    });
    assert.equal(r.status,1);
    assert.match(r.stderr,/Offline signed receipt handoff refused/);
    assert.doesNotMatch(r.stdout,/operatorReport|privateKey/);
  }
});
test("CI and CLI remain completely offline and preserve human source review",async()=>{
  const [cli,module,workflow]=await Promise.all([
    readFile(new URL(
      "../scripts/cyber-range-operator-handoff.mjs",import.meta.url),"utf8"),
    readFile(new URL(
      "../infrastructure/cyber-range/provider/firecracker-operator-handoff.mjs",
      import.meta.url),"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  for(const flag of ["--export","--inspect","--import","--verify-import"])
    assert.ok(cli.includes(flag));
  assert.match(cli,/ETERNYX_OFFLINE_HANDOFF_ACK/);
  assert.match(module,/O_EXCL/);
  assert.match(module,/O_NOFOLLOW/);
  assert.match(module,/fd\.sync/);
  assert.match(workflow,/ctf-firecracker-operator-handoff.test.mjs/);
  assert.doesNotMatch(cli,/createServer|fetch\(|https?:\/\/|startInstance/);
  assert.doesNotMatch(module,/createServer|fetch\(|https?:\/\/|startInstance/);
});
