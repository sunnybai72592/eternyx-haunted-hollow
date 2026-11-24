import test from "node:test";
import assert from "node:assert/strict";
import {createServer,createConnection} from "node:net";
import {randomBytes} from "node:crypto";
import {chmod,mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  guestProbeDigest,probeOfflineGuest,verifyGuestProbeResponse,
  GUEST_PROBE_PORT,
} from "../infrastructure/cyber-range/provider/firecracker-guest-probe.mjs";
import {
  observeIndependentExpiry,requireLocalExpiryDrillApproval,
} from "../infrastructure/cyber-range/provider/firecracker-expiry-drill.mjs";
import {runOfflineHardwareAcceptance,approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit,supervisedUnitSpec} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const challengeNonce="9".repeat(64);
const safeAttestation=()=>({
  jailed:true,supervisorOwned:true,hostNetworkDenied:true,
  metadataDenied:true,externalWatchdogArmed:true,cgroupEnforced:true,
  cloudProvisioningAllowed:false,
});
const approval=()=>({
  platform:"linux",uid:0,
  env:{
    ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE:"I_APPROVE_LOCAL_OFFLINE_KVM_TEST",
    ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved",
    ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS",
    ETERNYX_FIRECRACKER_EXPIRY_DRILL:"I_APPROVE_LOCAL_900_SECOND_WATCHDOG_DRILL",
  },
});
const config={
  sessionId,manifest:approvedHardwareManifest({
    kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
  }),uid:22001,gid:22001,
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
function fakeSupervisor(){
  const actions=[];
  let live=true;
  return {
    actions,get live(){return live;},
    async launchJailer(){
      actions.push("launch");live=true;
      return {launched:true,localOnly:true,guestNotBooted:true,
        cloudProvisioningAllowed:false};
    },
    async attest(){actions.push("attest");return safeAttestation();},
    async armTimeout(){return {armed:true,maxSeconds:900};},
    async terminate(){actions.push("terminate");live=false;},
    async verifyDead(){actions.push("verifyDead");return !live;},
    async verifyTimedOut(){actions.push("timeoutResult");return true;},
  };
}
function acceptanceArgs(supervisor,extra={}){
  return {
    ...config,supervisor,approval:approval(),audit:async()=>({audited:true}),
    socketReady:async()=>"/srv/eternyx-firecracker/fake.socket",
    boot:async()=>({started:true,networkInterfaces:0,
      cloudProvisioningAllowed:false,readyForPublicHostedLabs:false}),
    pause:async()=>{},...extra,
  };
}

test("fresh session-bound digest rejects malformed or replayed responses",()=>{
  const expected=guestProbeDigest(sessionId,challengeNonce);
  const response={protocol:"eternyx-guest-smoke-v1",sessionId,
    nonce:challengeNonce,digest:expected,guestHealthy:true};
  assert.equal(expected.length,64);
  assert.equal(verifyGuestProbeResponse(response,
    {sessionId,nonce:challengeNonce}),true);
  for(const mutation of [
    {digest:"0".repeat(64)},{guestHealthy:false},{sessionId:"bad"},
    {nonce:"1".repeat(64)},{protocol:"other"},{extra:"no"},
  ]){
    assert.throws(()=>verifyGuestProbeResponse({...response,...mutation},
      {sessionId,nonce:challengeNonce}),/Untrusted/);
  }
  assert.throws(()=>guestProbeDigest("not-a-session",challengeNonce));
  assert.throws(()=>guestProbeDigest(sessionId,"bad"));
});

async function withGuestUnixServer(handle,run){
  const dir=await mkdtemp(join(tmpdir(),"eternyx-vsock-probe-"));
  const path=join(dir,"socket");
  const openSockets=new Set();
  const server=createServer(socket=>{
    openSockets.add(socket);
    socket.on("close",()=>openSockets.delete(socket));
    let phase=0;
    socket.on("data",chunk=>{
      if(phase===0){
        assert.equal(chunk.toString("utf8"),"CONNECT "+GUEST_PROBE_PORT+"\n");
        phase=1;
        socket.write(handle.handshake??"OK 1073741824\n");
      }else{
        const request=JSON.parse(chunk.toString("utf8").trim());
        const reply=handle.reply(request);
        socket.write(JSON.stringify(reply)+"\n");
      }
    });
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once("error",reject);
      server.listen(path,resolve);
    });
    return await run(path);
  }finally{
    for(const socket of openSockets)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
}

test("real local Unix socket sends CONNECT, verifies guest reply and re-attests",async()=>{
  let attests=0;
  const guardian={async attest(){attests++;return safeAttestation();}};
  await withGuestUnixServer({
    reply:request=>({
      ...request,digest:guestProbeDigest(request.sessionId,request.nonce),
      guestHealthy:true,
    }),
  },async path=>{
    const observedPath=[];
    const result=await probeOfflineGuest({
      sessionId,guardian,
      lookup:async p=>{observedPath.push(p);return {isSocket:()=>true};},
      dial:()=>createConnection({path}),
      entropy:()=>Buffer.from(challengeNonce,"hex"),
    });
    assert.deepEqual(result,{
      guestServiceFunctional:true,challengeResponseVerified:true,
      localVsockOnly:true,
    });
    assert.equal(attests,2);
    assert.equal(observedPath.length,1);
    assert.ok(observedPath[0].endsWith("/v.sock"));
  });
});

test("fake guest reply and rejected CONNECT fail closed",async()=>{
  for(const handle of [
    {reply:r=>({...r,digest:"f".repeat(64),guestHealthy:true})},
    {handshake:"ERR 2\n",reply:r=>r},
  ]){
    await withGuestUnixServer(handle,async path=>{
      await assert.rejects(probeOfflineGuest({
        sessionId,guardian:{attest:async()=>safeAttestation()},
        lookup:async()=>({isSocket:()=>true}),
        dial:()=>createConnection({path}),
        entropy:()=>randomBytes(32),
      }),/probe failed/);
    });
  }
});

test("unsafe guardian or non-socket refuses probe before dialing",async()=>{
  let dialed=0;
  await assert.rejects(probeOfflineGuest({
    sessionId,guardian:{attest:async()=>({
      ...safeAttestation(),hostNetworkDenied:false,
    })},
    dial:()=>{dialed++;throw Error("should not dial");},
  }),/Untrusted supervisor/);
  await assert.rejects(probeOfflineGuest({
    sessionId,guardian:{attest:async()=>safeAttestation()},
    lookup:async()=>({isSocket:()=>false}),
    dial:()=>{dialed++;throw Error("should not dial");},
  }),/Expected pinned local/);
  assert.equal(dialed,0);
});

test("normal systemd smoke collects units, deliberate expiry retains Result only",()=>{
  const normal=supervisedUnitSpec(sessionId,config.manifest,config.uid,config.gid);
  const expiry=supervisedUnitSpec(sessionId,config.manifest,config.uid,config.gid,{
    retainTimeoutResult:true,
  });
  assert.ok(normal.argv.includes("--collect"));
  assert.ok(!expiry.argv.includes("--collect"));
  assert.ok(expiry.argv.includes("--property=RuntimeMaxSec=900s"));
  assert.ok(expiry.argv.includes("--property=KillMode=control-group"));
  assert.throws(()=>supervisedUnitSpec(
    sessionId,config.manifest,config.uid,config.gid,
    {retainTimeoutResult:"yes"},
  ));
});

test("900s test requires separate explicit root/operator approval",()=>{
  assert.equal(requireLocalExpiryDrillApproval(approval()),true);
  for(const change of [
    a=>a.platform="darwin",a=>a.uid=1001,
    a=>delete a.env.ETERNYX_FIRECRACKER_EXPIRY_DRILL,
    a=>a.env.ETERNYX_FIRECRACKER_EXPIRY_DRILL="yes",
    a=>a.env.ETERNYX_RANGE_OPERATOR_ACK="",
  ]){
    const a=approval();change(a);
    assert.throws(()=>requireLocalExpiryDrillApproval(a),/not approved/);
  }
});

test("simulated systemd-only 900-second expiry needs live check + timeout proof",async()=>{
  let ms=0;
  const actions=[];
  const s={
    async attest(){actions.push("attest");return safeAttestation();},
    async verifyDead(){return ms>=900000;},
    async verifyTimedOut(){actions.push("systemdResult");return true;},
  };
  const result=await observeIndependentExpiry({
    sessionId,supervisor:s,wallStartMs:0,now:()=>ms,
    pause:async amount=>{ms+=amount;},
  });
  assert.equal(result.expiryDrillVerified,true);
  assert.equal(result.systemdTimeoutResultVerified,true);
  assert.equal(result.noCgroupDescendants,true);
  assert.ok(ms>=900000&&ms<=935000);
  assert.deepEqual(actions,["attest","systemdResult"]);
});

test("early death, unproven Result and runaway service cannot pass expiry",async()=>{
  const make=({deathAt,result=true}={})=>{
    let ms=0;
    const sup={
      async attest(){return safeAttestation();},
      async verifyDead(){return ms>=deathAt;},
      async verifyTimedOut(){return result;},
    };
    return {
      supervisor:sup,now:()=>ms,pause:async n=>{ms+=n;},
    };
  };
  for(const opts of [
    {deathAt:800000},{deathAt:875000},{deathAt:900000,result:false},
    {deathAt:1_100_000},
  ]){
    await assert.rejects(observeIndependentExpiry({
      sessionId,wallStartMs:0,...make(opts),
    }));
  }
});

test("optional guest check and expiry options preserve guaranteed teardown",async()=>{
  const s=fakeSupervisor();
  const result=await runOfflineHardwareAcceptance(acceptanceArgs(s,{
    guestProbeEnabled:true,expiryDrill:true,
    guestProbe:async()=>({guestServiceFunctional:true,
      challengeResponseVerified:true,localVsockOnly:true}),
    observeExpiry:async()=>({expiryDrillVerified:true,
      systemdTimeoutResultVerified:true,noCgroupDescendants:true}),
    now:()=>42,
  }));
  assert.equal(result.guestServiceFunctional,true);
  assert.equal(result.full900SecondExpiryObserved,true);
  assert.equal(result.teardownVerified,true);
  assert.equal(s.live,false);
  assert.deepEqual(s.actions.slice(-2),["terminate","verifyDead"]);
  for(const fail of [
    {guestProbeEnabled:true,guestProbe:async()=>({
      guestServiceFunctional:false,challengeResponseVerified:true,
      localVsockOnly:true,
    })},
    {expiryDrill:true,observeExpiry:async()=>({
      expiryDrillVerified:false,systemdTimeoutResultVerified:true,
      noCgroupDescendants:true,
    })},
  ]){
    const v=fakeSupervisor();
    await assert.rejects(runOfflineHardwareAcceptance(acceptanceArgs(v,fail)),
      /hardware acceptance failed/);
    assert.equal(v.live,false);
  }
});

test("CI wiring and reference guest agent are manual-only",async()=>{
  const source=await readFile(new URL(
    "../scripts/cyber-range-microvm-hardware-acceptance.mjs",import.meta.url),
    "utf8");
  const workflow=await readFile(new URL(
    "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",import.meta.url),
    "utf8");
  const guest=await readFile(new URL(
    "../infrastructure/cyber-range/guest/eternyx_vsock_probe.py",import.meta.url),
    "utf8");
  assert.match(source,/--probe-guest/);
  assert.match(source,/--expiry-drill/);
  assert.match(source,/Legacy receipt cannot attest expanded/);
  assert.match(workflow,/ctf-firecracker-guest-probe-expiry.test.mjs/);
  assert.match(guest,/socket.AF_VSOCK/);
  assert.doesNotMatch(guest,/AF_INET|requests|urllib|http/);
  assert.doesNotMatch(source,/createServer|cloudProvisioningAllowed:true/);
});

test("expiry observer rejects stalled, reversing and nonfinite clocks",async()=>{
 for(const mode of ["stalled","reverse","nan"]){
  let ms=0;
  const supervisor={async attest(){return safeAttestation();},async verifyDead(){return false;},async verifyTimedOut(){return false;}};
  await assert.rejects(observeIndependentExpiry({sessionId,supervisor,wallStartMs:0,now:()=>ms,pause:async()=>{ms=mode==="stalled"?0:mode==="reverse"?-1:NaN;}}),/clock/);
 }
});
test("tiny clock increments cannot cause an unbounded expiry observation",async()=>{
 let ms=0,waits=0;
 await assert.rejects(observeIndependentExpiry({sessionId,wallStartMs:0,now:()=>ms,
   supervisor:{async attest(){return safeAttestation();},async verifyDead(){return false;},async verifyTimedOut(){return false;}},
   pause:async()=>{waits++;ms++;}}),/bounded poll count/);
 assert.equal(waits,100);
});
