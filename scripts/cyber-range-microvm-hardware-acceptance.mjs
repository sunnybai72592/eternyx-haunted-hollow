#!/usr/bin/env node
/**
 * Local-only Firecracker physical/VM KVM host acceptance.
 * Never called by app, CI, Edge functions or remote endpoints.
 * Inspection is read-only; --run requires three distinct operator opt-ins.
 */
import {
  approvedHardwareManifest,requireLocalHardwareApproval,
  auditOfflineHardwareHost,runOfflineHardwareAcceptance,
} from "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {SystemdMicrovmSupervisor} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const usage=[
  "ETERNYX Labs — dedicated offline KVM guest acceptance",
  "Read-only inspection:",
  "  npm run range:microvm:hardware -- --inspect --session UUID --uid 22001 --gid 22001 --kernel-sha SHA256 --rootfs-sha SHA256 --jailer-sha SHA256 --firecracker-sha SHA256",
  "Manually approved, offline guest boot and immediate teardown:",
  "  npm run range:microvm:hardware -- --run --confirm-local-kvm --session UUID --uid 22001 --gid 22001 --kernel-sha SHA256 --rootfs-sha SHA256 --jailer-sha SHA256 --firecracker-sha SHA256",
  "Read-only crash-recovery audit:",
  "  npm run range:microvm:hardware -- --verify-stopped --session UUID",
  "NEVER runs automatically. No cloud accounts, billing, public ports or image downloads.",
].join("\n");

const argv=process.argv.slice(2);
const keys=["--session","--uid","--gid","--kernel-sha",
  "--rootfs-sha","--jailer-sha","--firecracker-sha"];
try{
  if(argv.length===0 || (argv.length===1&&argv[0]==="--help")){
    console.log(usage);
  }else{
    const mode=argv[0];
    if(mode==="--verify-stopped"){
      if(argv.length!==3||argv[1]!=="--session"||
         !validSessionId(argv[2]))throw Error("Invalid status inspection");
      const stopped=await new SystemdMicrovmSupervisor().verifyDead(argv[2]);
      if(!stopped)throw Error("Jailed guest has surviving processes");
      console.log(JSON.stringify({
        sessionId:argv[2],teardownVerified:true,cloudProvisioningAllowed:false,
      }));
    }else{
      if(!["--inspect","--run"].includes(mode))
        throw Error("Unknown acceptance mode");
      const run=mode==="--run";
      const tail=run?argv.slice(2):argv.slice(1);
      if(run&&argv[1]!=="--confirm-local-kvm")
        throw Error("Missing human KVM run confirmation");
      if(tail.length!==keys.length*2)throw Error("Missing guest approval arguments");
      const args=new Map();
      for(let i=0;i<tail.length;i+=2){
        const k=tail[i],v=tail[i+1];
        if(!keys.includes(k)||args.has(k)||!v)
          throw Error("Unexpected, missing or repeated acceptance field");
        args.set(k,v);
      }
      if(args.size!==keys.length)throw Error("Incomplete approval configuration");
      const uid=Number(args.get("--uid"));
      const gid=Number(args.get("--gid"));
      const sessionId=args.get("--session");
      const manifest=approvedHardwareManifest({
        kernelSha256:args.get("--kernel-sha"),
        rootfsSha256:args.get("--rootfs-sha"),
      });
      const config={
        sessionId,manifest,uid,gid,
        jailerSha256:args.get("--jailer-sha"),
        firecrackerSha256:args.get("--firecracker-sha"),
      };
      if(run){
        requireLocalHardwareApproval();
        const abort=new AbortController();
        process.once("SIGINT",()=>abort.abort());
        process.once("SIGTERM",()=>abort.abort());
        const result=await runOfflineHardwareAcceptance({
          ...config,signal:abort.signal,
        });
        console.log(JSON.stringify(result));
      }else{
        console.log(JSON.stringify(await auditOfflineHardwareHost(config)));
      }
    }
  }
}catch{
  // Root-only tooling must never print OS exceptions, secret environment,
  // private Firecracker responses, files or raw command stderr.
  console.error("Local KVM acceptance denied or failed; verify host isolation and supervisor cleanup.");
  process.exitCode=1;
}
