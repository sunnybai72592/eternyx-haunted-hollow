import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {chmod,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {
  createSignedOperatorEvidence,verifySignedOperatorEvidence,
  recordSignedOperatorEvidence,readSignedOperatorEvidence,
} from "../infrastructure/cyber-range/provider/firecracker-operator-evidence.mjs";
import {approvedHardwareManifest,runOfflineHardwareAcceptance} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const session="123e4567-e89b-42d3-a456-426614174001";
const config={
  sessionId:session,
  manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),
  uid:22001,gid:22001,
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
const completed={
  sessionId:session,unit:supervisedVmUnit(session),
  accepted:true,bootApiAccepted:true,offlineNetnsAttested:true,
  localKvmGuestObserved:true,teardownVerified:true,
  independentDeadlineSeconds:900,publicLabsEnabled:false,
  cloudProvisioningAllowed:false,providerHardLimitVerified:false,
};
const modes={
  "guest-vsock":{
    guestServiceFunctional:true,guestChallengeResponseVerified:true,
  },
  "watchdog-900":{
    full900SecondExpiryObserved:true,
    systemdTimeoutResultVerified:true,noCgroupDescendants:true,
  },
  "guest-and-watchdog":{
    guestServiceFunctional:true,guestChallengeResponseVerified:true,
    full900SecondExpiryObserved:true,
    systemdTimeoutResultVerified:true,noCgroupDescendants:true,
  },
};
const at="2026-11-22T21:00:00.000Z";
function keyMaterial(){
  const keys=generateKeyPairSync("ed25519");
  const privateKeyPem=keys.privateKey.export({format:"pem",type:"pkcs8"}).toString();
  const publicKeyPem=keys.publicKey.export({format:"pem",type:"spki"}).toString();
  const trustedPublicFingerprint=createHash("sha256").update(
    keys.publicKey.export({format:"der",type:"spki"}),
  ).digest("hex");
  return {privateKeyPem,publicKeyPem,trustedPublicFingerprint};
}
function signed(mode,k=keyMaterial()){
  const report=createSignedOperatorEvidence({
    config,result:{...completed,...modes[mode]},mode,
    ...k,capturedAt:at,
  });
  return {report,k};
}
function inspect(report,k){
  return verifySignedOperatorEvidence(report,{
    publicKeyPem:k.publicKeyPem,
    trustedPublicFingerprint:k.trustedPublicFingerprint,
    expectedSessionId:session,
  });
}
const clone=x=>JSON.parse(JSON.stringify(x));

test("v2 separately signed modes bind v1 offline smoke and keep public labs disabled",()=>{
  for(const mode of Object.keys(modes)){
    const {report,k}=signed(mode);
    const verified=inspect(report,k);
    assert.equal(verified.signatureVerified,true);
    assert.equal(verified.pinnedPublicKeyVerified,true);
    assert.equal(verified.mode,mode);
    assert.equal(verified.productionReady,false);
    assert.equal(verified.independentHostAttestation,false);
    assert.equal(report.payload.baseline.payload.unit,supervisedVmUnit(session));
    assert.equal(report.payload.baseline.payload.notVerified.full900SecondExpiryDrill,false);
    assert.equal(report.payload.notVerified.providerEnforcedBillingCap,false);
    assert.equal(report.payload.notVerified.publicLabsEnabled,false);
    assert.equal(verified.guestServiceOperatorReported,mode.includes("guest"));
    assert.equal(verified.expiryDrillOperatorReported,mode.includes("watchdog"));
  }
});
test("reject missing outcome details, unverified cleanup and false additional claims",()=>{
  for(const mode of Object.keys(modes)){
    const k=keyMaterial();
    const result={...completed,...modes[mode]};
    for(const change of [
      {teardownVerified:false},{accepted:false},{publicLabsEnabled:true},
      {providerHardLimitVerified:true},
      ...(mode.includes("guest")?[{guestChallengeResponseVerified:false},
        {guestServiceFunctional:false}]:[]),
      ...(mode.includes("watchdog")?[{systemdTimeoutResultVerified:false},
        {noCgroupDescendants:false}]:[]),
    ]){
      assert.throws(()=>createSignedOperatorEvidence({
        config,result:{...result,...change},mode,...k,
      }));
    }
  }
  const k=keyMaterial();
  assert.throws(()=>createSignedOperatorEvidence({
    config,result:{...completed,...modes["guest-vsock"]},
    mode:"something else",...k,
  }));
  assert.throws(()=>createSignedOperatorEvidence({
    config,result:{...completed,...modes["guest-vsock"]},
    mode:"watchdog-900",...k,
  }));
  assert.throws(()=>createSignedOperatorEvidence({
    config,result:completed,mode:"guest-vsock",...k,
  }));
});
test("public key must match independently supplied SPKI digest and private key",()=>{
  const k=keyMaterial(),other=keyMaterial();
  assert.throws(()=>createSignedOperatorEvidence({
    config,result:{...completed,...modes["guest-vsock"]},
    mode:"guest-vsock",...k,
    trustedPublicFingerprint:other.trustedPublicFingerprint,
  }),/pinned/);
  assert.throws(()=>createSignedOperatorEvidence({
    config,result:{...completed,...modes["guest-vsock"]},
    mode:"guest-vsock",...k,publicKeyPem:other.publicKeyPem,
  }),/pinned/);
  const {report}=signed("guest-vsock",k);
  assert.throws(()=>verifySignedOperatorEvidence(report,{
    publicKeyPem:other.publicKeyPem,
    trustedPublicFingerprint:k.trustedPublicFingerprint,
  }),/pinned/);
  assert.throws(()=>verifySignedOperatorEvidence(report,{
    publicKeyPem:k.publicKeyPem,trustedPublicFingerprint:"f".repeat(64),
  }),/pinned/);
});
test("signed evidence fails on tampered session, mode, pins, observation or signature",()=>{
  const {report,k}=signed("guest-and-watchdog");
  for(const edit of [
    r=>r.payload.mode="guest-vsock",
    r=>r.payload.sessionId="c726a7dc-4e18-4113-bf51-d7147c581002",
    r=>r.payload.observed.teardownVerified=false,
    r=>r.payload.baseline.payload.pins.jailerSha256="e".repeat(64),
    r=>r.payload.notVerified.independentHostAttestation=true,
    r=>r.payload.extra="unsafe claim",
    r=>r.signature="A".repeat(86),
    r=>r.payload.capturedAt="2027-11-22T21:00:00.000Z",
  ]){
    const copy=clone(report);edit(copy);
    assert.throws(()=>inspect(copy,k));
  }
  assert.throws(()=>verifySignedOperatorEvidence(report,{
    publicKeyPem:k.publicKeyPem,
    trustedPublicFingerprint:k.trustedPublicFingerprint,
    expectedSessionId:"c726a7dc-4e18-4113-bf51-d7147c581002",
  }));
});

async function createTempKeyStore(fn){
  const dir=await mkdtemp(join(tmpdir(),"eternyx-operator-signed-"));
  const keys=keyMaterial();
  const privatePath=join(dir,"operator-private.pem");
  const publicPath=join(dir,"operator-public.pem");
  try{
    await chmod(dir,0o700);
    await writeFile(privatePath,keys.privateKeyPem,{mode:0o600,flag:"wx"});
    await writeFile(publicPath,keys.publicKeyPem,{mode:0o644,flag:"wx"});
    const opts={
      dir,privatePath,publicPath,owner:process.getuid(),
      trustedPublicFingerprint:keys.trustedPublicFingerprint,
    };
    return await fn({opts,keys,dir,privatePath,publicPath});
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
}
test("root-private exclusive signed evidence roundtrip and no overwrite",async()=>{
  await createTempKeyStore(async({opts,dir})=>{
    const result={...completed,...modes["guest-and-watchdog"]};
    const status=await recordSignedOperatorEvidence({
      config,result,mode:"guest-and-watchdog",...opts,
    });
    assert.equal(status.signatureRecorded,true);
    assert.equal(status.publicLabsEnabled,false);
    const path=join(dir,session+".v2-signed.json");
    const contents=JSON.parse(await readFile(path,"utf8"));
    assert.equal(contents.payload.sessionId,session);
    const verified=await readSignedOperatorEvidence({
      sessionId:session,...opts,
    });
    assert.equal(verified.signatureVerified,true);
    assert.equal(verified.productionReady,false);
    await assert.rejects(recordSignedOperatorEvidence({
      config,result,mode:"guest-and-watchdog",...opts,
    }),/EEXIST|exist/i);
  });
});
test("private key group access, symlink and writable storage fail closed",async()=>{
  await createTempKeyStore(async({opts,dir,privatePath,publicPath})=>{
    await chmod(privatePath,0o644);
    await assert.rejects(recordSignedOperatorEvidence({
      config,result:{...completed,...modes["guest-vsock"]},
      mode:"guest-vsock",...opts,
    }),/Untrusted operator key/);
    await chmod(privatePath,0o600);
    const target=join(dir,"real-private.pem");
    const alias=join(dir,"alias-private.pem");
    await writeFile(target,(await readFile(privatePath,"utf8")),{
      mode:0o600,flag:"wx",
    });
    await symlink(target,alias);
    await assert.rejects(recordSignedOperatorEvidence({
      config,result:{...completed,...modes["guest-vsock"]},
      mode:"guest-vsock",...opts,privatePath:alias,
    }),/Untrusted operator key/);
    await chmod(dir,0o777);
    await assert.rejects(readSignedOperatorEvidence({
      sessionId:session,...opts,
    }),/directory is not private/);
    await chmod(dir,0o700);
    await chmod(publicPath,0o666);
    await assert.rejects(recordSignedOperatorEvidence({
      config,result:{...completed,...modes["guest-vsock"]},
      mode:"guest-vsock",...opts,
    }),/Untrusted operator key/);
  });
});
test("post-boot outcomes retained only for the verified selected mode",async()=>{
  const supervisor={
    async launchJailer(){return {
      launched:true,localOnly:true,guestNotBooted:true,
      cloudProvisioningAllowed:false,
    };},
    async attest(){return {
      jailed:true,hostNetworkDenied:true,externalWatchdogArmed:true,
      cgroupEnforced:true,cloudProvisioningAllowed:false,
    };},
    async armTimeout(){return{armed:true,maxSeconds:900};},
    async terminate(){return{requested:true};},
    async verifyDead(){return true;},
    async verifyTimedOut(){return true;},
  };
  const approval={
    platform:"linux",uid:0,env:{
      ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE:"I_APPROVE_LOCAL_OFFLINE_KVM_TEST",
      ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved",
      ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS",
      ETERNYX_FIRECRACKER_EXPIRY_DRILL:
        "I_APPROVE_LOCAL_900_SECOND_WATCHDOG_DRILL",
    },
  };
  const value=await runOfflineHardwareAcceptance({
    ...config,supervisor,approval,guestProbeEnabled:true,expiryDrill:true,
    audit:async()=>({audited:true}),socketReady:async()=>"/fake/socket",
    boot:async()=>({
      started:true,networkInterfaces:0,cloudProvisioningAllowed:false,
      readyForPublicHostedLabs:false,
    }),
    guestProbe:async()=>({
      guestServiceFunctional:true,challengeResponseVerified:true,
      localVsockOnly:true,
    }),
    observeExpiry:async()=>({
      expiryDrillVerified:true,systemdTimeoutResultVerified:true,
      noCgroupDescendants:true,
    }),
    pause:async()=>{},now:()=>400,
  });
  assert.equal(value.guestChallengeResponseVerified,true);
  assert.equal(value.systemdTimeoutResultVerified,true);
  assert.equal(value.noCgroupDescendants,true);
  const {report,k}=signed("guest-and-watchdog");
  assert.equal(inspect(report,k).signatureVerified,true);
});
test("unapproved CLI cannot create signed evidence or run hardware",()=>{
  const script=new URL(
    "../scripts/cyber-range-microvm-hardware-acceptance.mjs",import.meta.url);
  const result=spawnSync(process.execPath,[script.pathname,
    "--run","--confirm-local-kvm","--probe-guest","--save-signed-evidence-v2",
    "--session",session,"--uid","22001","--gid","22001",
    "--kernel-sha","a".repeat(64),"--rootfs-sha","b".repeat(64),
    "--jailer-sha","c".repeat(64),"--firecracker-sha","d".repeat(64),
    "--trusted-pubkey-sha","e".repeat(64),
  ],{encoding:"utf8",env:{PATH:process.env.PATH}});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Local KVM acceptance denied or failed/);
});
