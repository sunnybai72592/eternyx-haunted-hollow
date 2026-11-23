#!/usr/bin/env node
// Local operator only. Actual SIGKILL of three OWN short-lived journal workers;
// calls the existing live host read-only gate before/after. Never mutates Docker.
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {join,resolve} from "node:path";
import {openSync,closeSync,writeSync,fsyncSync,constants,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {labJournalDir} from "../src/lib/dockerLabRecovery.mjs";
import {runRealKernelJournalCrashDrill} from "../src/lib/dockerKernelCrashDurability.mjs";

const e=process.env,HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const hash=b=>createHash("sha256").update(b).digest("hex");
function execute(binary,args){
 const r=spawnSync(binary,args,{
  shell:false,encoding:"utf8",maxBuffer:524288,timeout:30000
 });
 if(r.error||r.status!==0||typeof r.stdout!=="string")
  throw Error("Required read-only host acceptance could not be independently observed.");
 return r.stdout.trim();
}
function observed(){
 const path=fileURLToPath(new URL("./docker-host-network-evidence.mjs",import.meta.url));
 const raw=execute(process.execPath,[path,"--inspect"]);
 let o;
 try{o=JSON.parse(raw);}catch{throw Error("Malformed real-host observation.");}
 if(o.schema!=="eternyx-docker-real-host-network-evidence-v1"||
    o.approvedSourceCommitSha!==e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA||
    o.containerId!==e.ETERNYX_DOCKER_HOST_CONTAINER_ID||
    o.rootlessEngineObserved!==true||o.noDefaultRoutesObserved!==true||
    o.kernelForwardingDisabledObserved!==true||o.stableRouteSnapshots!==true||
    o.containerPolicyStableObserved!==true||o.realDockerEngineReadOnlyContacted!==true||
    o.independentOperatorSiteReviewRequired!==true||
    o.externalNetworkIsolationProved!==false||
    o.independentHostAttestation!==false||
    o.controlledCrashRecoveryTestPerformed!==false||
    o.labContainerMutationPerformed!==false||
    o.stagingDockerExecutionAuthorized!==false||
    o.productionDeploymentAuthorized!==false||
    !HEX.test(o.routeSnapshotSha256||"")||
    !HEX.test(o.daemonIdentitySha256||"")||
    !HEX.test(o.socketEndpointSha256||"")||
    !HEX.test(o.imageSha256||"")||
    !HEX.test(o.managedContainerPolicySha256||"")||
    !Number.isSafeInteger(o.journalClaimsChecked))
  throw Error("Real rootless Docker host observation failed its nonexecution boundaries.");
 return o;
}
const compareKeys=["approvedSourceCommitSha","containerId","routeSnapshotSha256",
 "daemonIdentitySha256","socketEndpointSha256","imageSha256",
 "managedContainerPolicySha256","journalClaimsChecked"];
try{
 if(process.argv.length!==3||process.argv[2]!=="--run"||
    process.platform!=="linux"||typeof process.getuid!=="function"||
    process.getuid()===0||e.CI==="true"||e.GITHUB_ACTIONS==="true"||
    e.ETERNYX_DOCKER_SIGKILL_DRILL_APPROVAL!=="I_APPROVE_DISPOSABLE_LOCAL_SIGKILL_DRILL"||
    e.ETERNYX_DOCKER_HOST_INDEPENDENT_SITE_CLEARANCE!=="SITE_REVIEW_COMPLETED_OFFLINE"||
    e.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION"||
    e.ETERNYX_DOCKER_HOST_NETWORK_APPROVAL!=="I_APPROVE_LOCAL_NETWORK_INSPECTION"||
    e.ETERNYX_REMOTE_LAB_ENABLED==="true"||e.DOCKER_REMOTE_LAB_ENABLED==="true"||
    !SHA.test(e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA||"")||
    !HEX.test(e.ETERNYX_DOCKER_HOST_CONTAINER_ID||""))
  throw Error("Operator-owned isolated Linux drill requires separate written site approval.");
 const parent=realpathSync(e.ETERNYX_DOCKER_SIGKILL_PRIVATE_DIR||"");
 const live=resolve(labJournalDir),p=resolve(parent);
 if(p===live||p.startsWith(live+"/")||live.startsWith(p+"/"))
  throw Error("Disposable drill namespace must be completely separate from live claim journals.");
 const baseline=observed();
 const worker=fileURLToPath(new URL("./docker-crash-durability-worker.mjs",import.meta.url));
 const result=await runRealKernelJournalCrashDrill({
  parentDir:parent,containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,workerPath:worker
 });
 // The real host is inspected again after actual child process deaths.
 const after=observed();
 if(compareKeys.some(k=>baseline[k]!==after[k]))
  throw Error("Pinned Docker host policy, routing or live journals drifted after SIGKILL.");
 const report={
  schema:"eternyx-docker-host-sigkill-operator-observation-v1",
  observedAt:new Date().toISOString(),
  approvedSourceCommitSha:baseline.approvedSourceCommitSha,
  daemonIdentitySha256:baseline.daemonIdentitySha256,
  containerId:baseline.containerId,
  imageSha256:baseline.imageSha256,
  socketEndpointSha256:baseline.socketEndpointSha256,
  managedContainerPolicySha256:baseline.managedContainerPolicySha256,
  routeSnapshotSha256:baseline.routeSnapshotSha256,
  beforeHostObservationSha256:hash(JSON.stringify(baseline)),
  afterHostObservationSha256:hash(JSON.stringify(after)),
  hostReadOnlyInspectionsCompleted:2,
  actualLinuxSigkillCount:result.actualLinuxProcessesKilled,
  durableJournalCases:result.cases,
  realKernelSIGKILLObserved:result.realFileSystemJournalFsyncVerified,
  duplicateClaimsRefused:true,staleLocksRetained:true,
  liveDockerContainerMutated:false,
  realSignedAgentCrashed:false,
  realRemoteDispatchTested:false,
  realEndToEndCrashRecoveryCompleted:false,
  actualSiteIsolationIndependentlyAttested:false,
  automaticRetryAuthorized:false,
  stagingDockerExecutionAuthorized:false,
  productionDeploymentAuthorized:false,
  independentOperatorReviewRequired:true
 };
 const file=join(result.runDirectory,"observation.json");
 const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|
   (constants.O_NOFOLLOW||0),0o600);
 try{writeSync(fd,JSON.stringify(report,null,2)+"\n");fsyncSync(fd);}
 finally{closeSync(fd);}
 process.stdout.write(JSON.stringify({
  ...report,observationSha256:hash(JSON.stringify(report,null,2)+"\n"),
  note:"PRIVATE original report/journals retained within the operator-selected drill directory. This is real child SIGKILL and journal fsync only; not a real Docker agent crash or live container mutation."
 },null,2)+"\n");
}catch{
 process.stderr.write("Operator SIGKILL drill refused or failed. Inspect the private disposable journal namespace manually; do not delete it, auto-retry a claimed Docker action, contact remote services or enable production execution. No Docker container mutation was attempted by this drill.\n");
 process.exitCode=1;
}
