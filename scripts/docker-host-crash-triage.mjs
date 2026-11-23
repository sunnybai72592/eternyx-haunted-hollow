#!/usr/bin/env node
// Real operator-host crash triage: read-only local network and Docker metadata.
// NEVER replays the claimed mutation, resends receipts, clears locks or edits journals.
import {spawnSync} from "node:child_process";
import {readFileSync,readdirSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {validateDockerHostRouteEvidence} from "../src/lib/dockerHostCrashRoute.mjs";
import {inspectDockerHostReadOnly} from "../src/lib/dockerHostReadOnlyAcceptance.mjs";
import {labJournalDir,readLabClaim,listLabClaims} from "../src/lib/dockerLabRecovery.mjs";

const e=process.env;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function cmd(binary,args,limit=65536){
 const result=spawnSync(binary,args,{
  shell:false,encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:limit
 });
 if(result.error||result.status!==0||typeof result.stdout!=="string")
  throw Error("Bounded read-only local inspection failed.");
 return result.stdout.trim();
}
function inspectJournals(claim){
 const names=readdirSync(labJournalDir);
 if(names.length>100||names.some(n=>!/^claim-[0-9a-f-]{36}\.jsonl$/.test(n)&&
    n!=="agent-"+claim.agentId+".lock"))
  throw Error("Unknown recovery files or concurrent agent lock detected.");
 if(names.includes("agent-"+claim.agentId+".lock")){
  const st=lstatSync(join(labJournalDir,"agent-"+claim.agentId+".lock"));
  if(!st.isFile()||st.isSymbolicLink()||st.size>16384||
    st.uid!==process.getuid()||(st.mode&0o077)!==0)
   throw Error("Untrusted lock file.");
 }
 return listLabClaims(labJournalDir);
}
function routes(){
 return {
  v4:cmd("ip",["-j","-4","route","show","table","all"]),
  v6:cmd("ip",["-j","-6","route","show","table","all"])
 };
}
function pins(){
 return {
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  expectedContext:e.ETERNYX_DOCKER_HOST_CONTEXT,
  expectedEndpoint:e.ETERNYX_DOCKER_HOST_ENDPOINT,
  expectedDaemonIdSha256:e.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  expectedImageSha256:e.ETERNYX_DOCKER_HOST_IMAGE_SHA256
 };
}
try{
 const claimId=process.argv[3];
 if(process.argv.length!==4||process.argv[2]!=="--triage"||
    !UUID.test(claimId||"")||process.platform!=="linux"||
    typeof process.getuid!=="function"||process.getuid()===0||
    e.CI==="true"||e.GITHUB_ACTIONS==="true"||
    e.ETERNYX_DOCKER_HOST_CRASH_TRIAGE_APPROVAL!=="I_APPROVE_READ_ONLY_CRASH_TRIAGE"||
    e.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION"||
    e.ETERNYX_DOCKER_HOST_NETWORK_APPROVAL!=="I_APPROVE_LOCAL_NETWORK_INSPECTION"||
    e.ETERNYX_DOCKER_RECOVERY_PROCESS_CLEARANCE!=="I_VERIFIED_NO_AGENT_PROCESS_RUNNING"||
    e.ETERNYX_REMOTE_LAB_ENABLED==="true"||
    e.DOCKER_REMOTE_LAB_ENABLED==="true")
  throw Error("Manual isolated Linux host crash triage was not authorized.");
 const commit=e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA;
 if(!/^[a-f0-9]{40}$/.test(commit||"")||
   cmd("git",["rev-parse","--verify","HEAD"])!==commit||
   cmd("git",["status","--porcelain","--untracked-files=no"])!=="")
  throw Error("Source commit does not match independently approved revision.");
 const claim=readLabClaim(claimId);
 if(claim.containerId!==e.ETERNYX_DOCKER_HOST_CONTAINER_ID||
    claim.acknowledged||!claim.attentionRequired)
  throw Error("No exact unresolved claim matches operator-pinned container.");
 const before=routes();
 validateDockerHostRouteEvidence(before,
   readFileSync("/proc/sys/net/ipv4/ip_forward","utf8"),
   readFileSync("/proc/sys/net/ipv6/conf/all/forwarding","utf8"));
 const report=await inspectDockerHostReadOnly(pins(),{
  env:e,
  execDocker:args=>cmd("docker",args,524288),
  socketStat:lstatSync,uid:process.getuid(),
  journalEntries:()=>inspectJournals(claim),
  recoveryTriage:claim
 });
 const after=routes();
 const a=validateDockerHostRouteEvidence(after,
   readFileSync("/proc/sys/net/ipv4/ip_forward","utf8"),
   readFileSync("/proc/sys/net/ipv6/conf/all/forwarding","utf8"));
 const b=validateDockerHostRouteEvidence(before,
   "0","0");
 if(a.routeSnapshotSha256!==b.routeSnapshotSha256)
  throw Error("Network routing changed during crash triage.");
 process.stdout.write(JSON.stringify({
  ...report,approvedSourceCommitSha:commit,
  stableHostRouteSnapshotSha256:a.routeSnapshotSha256,
  kernelForwardingDisabledObserved:true,
  actualCrashInjectedByThisCommand:false,
  operatorProcessClearanceIndependentlyVerified:false,
  externalOperatorReviewRequired:true
 },null,2)+"\n");
}catch{
 process.stderr.write("Read-only crash triage refused. Verify the authorized isolated Linux host, independently pinned source/Docker identities, manual agent-process clearance, exact unresolved journal and stable network. No Docker mutation, receipt replay or lock cleanup was attempted.\n");
 process.exitCode=1;
}
