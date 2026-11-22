#!/usr/bin/env node
/**
 * Trusted operator read-only preparation audit. No KVM execution, no cloud
 * requests, no Firecracker API mutation, no guest or host network setup.
 */
import {firecrackerBootPlan,verifyJailedBootImages} from
  "../infrastructure/cyber-range/provider/firecracker-boot-controller.mjs";
import {buildHardenedJailerCommand} from
  "../infrastructure/cyber-range/provider/firecracker-jailer-contract.mjs";

const argv=process.argv.slice(2);
const options=new Map();
if(argv.length===1 && argv[0]==="--help"){
  console.log([
    "ETERNYX Labs verified offline Firecracker configuration",
    "Usage: npm run range:microvm:plan -- --session UUID --kernel-sha SHA256 --rootfs-sha SHA256 --uid UID --gid GID",
    "Requires operator-prepared jail at /srv/eternyx-firecracker",
    "Only verifies actual image hashes and prints a fixed, non-executing plan.",
    "Never creates or starts a VM or a cloud service.",
  ].join("\n"));
}else{
  try{
    if(argv.length!==10)throw Error("exact arguments required");
    const accepted=new Set(["--session","--kernel-sha","--rootfs-sha","--uid","--gid"]);
    for(let i=0;i<argv.length;i+=2){
      if(!accepted.has(argv[i])||options.has(argv[i]))
        throw Error("invalid or repeated argument");
      options.set(argv[i],argv[i+1]);
    }
    if(options.size!==5)throw Error("required arguments missing");
    const manifest={
      challengePack:"http-basics-v1",image:"eternyx-http-basics-v1",
      virtualization:"firecracker",
      kernelSha256:options.get("--kernel-sha"),
      rootfsSha256:options.get("--rootfs-sha"),
      vcpus:1,memoryMiB:256,maxRuntimeSeconds:900,
      egressPolicy:"deny-all",metadataAccess:"blocked",
      networkIngress:"vsock-only",rootfsReadOnly:true,
      jailerEnabled:true,snapshotting:"disabled",
    };
    const sessionId=options.get("--session");
    const jailBase="/srv/eternyx-firecracker";
    const boot=firecrackerBootPlan(sessionId,manifest);
    const jailed=buildHardenedJailerCommand({
      sessionId,manifest,uid:Number(options.get("--uid")),
      gid:Number(options.get("--gid")),
    });
    const verified=await verifyJailedBootImages({
      jailBase,sessionId,manifest,
    });
    console.log(JSON.stringify({
      verified,guestCid:boot.guestCid,requests:boot.requests,
      jailerArguments:jailed.args,
      localOnly:true,spawnsProcess:false,
      networkInterfaces:0,
      providerHardLimitVerified:false,cloudProvisioningAllowed:false,
    },null,2));
  }catch{
    console.error("Local jailed Firecracker plan or image verification refused.");
    process.exitCode=1;
  }
}
