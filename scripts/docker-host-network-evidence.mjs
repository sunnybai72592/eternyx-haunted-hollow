#!/usr/bin/env node
// On-host, read-only inspection. NEVER starts/stops/executes Docker workloads.
// A green report is NOT production authorization or physical host attestation.
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {buildDockerHostNetworkEvidence} from "../src/lib/dockerHostNetworkEvidence.mjs";
const env=process.env;
function run(bin,args,maxBuffer=65536){
 const r=spawnSync(bin,args,{
  shell:false,encoding:"utf8",windowsHide:true,timeout:18000,maxBuffer,
  env
 });
 if(r.error||r.status!==0||typeof r.stdout!=="string")
  throw Error("An authorized on-host read-only prerequisite failed.");
 return r.stdout.trim();
}
const read=(path)=>readFileSync(path,"utf8").trim();
const routes=()=>({
 v4:run("ip",["-j","-4","route","show","table","all"]),
 v6:run("ip",["-j","-6","route","show","table","all"])
});
try{
 if(process.argv.length!==3||process.argv[2]!=="--inspect"||
  process.platform!=="linux"||typeof process.getuid!=="function"||
  process.getuid()===0||env.GITHUB_ACTIONS==="true"||env.CI==="true"||
  env.ETERNYX_DOCKER_HOST_NETWORK_APPROVAL!=="I_APPROVE_LOCAL_NETWORK_INSPECTION"||
  env.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION"||
  env.ETERNYX_REMOTE_LAB_ENABLED==="true"||
  env.DOCKER_REMOTE_LAB_ENABLED==="true")
   throw Error("Explicit non-CI unprivileged operator approval required.");
 const expected=env.ETERNYX_DOCKER_APPROVED_COMMIT_SHA;
 if(!/^[a-f0-9]{40}$/.test(expected||""))
  throw Error("Pinned 40-character Git revision required.");
 // The first Linux routing snapshot precedes any Docker CLI contact.
 const firstRoutes=routes();
 const forwardingV4=read("/proc/sys/net/ipv4/ip_forward");
 const forwardingV6=read("/proc/sys/net/ipv6/conf/all/forwarding");
 const commitSha=run("git",["rev-parse","--verify","HEAD"]);
 const status=run("git",["status","--porcelain","--untracked-files=no"]);
 if(commitSha!==expected||status!=="")
  throw Error("Docker host code does not match approved clean Git revision.");
 const inspector=fileURLToPath(new URL("./docker-host-readonly-acceptance.mjs",import.meta.url));
 const output=run(process.execPath,[inspector,"--inspect"],524288);
 let observation;
 try{observation=JSON.parse(output);}catch{throw Error("Docker metadata output invalid.");}
 const secondRoutes=routes();
 const report=buildDockerHostNetworkEvidence({
  observation,firstRoutes,secondRoutes,forwardingV4,forwardingV6,
  commitSha,expectedCommitSha:expected,gitDirty:status!==""
 });
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}catch{
 process.stderr.write("Real isolated Docker host network evidence refused. Check host approvals, exact clean source pin, non-root user, pinned rootless Docker engine, all journals, disabled forwarding, and absence of default routes. No Docker mutation or remote call was attempted by this wrapper.\n");
 process.exitCode=1;
}
