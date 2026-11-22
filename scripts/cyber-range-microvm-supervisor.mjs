#!/usr/bin/env node
/**
 * Local root-operator CLI. No daemon, auto-start, public API, cloud SDK,
 * or Firecracker guest launch. Status is read-only; kill is explicit.
 */
import {SystemdMicrovmSupervisor} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";
import {engageLocalHostHalt} from
  "../infrastructure/cyber-range/provider/local-kill-switch.mjs";

const args=process.argv.slice(2);
const usage=[
  "ETERNYX independent offline microVM systemd supervisor",
  "Usage: npm run range:microvm:supervisor -- --status UUID",
  "       npm run range:microvm:supervisor -- --terminate UUID --confirm",
  "       npm run range:microvm:supervisor -- --halt-new-launches --confirm",
  "Requires Linux root + operator approval for any mutation.",
  "Read-only status never starts a VM, creates an account, or charges a cloud provider.",
].join("\n");
const allowed=process.platform==="linux" && process.getuid?.()===0 &&
  process.env.ETERNYX_FIRECRACKER_HOST_EXECUTION==="operator_approved" &&
  process.env.ETERNYX_RANGE_OPERATOR_ACK==="LOCAL_ONLY_NO_PUBLIC_INGRESS";
const validId=s=>typeof s==="string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
if(args.length===0 || (args.length===1&&args[0]==="--help")){
  console.log(usage);
}else{
  try{
    const supervisor=new SystemdMicrovmSupervisor();
    if(args.length===2 && args[0]==="--status" && validId(args[1])){
      const state=await supervisor.attest(args[1]);
      console.log(JSON.stringify({
        sessionId:args[1],supervised:state.supervisorOwned,
        offlineOnly:state.hostNetworkDenied,
        systemdDeadlineArmed:state.externalWatchdogArmed,
        cloudProvisioningAllowed:false,readyForPublicHostedLabs:false,
      }));
    }else if(args.length===3 && args[0]==="--terminate" &&
      validId(args[1])&&args[2]==="--confirm"&&allowed){
      await supervisor.terminate(args[1]);
      if(await supervisor.verifyDead(args[1])!==true)
        throw Error("Teardown not proven");
      console.log("Verified local VM unit stopped and service cgroup empty.");
    }else if(args.length===2 && args[0]==="--halt-new-launches" &&
      args[1]==="--confirm"&&allowed){
      await engageLocalHostHalt();
      console.log("Local host launch halt engaged; review before manual reset.");
    }else{
      throw Error("Invalid or unapproved operator command");
    }
  }catch{
    console.error("Offline microVM supervisor refused the operation or could not verify it.");
    process.exitCode=1;
  }
}
