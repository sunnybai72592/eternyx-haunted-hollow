import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  requireLocalHardwareApproval,approvedHardwareManifest,
  auditOfflineHardwareHost,waitForJailedFirecrackerSocket,
  runOfflineHardwareAcceptance,
} from "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";

const session="123e4567-e89b-42d3-a456-426614174001";
const manifest=()=>approvedHardwareManifest({
  kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
});
const approval=()=>({
  platform:"linux",uid:0,
  env:{
    ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE:"I_APPROVE_LOCAL_OFFLINE_KVM_TEST",
    ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved",
    ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS",
  },
});
const base=()=>({
  sessionId:session,manifest:manifest(),uid:22001,gid:22001,
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
});
const preflight=()=>({
  verified:true,loopbackOnly:true,pinnedHostExecutables:true,
  pinnedGuestImages:true,readyForPublicHostedLabs:false,
});
function fakeSupervisor({invalidReceipt=false,attestUnsafe=false,teardownUnproven=false}={}){
  const events=[];
  let active=false;
  return {
    events,get active(){return active;},
    async launchJailer(){
      events.push("launch");
      active=true;
      return invalidReceipt?{launched:true,localOnly:false}:{
        launched:true,localOnly:true,guestNotBooted:true,
        cloudProvisioningAllowed:false,
      };
    },
    async attest(){
      events.push("attest");
      return {jailed:true,hostNetworkDenied:!attestUnsafe,
        externalWatchdogArmed:true,cgroupEnforced:true,
        cloudProvisioningAllowed:false};
    },
    async armTimeout(){events.push("arm");return{armed:true,maxSeconds:900};},
    async terminate(){
      events.push("kill");
      active=teardownUnproven?true:false;
    },
    async verifyDead(){events.push("dead");return !active;},
  };
}
function runArgs(supervisor,overrides={}){
  return {
    ...base(),approval:approval(),supervisor,
    audit:async()=>({audited:true}),
    socketReady:async()=>"/srv/eternyx-firecracker/firecracker/fake/root/run/firecracker.socket",
    boot:async()=>({
      started:true,networkInterfaces:0,cloudProvisioningAllowed:false,
      readyForPublicHostedLabs:false,
    }),
    pause:async()=>{},
    ...overrides,
  };
}

test("immutable offline manifest has no network, metadata, snapshots or public runtime",()=>{
  const m=manifest();
  assert.equal(m.memoryMiB,256);
  assert.equal(m.maxRuntimeSeconds,900);
  assert.equal(m.networkIngress,"vsock-only");
  assert.equal(m.egressPolicy,"deny-all");
  assert.equal(m.metadataAccess,"blocked");
  assert.equal(m.rootfsReadOnly,true);
  assert.throws(()=>approvedHardwareManifest({
    kernelSha256:"unsafe",rootfsSha256:"b".repeat(64),
  }));
});

test("KVM hardware approval requires root plus three independent literal flags",()=>{
  assert.equal(requireLocalHardwareApproval(approval()),true);
  for(const adjust of [
    o=>o.uid=1000,o=>o.platform="darwin",
    o=>delete o.env.ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE,
    o=>o.env.ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE="yes",
    o=>o.env.ETERNYX_FIRECRACKER_HOST_EXECUTION="",
    o=>o.env.ETERNYX_RANGE_OPERATOR_ACK="",
    o=>o.env.ETERNYX_RANGE_RUNTIME="firecracker",
    o=>o.env.ETERNYX_RANGE_RUNTIME="cloud",
  ]){
    const a=approval();adjust(a);
    assert.throws(()=>requireLocalHardwareApproval(a));
  }
});

test("read-only audit accepts only real host preflight receipts",async()=>{
  let count=0;
  const result=await auditOfflineHardwareHost({
    ...base(),hostCheck:async p=>{
      count++;
      assert.equal(p.sessionId,session);
      assert.equal(p.jailBase,"/srv/eternyx-firecracker");
      return preflight();
    },
  });
  assert.equal(count,1);
  assert.deepEqual(result,{
    audited:true,sessionId:session,offlineOnly:true,guestBooted:false,
    publicLabsEnabled:false,cloudProvisioningAllowed:false,
  });
  for(const receipt of [null,{},{
    ...preflight(),loopbackOnly:false,
  },{
    ...preflight(),readyForPublicHostedLabs:true,
  }]){
    await assert.rejects(auditOfflineHardwareHost({
      ...base(),hostCheck:async()=>receipt,
    }),/preflight/);
  }
});

test("bounded API-socket readiness waits only for a real Unix socket",async()=>{
  let n=0;
  const socket=await waitForJailedFirecrackerSocket({
    sessionId:session,lookup:async()=>{
      n++;
      if(n<3){const e=Error("missing");e.code="ENOENT";throw e;}
      return {isSocket:()=>true};
    },
    pause:async()=>{},
  });
  assert.equal(n,3);
  assert.ok(socket.endsWith("/run/firecracker.socket"));
  await assert.rejects(waitForJailedFirecrackerSocket({
    sessionId:session,lookup:async()=>({isSocket:()=>false}),
    pause:async()=>{},
  }),/not a socket/);
});

test("absent API socket stops at fixed timeout; a canceled request aborts",async()=>{
  let n=0;
  await assert.rejects(waitForJailedFirecrackerSocket({
    sessionId:session,lookup:async()=>{
      n++;const e=Error("missing");e.code="ENOENT";throw e;
    },pause:async()=>{},
  }),/never became available/);
  assert.equal(n,30);
  const controller=new AbortController();controller.abort();
  await assert.rejects(waitForJailedFirecrackerSocket({
    sessionId:session,signal:controller.signal,
    lookup:async()=>({isSocket:()=>true}),
  }),/cancelled/);
});

test("accepted local guest boot is observed and ALWAYS terminated before success",async()=>{
  const supervisor=fakeSupervisor();
  const result=await runOfflineHardwareAcceptance(runArgs(supervisor));
  assert.deepEqual(result,{
    accepted:true,sessionId:session,
    unit:"eternyx-fc-cr-"+session.replaceAll("-","")+".service",
    bootApiAccepted:true,offlineNetnsAttested:true,
    independentDeadlineSeconds:900,localKvmGuestObserved:true,
    publicLabsEnabled:false,cloudProvisioningAllowed:false,
    providerHardLimitVerified:false,teardownVerified:true,
  });
  assert.deepEqual(supervisor.events,["launch","attest","attest","kill","dead"]);
  assert.equal(supervisor.active,false);
});

test("a missing operator approval never launches anything",async()=>{
  const supervisor=fakeSupervisor();
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor,{
    approval:{env:{},platform:"linux",uid:0},
  })),/not approved/);
  assert.deepEqual(supervisor.events,[]);
});

test("a preflight failure cannot launch a jailer",async()=>{
  const supervisor=fakeSupervisor();
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor,{
    audit:async()=>{throw Error("unsafe root namespace");},
  })),/unsafe root namespace/);
  assert.deepEqual(supervisor.events,[]);
});

test("even a malformed successful systemd receipt triggers termination",async()=>{
  const supervisor=fakeSupervisor({invalidReceipt:true});
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor)),
    /hardware acceptance failed/);
  assert.deepEqual(supervisor.events,["launch","kill","dead"]);
  assert.equal(supervisor.active,false);
});

test("failed socket readiness and failed guest boot always terminate",async()=>{
  for(const variation of [
    {socketReady:async()=>{throw Error("no socket");}},
    {boot:async()=>{throw Error("boot API inaccessible");}},
    {boot:async()=>({started:true,networkInterfaces:1,
      cloudProvisioningAllowed:false,readyForPublicHostedLabs:false})},
  ]){
    const supervisor=fakeSupervisor();
    await assert.rejects(runOfflineHardwareAcceptance(
      runArgs(supervisor,variation)),/hardware acceptance failed/);
    assert.ok(supervisor.events.includes("kill"));
    assert.ok(supervisor.events.includes("dead"));
    assert.equal(supervisor.active,false);
  }
});

test("unsafe changed host attestation after boot always terminates",async()=>{
  const supervisor=fakeSupervisor({attestUnsafe:true});
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor)),
    /hardware acceptance failed/);
  assert.ok(supervisor.events.includes("kill"));
  assert.equal(supervisor.active,false);
});

test("VM dying during observation is rejected before success and cleaned",async()=>{
  const supervisor=fakeSupervisor();
  let attests=0;
  const original=supervisor.attest;
  supervisor.attest=async(id)=>{
    attests++;
    if(attests===2)return{
      jailed:false,hostNetworkDenied:true,externalWatchdogArmed:true,
      cgroupEnforced:true,cloudProvisioningAllowed:false,
    };
    return original(id);
  };
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor)),
    /hardware acceptance failed/);
  assert.equal(attests,2);
  assert.equal(supervisor.active,false);
  assert.ok(supervisor.events.includes("kill"));
});

test("unconfirmed cgroup death never reports successful acceptance",async()=>{
  const supervisor=fakeSupervisor({teardownUnproven:true});
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor)),
    /teardown unproven; immediate operator intervention required/);
  assert.equal(supervisor.active,true);
  assert.deepEqual(supervisor.events,["launch","attest","kill","dead"]);
});

test("operator SIGINT abort during observation still executes shutdown",async()=>{
  const supervisor=fakeSupervisor();
  const controller=new AbortController();
  await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor,{
    signal:controller.signal,pause:async()=>{
      controller.abort();
    },
  })),/hardware acceptance failed/);
  assert.deepEqual(supervisor.events,["launch","attest","kill","dead"]);
  assert.equal(supervisor.active,false);
});

test("invalid session, user root, stale hashes cannot ever launch",async()=>{
  const bad=[
    {sessionId:"bad"},{uid:0},{gid:0},
    {jailerSha256:"unverified"},{firecrackerSha256:"a".repeat(63)},
    {manifest:{...manifest(),egressPolicy:"allow"}},
  ];
  for(const item of bad){
    const supervisor=fakeSupervisor();
    await assert.rejects(runOfflineHardwareAcceptance(runArgs(supervisor,item)));
    assert.deepEqual(supervisor.events,[]);
  }
});

test("hardware acceptance remains manual-only and cannot enable cloud services",async()=>{
  const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
  const [engine,cli,pkg]=await Promise.all([
    read("infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs"),
    read("scripts/cyber-range-microvm-hardware-acceptance.mjs"),
    read("package.json"),
  ]);
  assert.match(engine,/requireLocalHardwareApproval/);
  assert.match(engine,/bootJailedMicrovm/);
  assert.match(engine,/verifyDead/);
  assert.match(engine,/cloudProvisioningAllowed:false/);
  assert.match(cli,/--confirm-local-kvm/);
  assert.match(cli,/--verify-stopped/);
  assert.equal(JSON.parse(pkg).scripts["range:microvm:hardware"],
    "node scripts/cyber-range-microvm-hardware-acceptance.mjs");
  assert.doesNotMatch(engine,/createServer|cloudProvisioningAllowed:true|aws-sdk|fetch\(/);
  assert.doesNotMatch(cli,/createServer|setInterval|cloudProvisioningAllowed:true/);
});
