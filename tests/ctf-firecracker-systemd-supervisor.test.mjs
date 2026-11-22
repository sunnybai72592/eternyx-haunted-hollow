import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  supervisedVmUnit,supervisedNetns,supervisedUnitSpec,
  parseSystemdUnitShow,verifySystemdUnitProperties,
  verifyLoopbackOnlyNamespace,SystemdMicrovmSupervisor,
  runSupervisorCommand,verifySupervisorHost,
} from "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";

const session="123e4567-e89b-42d3-a456-426614174001";
const project="cr-"+session.replaceAll("-","");
const unit="eternyx-fc-"+project+".service";
const validGuest=()=>({
  challengePack:"http-basics-v1",image:"eternyx-http-basics-v1",
  virtualization:"firecracker",kernelSha256:"b".repeat(64),
  rootfsSha256:"c".repeat(64),vcpus:1,memoryMiB:256,maxRuntimeSeconds:900,
  egressPolicy:"deny-all",metadataAccess:"blocked",networkIngress:"vsock-only",
  rootfsReadOnly:true,jailerEnabled:true,snapshotting:"disabled",
});
const loopback=[{ifname:"lo",link_type:"loopback",flags:["LOOPBACK","UP"]}];
const okPreflight=()=>({
  verified:true,loopbackOnly:true,pinnedHostExecutables:true,
  pinnedGuestImages:true,readyForPublicHostedLabs:false,
});
const argv="path=/usr/local/bin/jailer ; argv[]=/usr/local/bin/jailer --id "+
  project+" --netns /run/netns/eternyx-"+project+
  " --chroot-base-dir /srv/eternyx-firecracker --new-pid-ns";
function makeShow(overrides={}){
  const p={
    LoadState:"loaded",ActiveState:"active",SubState:"running",
    MainPID:"12001",ControlGroup:"/system.slice/"+unit,
    Transient:"yes",Type:"exec",KillMode:"control-group",
    SendSIGKILL:"yes",RuntimeMaxUSec:"15min",
    MemoryMax:"402653184",TasksMax:"64",CPUQuotaPerSecUSec:"1s",
    Description:"ETERNYX offline microVM "+project,ExecStart:argv,
    ...overrides,
  };
  return Object.entries(p).map(([k,v])=>k+"="+v).join("\n");
}
function notFound(){
  return makeShow({LoadState:"not-found",ActiveState:"inactive",
    SubState:"dead",MainPID:"0",ControlGroup:"",Transient:"no",
    Type:"simple",ExecStart:"",Description:""});
}
function fakeHost({initial=false,failStart=false,cgroupText="",
  badNetwork=false,cgroupMember=true,populated=0}={}){
  let active=initial;const calls=[];
  const host={
    calls,
    run(name,args){
      calls.push({name,args:[...args]});
      if(name==="ip"){
        return JSON.stringify(badNetwork?[
          ...loopback,{ifname:"eth0",link_type:"ether",flags:["UP"]},
        ]:loopback);
      }
      if(name==="systemd-run"){
        if(failStart)throw Error("fake systemd failed");
        active=true;
        return "Started transient service";
      }
      if(name!=="systemctl")throw Error("Unexpected command");
      if(args[0]==="show")return active?makeShow():notFound();
      if(args[0]==="stop"){active=false;return "";}
      throw Error("Unexpected systemctl action");
    },
    files:{async readFile(path){
      if(path==="/proc/12001/cgroup")
        return "0::"+(cgroupMember?"/system.slice/"+unit:"/other.slice/foreign.service")+"\n";
      if(path.endsWith("/cgroup.procs")||path.endsWith("/cgroup.events")){
        if(cgroupText===null){
          const e=Error("missing cgroup");e.code="ENOENT";throw e;
        }
        if(path.endsWith("/cgroup.events"))
          return "populated "+populated+"\nfrozen 0\n";
        return cgroupText;
      }
      throw Error("unexpected file read");
    }},
    get active(){return active;},
  };
  return host;
}
const makeSupervisor=(host,options={})=>{
  const env={
    ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved",
    ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS",
  };
  return new SystemdMicrovmSupervisor({
    execute:(name,args)=>host.run(name,args),preflight:async()=>okPreflight(),
    launchGate:async()=>true,platform:"linux",uid:0,
    env,files:host.files,...options,
  });
};
const launch=s=>s.launchJailer({
  sessionId:session,manifest:validGuest(),uid:22001,gid:22001,
  jailerSha256:"f".repeat(64),firecrackerSha256:"e".repeat(64),
});

test("unique fixed unit/network name is tied to validated session",()=>{
  assert.equal(supervisedVmUnit(session),unit);
  assert.equal(supervisedNetns(session),"eternyx-"+project);
  assert.throws(()=>supervisedVmUnit("../../user.service"));
  assert.throws(()=>supervisedNetns("root;rm -rf"));
});

test("real systemd-run contract has external service lifetime and full cgroup kill",()=>{
  const spec=supervisedUnitSpec(session,validGuest(),22001,22001);
  assert.equal(spec.executable,"systemd-run");
  assert.equal(spec.unit,unit);
  for(const required of [
    "--unit="+unit,"--collect","--service-type=exec",
    "--property=RuntimeMaxSec=900s",
    "--property=KillMode=control-group",
    "--property=SendSIGKILL=yes","--property=TimeoutStopSec=5s",
    "--property=Restart=no","--property=MemoryMax=402653184",
    "--property=TasksMax=64","--property=CPUQuota=100%",
    "--new-pid-ns","--netns","/run/netns/eternyx-"+project,
  ])assert.ok(spec.argv.includes(required),required);
  assert.ok(!spec.argv.includes("--daemonize"));
  assert.ok(!spec.argv.includes("--no-seccomp"));
  assert.ok(!spec.argv.includes("--network-interface"));
  assert.ok(!spec.argv.includes("--cgroup"),"Jailer must not escape systemd cgroup");
  assert.ok(spec.argv.includes("--cgroup-version"));
  assert.equal(spec.spawnsPublicListener,false);
  assert.equal(spec.cloudProvisioningAllowed,false);
});

test("jailer unit plans reject unsafe IDs, host root, unsigned alternate manifest",()=>{
  for(const invalid of [
    {uid:0},{gid:0},{uid:60001},{gid:"22001"},
    {manifest:{...validGuest(),egressPolicy:"allow-all"}},
    {sessionId:"evil"},
  ])assert.throws(()=>supervisedUnitSpec(
    invalid.sessionId??session,
    invalid.manifest??validGuest(),
    invalid.uid??22001,invalid.gid??22001,
  ));
});

test("systemctl property parser rejects foreign keys, missing fields and duplicate properties",()=>{
  assert.equal(parseSystemdUnitShow(makeShow()).MainPID,"12001");
  assert.throws(()=>parseSystemdUnitShow("LoadState=loaded"),/Incomplete/);
  assert.throws(()=>parseSystemdUnitShow(makeShow()+"\nMainPID=3"),/duplicate/);
  assert.throws(()=>parseSystemdUnitShow(makeShow()+"\nUnknownProperty=x"),/Unexpected/);
  assert.throws(()=>parseSystemdUnitShow("a".repeat(12001)));
});

test("attestation requires exact active transient unit, cgroup kill and 900s bound",()=>{
  const valid=verifySystemdUnitProperties(session,makeShow());
  assert.equal(valid.active,true);
  assert.equal(valid.deadlineSeconds,900);
  assert.equal(valid.mainPid,12001);
  const modifications=[
    {Transient:"no"},{Type:"simple"},{KillMode:"process"},
    {SendSIGKILL:"no"},{RuntimeMaxUSec:"infinity"},
    {RuntimeMaxUSec:"20min"},{MemoryMax:"infinity"},
    {TasksMax:"infinity"},{CPUQuotaPerSecUSec:"infinity"},
    {MainPID:"0"},{MainPID:"1212;rm"},{ControlGroup:"/system.slice/other.service"},
    {Description:"Unrelated unit"},{ExecStart:"path=/bin/bash"},
    {ExecStart:argv+" --cgroup memory.max=99999"},
    {ActiveState:"inactive"},{SubState:"exited"},
  ];
  for(const change of modifications){
    assert.throws(()=>verifySystemdUnitProperties(session,makeShow(change)),
      undefined,JSON.stringify(change));
  }
});

test("no external NIC is accepted, even for host-only veth/tap interface",()=>{
  assert.equal(verifyLoopbackOnlyNamespace(JSON.stringify(loopback)),true);
  for(const invalid of [
    [],[...loopback,{ifname:"eth0",link_type:"ether",flags:["UP"]}],
    [{ifname:"eth0",link_type:"loopback",flags:["LOOPBACK"]}],
    [{ifname:"lo",link_type:"ether",flags:["LOOPBACK"]}],
    [{ifname:"lo",link_type:"loopback",flags:[]}],
    "garbage",{},null,
  ])assert.throws(()=>verifyLoopbackOnlyNamespace(invalid));
});

test("actual supervisor lifecycle uses systemd and attests host namespace",async()=>{
  const host=fakeHost({cgroupText:""});
  const s=makeSupervisor(host);
  const result=await launch(s);
  assert.deepEqual(result,{
    launched:true,unit,localOnly:true,
    guestNotBooted:true,cloudProvisioningAllowed:false,
  });
  const launched=host.calls.filter(x=>x.name==="systemd-run");
  assert.equal(launched.length,1);
  assert.equal(host.active,true);
  const state=await s.attest(session);
  assert.deepEqual(state,{
    jailed:true,supervisorOwned:true,hostNetworkDenied:true,
    metadataDenied:true,externalWatchdogArmed:true,
    cgroupEnforced:true,cloudProvisioningAllowed:false,
  });
  assert.deepEqual(await s.armTimeout(session,900),{armed:true,maxSeconds:900});
  await assert.rejects(s.armTimeout(session,901),/maximum lifetime/);
  assert.deepEqual(await s.terminate(session),{requested:true,unit});
  assert.equal(await s.verifyDead(session),true);
  assert.equal(host.active,false);
  assert.ok(host.calls.some(c=>c.name==="systemctl"&&
    c.args[0]==="stop"&&c.args[1]===unit));
});

test("missing operator opt-in, nonroot, unsupported runtime and missing gate prohibit mutation",async()=>{
  for(const conf of [
    {uid:1001},{platform:"darwin"},
    {env:{ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved"}},
    {env:{ETERNYX_FIRECRACKER_HOST_EXECUTION:"wrong",
      ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS"}},
    {env:{ETERNYX_FIRECRACKER_HOST_EXECUTION:"operator_approved",
      ETERNYX_RANGE_OPERATOR_ACK:"LOCAL_ONLY_NO_PUBLIC_INGRESS",
      ETERNYX_RANGE_RUNTIME:"firecracker"}},
  ]){
    const host=fakeHost();
    await assert.rejects(launch(makeSupervisor(host,conf)),/root opt-in/);
    assert.equal(host.calls.length,0);
  }
  const host=fakeHost();
  await assert.rejects(launch(makeSupervisor(host,{
    launchGate:async()=>{throw Error("emergency halt");},
  })),/emergency halt/);
  assert.equal(host.calls.length,0);
});

test("unsafe host preflight and unknown records block service start",async()=>{
  for(const receipt of [null,{},{
    ...okPreflight(),pinnedHostExecutables:false,
  },{
    ...okPreflight(),readyForPublicHostedLabs:true,
  }]){
    const host=fakeHost();
    await assert.rejects(launch(makeSupervisor(host,{
      preflight:async()=>receipt,
    })),/preflight/);
    assert.equal(host.calls.some(x=>x.name==="systemd-run"),false);
  }
});

test("pre-existing systemd service cannot be overwritten or hijacked",async()=>{
  const host=fakeHost({initial:true});
  await assert.rejects(launch(makeSupervisor(host)),/previous or foreign/);
  assert.equal(host.calls.some(x=>x.name==="systemd-run"),false);
});

test("namespace must be only loopback before launch and while running",async()=>{
  const host=fakeHost({badNetwork:true});
  await assert.rejects(launch(makeSupervisor(host)),/non-loopback/);
  assert.equal(host.calls.some(x=>x.name==="systemd-run"),false);
  await assert.rejects(makeSupervisor(fakeHost({
    badNetwork:true,initial:true,
  })).attest(session),/non-loopback/);
});

test("escaped main process or nested cgroup tasks refuse attestation and teardown",async()=>{
  const escaped=makeSupervisor(fakeHost({initial:true,cgroupMember:false}));
  await assert.rejects(escaped.attest(session),/escaped/);
  const nested=makeSupervisor(fakeHost({populated:1,cgroupText:""}));
  assert.equal(await nested.verifyDead(session),false);
});

test("if systemd launched but attestation fails, cleanup stops unit and checks cgroup",async()=>{
  const host=fakeHost({badNetwork:false,cgroupText:null});
  let n=0;
  const s=makeSupervisor(host,{
    execute(name,args){
      if(name==="ip"){
        n++;
        if(n>=2)return JSON.stringify([...loopback,{
          ifname:"veth0",link_type:"ether",flags:["UP"]}]);
      }
      return host.run(name,args);
    },
  });
  await assert.rejects(launch(s),/supervisor refused/);
  assert.equal(host.active,false);
  assert.ok(host.calls.some(x=>x.name==="systemctl"&&x.args[0]==="stop"));
});

test("verifyDead refuses orphan cgroup tasks and unknown cgroup access",async()=>{
  const running=makeSupervisor(fakeHost({initial:true}));
  assert.equal(await running.verifyDead(session),false);
  const orphan=makeSupervisor(fakeHost({cgroupText:"123\n"}));
  assert.equal(await orphan.verifyDead(session),false);
  const denied=makeSupervisor(fakeHost({cgroupText:""}),{
    files:{async readFile(){throw Error("permission denied");}},
  });
  await assert.rejects(denied.verifyDead(session),/Cannot verify/);
  const gone=makeSupervisor(fakeHost({cgroupText:null}));
  assert.equal(await gone.verifyDead(session),true);
});

test("terminate refuses arbitrary foreign service with same name",async()=>{
  const host=fakeHost({initial:true});
  const supervisor=makeSupervisor(host,{
    execute(name,args){
      if(name==="systemctl"&&args[0]==="show")
        return makeShow({Description:"foreign unit",MainPID:"9001"});
      return host.run(name,args);
    },
  });
  await assert.rejects(supervisor.terminate(session),/runtime hardening/);
  assert.equal(host.calls.some(x=>x.name==="systemctl"&&x.args[0]==="stop"),false);
});

test("real host-side read-only preflight refuses KVM absence before reading pinned binaries",async()=>{
  await assert.rejects(verifySupervisorHost({
    sessionId:session,manifest:validGuest(),
    jailerSha256:"f".repeat(64),firecrackerSha256:"e".repeat(64),
    readOnlyPreflight:async()=>({basicHostSupported:false}),
    exec(){throw Error("no command may run");},
  }),/KVM/);
});

test("privileged host command runner is not a shell and refuses arbitrary binaries",()=>{
  assert.throws(()=>runSupervisorCommand("sh",["-c","id"]),/Unapproved/);
  assert.throws(()=>runSupervisorCommand("curl",["http://example.com"]),/Unapproved/);
  assert.throws(()=>runSupervisorCommand("systemd-run",["x\0y"]),/Unapproved/);
});

test("CLI and supervisor remain local-only, never run automatically at app startup",async()=>{
  const root=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  const [supervisor,cli,pkg,boot]=await Promise.all([
    root("infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs"),
    root("scripts/cyber-range-microvm-supervisor.mjs"),
    root("package.json"),
    root("infrastructure/cyber-range/provider/firecracker-boot-controller.mjs"),
  ]);
  assert.match(supervisor,/RuntimeMaxSec=900s/);
  assert.match(supervisor,/KillMode=control-group/);
  assert.match(supervisor,/systemctl/);
  assert.match(supervisor,/verifyJailedBootImages/);
  assert.match(supervisor,/verifyLoopbackOnlyNamespace/);
  assert.match(cli,/--halt-new-launches/);
  assert.match(cli,/--terminate/);
  assert.equal(JSON.parse(pkg).scripts["range:microvm:supervisor"],
    "node scripts/cyber-range-microvm-supervisor.mjs");
  assert.doesNotMatch(supervisor,/createServer|https?:\/\/|import.*aws|spawnSync\("sudo"/);
  assert.doesNotMatch(cli,/launchJailer\(/);
  assert.match(boot,/bootJailedMicrovm/);
});
