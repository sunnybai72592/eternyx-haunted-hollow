#!/usr/bin/env node
// Local operator ONLY. --preflight does not contact Docker. --inspect reads
// only pinned Unix-socket Docker metadata; it cannot run or change a container.
import {spawnSync} from "node:child_process";
import {lstatSync,readdirSync} from "node:fs";
import {validateDockerHostReadOnlyPins,inspectDockerHostReadOnly}
 from "../src/lib/dockerHostReadOnlyAcceptance.mjs";
import {listLabClaims,labJournalDir} from "../src/lib/dockerLabRecovery.mjs";
const env=process.env;
function pins(){
 return {containerId:env.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  expectedContext:env.ETERNYX_DOCKER_HOST_CONTEXT,
  expectedEndpoint:env.ETERNYX_DOCKER_HOST_ENDPOINT,
  expectedDaemonIdSha256:env.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  expectedImageSha256:env.ETERNYX_DOCKER_HOST_IMAGE_SHA256};
}
function docker(args){
 const result=spawnSync("docker",args,{
  encoding:"utf8",shell:false,windowsHide:true,
  timeout:12000,maxBuffer:524288
 });
 if(result.error||result.status!==0)throw Error("Local Docker metadata check failed.");
 return result.stdout.trim();
}
function journals(){
 const names=readdirSync(labJournalDir);
 if(names.length>100||names.some(name=>name.endsWith(".lock"))||
    names.some(name=>!/^claim-[a-f0-9-]{36}\.jsonl$/.test(name)))
  throw Error("Unresolved lock or unrecognized/oversized local journal.");
 return listLabClaims(labJournalDir);
}
try{
 const action=process.argv[2];
 if(process.argv.length!==3||!["--preflight","--inspect"].includes(action))
  throw Error("Use --preflight or --inspect.");
 if(process.platform==="win32"||
    env.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION")
  throw Error("Explicit Linux host read-only inspection approval required.");
 const cfg=validateDockerHostReadOnlyPins(pins(),env);
 if(action==="--preflight"){
  process.stdout.write(JSON.stringify({
   schema:"eternyx-docker-host-preflight-v1",hostPinsWellFormed:true,
   dockerEngineContacted:false,containerMutationPerformed:false,
   productionDeploymentAuthorized:false
  })+"\n");
 }else{
  const report=await inspectDockerHostReadOnly(pins(),{
   env,execDocker:docker,socketStat:lstatSync,
   journalEntries:journals,uid:process.getuid()
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }
}catch{
 process.stderr.write("Local Docker inspection refused: missing operator pins, unsafe socket/context/daemon, unresolved journal, untrusted container or policy drift. No raw Docker inspect or host secrets emitted.\n");
 process.exitCode=1;
}
