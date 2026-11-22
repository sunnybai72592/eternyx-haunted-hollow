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
import {
  createHardwareEvidence,saveHardwareEvidence,loadHardwareEvidence,
} from "../infrastructure/cyber-range/provider/firecracker-hardware-evidence.mjs";
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
  "Guest service challenge via offline vsock (requires pre-staged guest agent):",
  "  npm run range:microvm:hardware -- --run --confirm-local-kvm --probe-guest [pinned fields]",
  "Manual actual 900-second systemd expiry observation (extra environment opt-in):",
  "  npm run range:microvm:hardware -- --run --confirm-local-kvm --expiry-drill [pinned fields]",
  "Optional protected evidence record (only after a successful local run):",
  "  npm run range:microvm:hardware -- --run --confirm-local-kvm --save-evidence [the same pinned fields as above]",
  "Read-only receipt verifier:",
  "  npm run range:microvm:hardware -- --verify-evidence --session UUID",
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
    if(mode==="--verify-evidence"){
      if(argv.length!==3||argv[1]!=="--session"||
         !validSessionId(argv[2]))throw Error("Invalid receipt inspection");
      console.log(JSON.stringify(await loadHardwareEvidence(argv[2])));
    }else if(mode==="--verify-stopped"){
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
      const modes=new Set();
      let cursor=run?2:1;
      if(run){
        for(;cursor<argv.length;cursor++){
          if(!["--save-evidence","--probe-guest","--expiry-drill"].includes(argv[cursor]))
            break;
          if(modes.has(argv[cursor]))throw Error("Duplicate operator mode");
          modes.add(argv[cursor]);
        }
      }
      const saveEvidence=modes.has("--save-evidence");
      const guestProbeEnabled=modes.has("--probe-guest");
      const expiryDrill=modes.has("--expiry-drill");
      if(saveEvidence&&(guestProbeEnabled||expiryDrill))
        throw Error("Legacy receipt cannot attest expanded guest/drill modes");
      const tail=argv.slice(cursor);
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
          ...config,signal:abort.signal,guestProbeEnabled,expiryDrill,
        });
        if(saveEvidence){
          const receipt=createHardwareEvidence({config,result});
          const saved=await saveHardwareEvidence(receipt);
          console.log(JSON.stringify({...result,evidenceRecorded:true,
            evidenceChecksum:saved.checksum}));
        }else{
          console.log(JSON.stringify(result));
        }
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
