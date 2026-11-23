#!/usr/bin/env node
// Disposable process for ACTUAL Linux SIGKILL crash-durability verification.
// Never imports Docker transports, signed dispatch, networking or external URLs.
import {lockLabAgent,reserveLabClaim,appendLabEvent}
 from "../src/lib/dockerLabRecovery.mjs";

const [stage,dir,agentId,claimId,containerId,token]=process.argv.slice(2);
try{
 if(process.platform!=="linux"||!process.send||
    !["reserved","attempted","terminal"].includes(stage)||
    typeof token!=="string"||!(/^[a-f0-9]{64}$/.test(token))||
    process.env.ETERNYX_DOCKER_CRASH_WORKER_TOKEN!==token)
  throw Error("Only the supervising local crash drill may start a worker.");
 // Intentionally never unlock: a SIGKILL must leave the local lock in place.
 lockLabAgent(agentId,dir);
 reserveLabClaim({agentId,claimId,containerId,operation:"stop"},dir);
 if(stage!=="reserved")appendLabEvent(claimId,"attempted",dir);
 if(stage==="terminal")appendLabEvent(claimId,"failed",dir);
 process.send({stage,token,fsyncComplete:true},err=>{
  if(err)process.exit(2);
  // Remain alive until the supervising operator test terminates THIS child.
  setInterval(()=>{},60000);
 });
}catch{
 process.exitCode=2;
}
