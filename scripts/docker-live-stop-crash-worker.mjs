#!/usr/bin/env node
// One-use, operator-approved disposable container stop followed by parent SIGKILL.
// No signed remote dispatch, no automatic retry, no container start or restart.
import {spawnSync} from "node:child_process";
import {readFileSync,lstatSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {lockLabAgent,reserveLabClaim,appendLabEvent} from "../src/lib/dockerLabRecovery.mjs";
import {validateLiveStopContainer,validateLiveStopHostEvidence} from "../src/lib/dockerLiveStopCrashGate.mjs";
import {validateDockerHostReadOnlyPins} from "../src/lib/dockerHostReadOnlyAcceptance.mjs";

const e=process.env;
const ID=/^[a-f0-9]{64}$/;
function docker(args){
 const r=spawnSync("docker",args,{encoding:"utf8",shell:false,timeout:20000,maxBuffer:524288,
  windowsHide:true,env:e});
 if(r.error||r.status!==0||typeof r.stdout!=="string")
  throw Error("Controlled disposable Docker stop failed or timed out.");
 return r.stdout.trim();
}
try{
 const [dir,agentId,claimId,containerId,token]=process.argv.slice(2);
 if(process.argv.length!==7||process.platform!=="linux"||
    typeof process.getuid!=="function"||process.getuid()===0||
    e.CI==="true"||e.GITHUB_ACTIONS==="true"||
    !process.send||!ID.test(containerId||"")||
    !/^[a-f0-9]{64}$/.test(token||"")||
    e.ETERNYX_DOCKER_LIVE_STOP_WORKER_NONCE!==token||
    e.ETERNYX_DOCKER_LIVE_STOP_APPROVAL!=="I_APPROVE_ONE_DISPOSABLE_PINNED_STOP"||
    e.ETERNYX_DOCKER_LIVE_STOP_SITE_WITNESS!=="INDEPENDENT_PHYSICAL_ISOLATION_REVIEW_COMPLETED"||
    e.ETERNYX_REMOTE_LAB_ENABLED==="true"||
    e.DOCKER_REMOTE_LAB_ENABLED==="true")
  throw Error("Actual Docker stop child lacked exact isolated-host approval.");
 const pins=validateDockerHostReadOnlyPins({
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  expectedContext:e.ETERNYX_DOCKER_HOST_CONTEXT,
  expectedEndpoint:e.ETERNYX_DOCKER_HOST_ENDPOINT,
  expectedDaemonIdSha256:e.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  expectedImageSha256:e.ETERNYX_DOCKER_HOST_IMAGE_SHA256
 },e);
 if(containerId!==pins.containerId||
    !ID.test(e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256||""))
  throw Error("Actual Docker target differs from the pinned approval.");
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||
    st.uid!==process.getuid()||(st.mode&0o077)!==0)
  throw Error("Disposable crash journal is not operator-owned private directory.");
 const permitId=e.ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(permitId||""))
  throw Error("Approved one-use permit identifier is required.");
 const permitFile=join(dirname(dir),"approved-stop-permit-"+permitId+".used");
 const permitStat=lstatSync(permitFile);
 if(!permitStat.isFile()||permitStat.isSymbolicLink()||
    permitStat.uid!==process.getuid()||(permitStat.mode&0o077)!==0||
    permitStat.size>2048)throw Error("Untrusted one-use permit record.");
 const permit=JSON.parse(readFileSync(permitFile,"utf8"));
 if(permit.schema!=="eternyx-one-time-disposable-docker-stop-permit-v1"||
    permit.permitId!==permitId||permit.containerId!==containerId||
    permit.approvedCommit!==e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA||
    permit.runDir!==dir||permit.agentId!==agentId||permit.claimId!==claimId)
  throw Error("Permit not bound to exact one-time claim and worker.");
 const acceptanceScript=fileURLToPath(new URL("./docker-host-network-evidence.mjs",import.meta.url));
 const hostOutput=spawnSync(process.execPath,[acceptanceScript,"--inspect"],{
  encoding:"utf8",shell:false,maxBuffer:524288,timeout:30000,env:e,windowsHide:true
 });
 if(hostOutput.error||hostOutput.status!==0||typeof hostOutput.stdout!=="string")
  throw Error("Second rootless real-host operator acceptance failed before Docker mutation.");
 const hostEvidence=validateLiveStopHostEvidence(JSON.parse(hostOutput.stdout),{
  approvedSourceCommitSha:e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  containerId,daemonIdentitySha256:pins.expectedDaemonIdSha256,
  imageSha256:pins.expectedImageSha256,
  managedContainerPolicySha256:e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256,
  socketEndpointSha256:e.ETERNYX_DOCKER_HOST_SOCKET_SHA256,
  routeSnapshotSha256:e.ETERNYX_DOCKER_HOST_ROUTE_SHA256
 });
 if(hostEvidence.managedContainerPolicySha256!==e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256)
  throw Error("Pinned disposable container policy changed before mutation.");
 const fullPins={
  containerId:pins.containerId,imageSha256:pins.expectedImageSha256,
  managedContainerPolicySha256:e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256
 };
 // An independent second preflight happens just before the real one-shot mutation.
 const raw=docker(["--context",pins.expectedContext,"container","inspect",
  "--format","{{json .}}",containerId]);
 const target=JSON.parse(raw);
 validateLiveStopContainer(target,fullPins,"running");
 const unlock=lockLabAgent(agentId,dir);
 // Intentionally do not release lock on the SIGKILL path.
 reserveLabClaim({agentId,claimId,operation:"stop",containerId},dir);
 appendLabEvent(claimId,"attempted",dir); // fsync BEFORE mutating Docker.
 // This is the *only* actual Docker mutation in the whole drill.
 docker(["--context",pins.expectedContext,"container","stop","--time","5",containerId]);
 // DO NOT journal completed/failed; supervising operator sends SIGKILL here.
 process.send({stage:"docker_stop_returned_after_fsynced_attempt",token,
  claimId,containerId},err=>{
  if(err)process.exit(2);
  setInterval(()=>{},60000);
 });
}catch{
 // Any durable attempt remains ambiguous. Never send another stop command.
 process.exitCode=2;
}
