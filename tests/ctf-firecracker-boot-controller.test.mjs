import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {chmod,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  firecrackerBootPlan,jailedRootPath,firecrackerApiSocket,
  verifyJailedBootImages,sendFirecrackerRequest,bootJailedMicrovm,
  terminateJailedMicrovm,
} from "../infrastructure/cyber-range/provider/firecracker-boot-controller.mjs";
import {buildHardenedJailerCommand} from "../infrastructure/cyber-range/provider/firecracker-jailer-contract.mjs";

const session="123e4567-e89b-42d3-a456-426614174001";
const project="cr-"+session.replaceAll("-","");
const sha=b=>createHash("sha256").update(b).digest("hex");
const kernel=Buffer.from("ETERNYX verified fixture kernel");
const rootImage=Buffer.from("ETERNYX verified fixture rootfs");
const manifest=()=>({
  challengePack:"http-basics-v1",image:"eternyx-http-basics-v1",
  virtualization:"firecracker",kernelSha256:sha(kernel),
  rootfsSha256:sha(rootImage),vcpus:1,memoryMiB:256,
  maxRuntimeSeconds:900,egressPolicy:"deny-all",
  metadataAccess:"blocked",networkIngress:"vsock-only",
  rootfsReadOnly:true,jailerEnabled:true,snapshotting:"disabled",
});
const owned=()=>({
  jailed:true,supervisorOwned:true,hostNetworkDenied:true,
  metadataDenied:true,externalWatchdogArmed:true,
  cgroupEnforced:true,cloudProvisioningAllowed:false,
});
function guardian(overrides={}){
  const events=[];
  return {events,
    async attest(id){events.push("attest:"+id);return overrides.attest??owned();},
    async armTimeout(id,seconds){events.push("arm:"+seconds);
      return overrides.armed??{armed:true,maxSeconds:900};},
    async terminate(id){events.push("kill:"+id);
      if(overrides.killError)throw Error("kill failed");},
    async verifyDead(id){events.push("verifyDead:"+id);
      return overrides.dead??true;},
  };
}
async function fixture(t){
  const base=await mkdtemp(join(tmpdir(),"eternyx-fc-test-"));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const root=jailedRootPath(base,session);
  await mkdir(join(root,"run"),{recursive:true,mode:0o700});
  await writeFile(join(root,"vmlinux.bin"),kernel,{mode:0o444});
  await writeFile(join(root,"rootfs.ext4"),rootImage,{mode:0o444});
  await chmod(join(root,"vmlinux.bin"),0o444);
  await chmod(join(root,"rootfs.ext4"),0o444);
  return {base,root,socket:firecrackerApiSocket(base,session)};
}

test("strict boot plan matches current Firecracker Unix API and cannot create NIC or metadata",()=>{
  const p=firecrackerBootPlan(session,manifest());
  assert.equal(p.id,project);
  assert.equal(p.requests.length,5);
  assert.deepEqual(p.requests.map(x=>x.path),[
    "/machine-config","/boot-source","/drives/rootfs","/vsock","/actions"
  ]);
  assert.deepEqual(p.requests[0].body,{
    vcpu_count:1,mem_size_mib:256,smt:false,track_dirty_pages:false,
  });
  assert.equal(p.requests[1].body.kernel_image_path,"/vmlinux.bin");
  assert.ok(p.requests[1].body.boot_args.includes("ro "));
  assert.deepEqual(p.requests[2].body,{
    drive_id:"rootfs",path_on_host:"/rootfs.ext4",
    is_root_device:true,is_read_only:true,
  });
  assert.equal(p.requests[3].body.uds_path,"/v.sock");
  assert.ok(p.guestCid>=3);
  assert.deepEqual(p.requests[4].body,{action_type:"InstanceStart"});
  assert.equal(p.noNetworkInterfaces,true);
  assert.equal(p.noMetadataService,true);
  assert.equal(p.exposedHostPorts,0);
  assert.equal(p.cloudProvisioningAllowed,false);
  assert.doesNotMatch(JSON.stringify(p),/network-interfaces|\/mmds/);
});

test("guest vsock CID derives from session, never browser-supplied value",()=>{
  const p=firecrackerBootPlan(session,manifest());
  assert.equal(p.guestCid,firecrackerBootPlan(session,manifest()).guestCid);
  assert.notEqual(p.guestCid,
    firecrackerBootPlan("223e4567-e89b-42d3-a456-426614174001",manifest()).guestCid);
  assert.throws(()=>firecrackerBootPlan("bad",manifest()),/session/);
  assert.throws(()=>firecrackerBootPlan(session,{...manifest(),egressPolicy:"any"}),/not approved/);
});

test("jailer layout is deterministic, avoids path traversal or shell input",async(t)=>{
  const {base,root}=await fixture(t);
  assert.equal(jailedRootPath(base,session),root);
  assert.equal(firecrackerApiSocket(base,session),join(root,"run","firecracker.socket"));
  for(const path of [".","../evil","/","/tmp/../etc","relative","/tmp/../etc\0"]){
    assert.throws(()=>jailedRootPath(path,session));
  }
  assert.throws(()=>jailedRootPath(base,"../evil"));
});

test("verify pinned kernel and read-only rootfs from real file descriptors",async(t)=>{
  const {base}=await fixture(t);
  assert.deepEqual(await verifyJailedBootImages({jailBase:base,sessionId:session,
    manifest:manifest()}),{
    sessionId:session,kernelVerified:true,rootfsVerified:true,
  });
});

test("reject digest mismatch, mutable artifacts and symlinked guest images",async(t)=>{
  const {base,root}=await fixture(t);
  const changed={...manifest(),kernelSha256:"c".repeat(64)};
  await assert.rejects(verifyJailedBootImages({
    jailBase:base,sessionId:session,manifest:changed,
  }),/pin mismatch/);
  await chmod(join(root,"rootfs.ext4"),0o644);
  await assert.rejects(verifyJailedBootImages({
    jailBase:base,sessionId:session,manifest:manifest(),
  }),/unsafe/);
  await rm(join(root,"rootfs.ext4"));
  await symlink(join(root,"vmlinux.bin"),join(root,"rootfs.ext4"));
  await assert.rejects(verifyJailedBootImages({
    jailBase:base,sessionId:session,manifest:manifest(),
  }));
});

test("real Unix socket transport issues only allowlisted bounded Firecracker PUT calls",async(t)=>{
  const {socket}=await fixture(t);
  const calls=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];
    for await(const part of req)chunks.push(part);
    calls.push({url:req.url,method:req.method,json:JSON.parse(Buffer.concat(chunks))});
    res.writeHead(204);res.end();
  });
  await new Promise(resolve=>server.listen(socket,resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const out=await sendFirecrackerRequest({
    socketPath:socket,path:"/machine-config",
    body:{vcpu_count:1,mem_size_mib:256,smt:false,track_dirty_pages:false},
  });
  assert.deepEqual(out,{applied:true,path:"/machine-config",status:204});
  assert.deepEqual(calls,[{
    url:"/machine-config",method:"PUT",
    json:{vcpu_count:1,mem_size_mib:256,smt:false,track_dirty_pages:false},
  }]);
  for(const url of ["https://evil","/network-interfaces/net1","/mmds","/snapshot/create","/version","/actions?x=1"]){
    await assert.rejects(sendFirecrackerRequest({
      socketPath:socket,path:url,body:{foo:"bar"},
    }),/Invalid Firecracker/);
  }
  await assert.rejects(sendFirecrackerRequest({
    socketPath:socket,path:"/actions",body:{arbitrary:"x".repeat(3000)},
  }),/Invalid Firecracker|Oversized/);
  for(const invalid of [
    {path:"/actions",body:{action_type:"SendCtrlAltDel"}},
    {path:"/actions",body:{action_type:"InstanceStart",extra:true}},
    {path:"/machine-config",body:{vcpu_count:8,mem_size_mib:4096,
      smt:false,track_dirty_pages:false}},
    {path:"/drives/rootfs",body:{drive_id:"rootfs",
      path_on_host:"/rootfs.ext4",is_root_device:true,is_read_only:false}},
  ])await assert.rejects(sendFirecrackerRequest({
    socketPath:socket,...invalid,
  }),/Invalid Firecracker/);
  assert.equal(calls.length,1);
});

test("socket transport rejects non-204 replies and never claims boot succeeded",async(t)=>{
  const {socket}=await fixture(t);
  const server=createServer((req,res)=>{
    res.writeHead(403,{"Content-Type":"text/plain"});
    res.end("private host response should never be returned to caller");
  });
  await new Promise(resolve=>server.listen(socket,resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(sendFirecrackerRequest({
    socketPath:socket,path:"/actions",body:{action_type:"InstanceStart"},
  }),e=>e.message==="Firecracker API rejected restricted boot configuration" &&
      !e.message.includes("private host"));
});

test("full actual Unix API boot sequence is withheld without independent host supervisor",async(t)=>{
  const {base,socket}=await fixture(t);
  const server=createServer((req,res)=>{res.writeHead(204);res.end();});
  await new Promise(resolve=>server.listen(socket,resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,
  }),/supervisor/);
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,
    guardian:guardian({attest:{...owned(),hostNetworkDenied:false}}),
  }),/unverified/);
  const watchdog=guardian({armed:{armed:false,maxSeconds:900}});
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,
    guardian:watchdog,
  }),/boot verification failed/);
  assert.ok(watchdog.events.includes("kill:"+session));
  assert.ok(watchdog.events.includes("verifyDead:"+session));
});

test("real Unix HTTP boot steps + bounded lifetime arm + repeat attest",async(t)=>{
  const {base,socket}=await fixture(t);
  const calls=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const part of req)chunks.push(part);
    calls.push({url:req.url,body:JSON.parse(Buffer.concat(chunks))});
    res.writeHead(204);res.end();
  });
  await new Promise(resolve=>server.listen(socket,resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const g=guardian();
  const result=await bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,guardian:g,
  });
  assert.equal(result.started,true);
  assert.equal(result.networkInterfaces,0);
  assert.equal(result.readyForPublicHostedLabs,false);
  assert.equal(result.cloudProvisioningAllowed,false);
  assert.equal(g.events.filter(e=>e.startsWith("attest")).length,6);
  assert.ok(g.events.includes("arm:900"));
  assert.deepEqual(calls.map(c=>c.url),[
    "/machine-config","/boot-source","/drives/rootfs","/vsock","/actions",
  ]);
  assert.equal(calls[4].body.action_type,"InstanceStart");
  assert.equal(g.events.some(e=>e.startsWith("kill")),false);
});

test("image pin failure also stops existing jailed process before boot",async(t)=>{
  const {base}=await fixture(t);
  const g=guardian();
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,
    manifest:{...manifest(),kernelSha256:"f".repeat(64)},
    jailBase:base,guardian:g,
  }),/boot verification failed/);
  assert.ok(g.events.includes("kill:"+session));
  assert.ok(g.events.includes("verifyDead:"+session));
  assert.ok(!g.events.includes("arm:900"));
});

test("partial boot failures force supervised kill + proof of death",async(t)=>{
  const {base}=await fixture(t);
  const g=guardian();
  const requests=[];
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,guardian:g,
    send:async(req)=>{
      requests.push(req.path);
      if(req.path==="/vsock")throw Error("arbitrary internal host error");
      return {applied:true,status:204};
    },
  }),e=>e.message==="MicroVM operator isolation or Firecracker boot verification failed");
  assert.deepEqual(requests,[
    "/machine-config","/boot-source","/drives/rootfs","/vsock",
  ]);
  assert.ok(g.events.includes("kill:"+session));
  assert.ok(g.events.includes("verifyDead:"+session));
  const bad=guardian({dead:false});
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,guardian:bad,
    send:async()=>{throw Error("start response lost");},
  }),/teardown not proven/);
});

test("unattested host drift cannot proceed to InstanceStart",async(t)=>{
  const {base}=await fixture(t);
  let calls=0,requested=[];
  const g=guardian();g.attest=async()=>{
    calls++;
    return calls>=4?{...owned(),hostNetworkDenied:false}:owned();
  };
  await assert.rejects(bootJailedMicrovm({
    sessionId:session,manifest:manifest(),jailBase:base,guardian:g,
    send:async(req)=>{requested.push(req.path);return{applied:true,status:204};},
  }),/boot verification failed/);
  assert.ok(!requested.includes("/actions"));
  assert.ok(g.events.includes("verifyDead:"+session));
});

test("termination refuses missing or unconfirmed supervisor cleanup",async()=>{
  await assert.rejects(terminateJailedMicrovm({
    sessionId:session,
  }),/termination owner/);
  await assert.rejects(terminateJailedMicrovm({
    sessionId:session,guardian:guardian({dead:false}),
  }),/teardown not proven/);
  const result=await terminateJailedMicrovm({
    sessionId:session,guardian:guardian(),
  });
  assert.deepEqual(result,{sessionId:session,terminated:true});
});

test("controller has no cloud SDK, public HTTP listener or auto-spawn",async()=>{
  const content=await readFile(new URL(
    "../infrastructure/cyber-range/provider/firecracker-boot-controller.mjs",
    import.meta.url),"utf8");
  assert.match(content,/sendFirecrackerRequest/);
  assert.match(content,/InstanceStart/);
  assert.match(content,/createHash/);
  assert.doesNotMatch(content,/spawnSync|child_process|createServer|listen\(|aws-sdk|https?:\/\/|\/network-interfaces|\/mmds/);
  assert.doesNotMatch(content,/cloudProvisioningAllowed:true|readyForPublicHostedLabs:true/);
});


test("jailer launch argument plan requires independent pre-created namespace and cgroup",()=>{
  const plan=buildHardenedJailerCommand({
    sessionId:session,manifest:manifest(),uid:22001,gid:22001,
  });
  assert.equal(plan.binary,"/usr/local/bin/jailer");
  assert.ok(plan.args.includes("--new-pid-ns"));
  assert.ok(plan.args.includes("memory.max=402653184"));
  assert.ok(plan.args.includes("pids.max=64"));
  assert.ok(plan.args.includes("cpu.max=100000 100000"));
  assert.ok(plan.args.includes("/run/netns/eternyx-"+project));
  assert.ok(plan.args.includes("/run/firecracker.socket"));
  assert.ok(!plan.args.includes("--daemonize"));
  assert.ok(!plan.args.includes("--no-seccomp"));
  assert.ok(!plan.args.includes("--network-interface"));
  assert.equal(plan.spawnsProcess,false);
  assert.equal(plan.cloudProvisioningAllowed,false);
});

test("jailer plans reject root IDs, unreviewed binary, arbitrary chroot and extra resources",()=>{
  for(const bad of [
    {uid:0},{gid:0},{uid:1},{uid:60001},{gid:60001},
    {binary:"/tmp/jailer"},{firecracker:"/tmp/firecracker"},
    {jailBase:"/tmp/other"},{uid:"22001"},
    {manifest:{...manifest(),networkIngress:"host-tcp"}},
  ]){
    assert.throws(()=>buildHardenedJailerCommand({
      sessionId:session,manifest:manifest(),uid:22001,gid:22001,...bad,
    }),/contract|not approved/);
  }
});
