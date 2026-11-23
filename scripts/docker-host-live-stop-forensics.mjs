#!/usr/bin/env node
// Operator-only retrospective real-host forensic RE-INSPECTION. No Docker
// mutations, journal repairs, receipt replay, lock cleanup or signed dispatch.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {openSync,closeSync,readFileSync,fstatSync,lstatSync,readdirSync,
 realpathSync,constants} from "node:fs";
import {join,dirname,basename,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {labJournalDir,readLabClaim} from "../src/lib/dockerLabRecovery.mjs";
import {validateDockerHostReadOnlyPins} from "../src/lib/dockerHostReadOnlyAcceptance.mjs";
import {validateLiveStopContainer,validateLiveStopHostEvidence,
 validateLiveStopNoDrift} from "../src/lib/dockerLiveStopCrashGate.mjs";
import {reconcileLiveStopCrashArtifacts,
 validateLiveStopForensicPins} from "../src/lib/dockerLiveStopForensics.mjs";

const e=process.env;
const HEX=/^[a-f0-9]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest=v=>createHash("sha256").update(v).digest("hex");
function ownerDir(path){
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0)throw Error("Untrusted owner-private forensic directory.");
 return path;
}
function safeFile(path,max=16384){
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.uid!==process.getuid()|| (st.mode&0o077)!==0||
    st.size<2||st.size>max)throw Error("Untrusted private forensic file.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
function cmd(bin,args,ms=18000){
 const r=spawnSync(bin,args,{shell:false,encoding:"utf8",timeout:ms,
  maxBuffer:524288,windowsHide:true,env:e});
 if(r.error||r.status!==0||typeof r.stdout!=="string")
  throw Error("Read-only host or Docker inspection failed.");
 return r.stdout.trim();
}
function pins(){
 return validateLiveStopForensicPins({
  originalSourceCommitSha:e.ETERNYX_DOCKER_LIVE_STOP_ORIGINAL_COMMIT_SHA,
  currentReviewCommitSha:e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  daemonIdentitySha256:e.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  socketEndpointSha256:e.ETERNYX_DOCKER_HOST_SOCKET_SHA256,
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  imageSha256:e.ETERNYX_DOCKER_HOST_IMAGE_SHA256,
  policySha256:e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256,
  routeSnapshotSha256:e.ETERNYX_DOCKER_HOST_ROUTE_SHA256,
  permitId:e.ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID
 });
}
function host(p){
 const script=fileURLToPath(new URL("./docker-host-network-evidence.mjs",import.meta.url));
 const info=JSON.parse(cmd(process.execPath,[script,"--inspect"],30000));
 return validateLiveStopHostEvidence(info,{
  approvedSourceCommitSha:p.currentReviewCommitSha,
  containerId:p.containerId,daemonIdentitySha256:p.daemonIdentitySha256,
  socketEndpointSha256:p.socketEndpointSha256,
  imageSha256:p.imageSha256,
  managedContainerPolicySha256:p.policySha256,
  routeSnapshotSha256:p.routeSnapshotSha256
 });
}
function container(p){
 const o=JSON.parse(cmd("docker",[
  "--context",e.ETERNYX_DOCKER_HOST_CONTEXT,
  "container","inspect","--format","{{json .}}",p.containerId
 ]));
 validateLiveStopContainer(o,{
  containerId:p.containerId,imageSha256:p.imageSha256,
  managedContainerPolicySha256:p.policySha256
 },"stopped");
 if(typeof o.State?.StartedAt!=="string"||typeof o.State?.FinishedAt!=="string")
  throw Error("Missing real Docker container lifecycle observations.");
 return {running:o.State.Running,status:o.State.Status,
  startedAt:o.State.StartedAt,finishedAt:o.State.FinishedAt};
}
try{
 if(process.argv.length!==4||process.argv[2]!=="--review"||
    process.platform!=="linux"||typeof process.getuid!=="function"||
    process.getuid()===0||e.CI==="true"||e.GITHUB_ACTIONS==="true"||
    e.ETERNYX_DOCKER_LIVE_STOP_FORENSIC_APPROVAL!=="I_APPROVE_READ_ONLY_LIVE_STOP_REVIEW"||
    e.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION"||
    e.ETERNYX_DOCKER_HOST_NETWORK_APPROVAL!=="I_APPROVE_LOCAL_NETWORK_INSPECTION"||
    e.ETERNYX_REMOTE_LAB_ENABLED==="true"||
    e.DOCKER_REMOTE_LAB_ENABLED==="true")
  throw Error("Independent operator forensic review approval required.");
 const p=pins();
 validateDockerHostReadOnlyPins({
  containerId:p.containerId,expectedContext:e.ETERNYX_DOCKER_HOST_CONTEXT,
  expectedEndpoint:e.ETERNYX_DOCKER_HOST_ENDPOINT,
  expectedDaemonIdSha256:p.daemonIdentitySha256,
  expectedImageSha256:p.imageSha256
 },e);
 const supplied=process.argv[3];
 if(!supplied.startsWith("/")||resolve(supplied)!==supplied)
  throw Error("Canonical absolute evidence path required.");
 ownerDir(supplied);
 const runDir=realpathSync(supplied);
 if(runDir!==supplied||!/^eternyx-real-docker-stop-[A-Za-z0-9_-]+$/.test(basename(runDir)))
  throw Error("Unexpected or symlinked disposable run folder.");
 const parent=realpathSync(e.ETERNYX_DOCKER_LIVE_STOP_PRIVATE_DIR||"");
 ownerDir(parent);
 if(dirname(runDir)!==parent)
  throw Error("Run folder is outside the independently approved private parent.");
 const live=realpathSync(labJournalDir);
 if(runDir===live||runDir.startsWith(live+"/")||live.startsWith(runDir+"/"))
  throw Error("Refusing to inspect a real agent journal as disposable evidence.");
 const reportName="live-stop-crash-evidence.json";
 const reportBytes=safeFile(join(runDir,reportName));
 const report=JSON.parse(reportBytes.toString("utf8"));
 if(!UUID.test(report.claimId||"")||!UUID.test(report.agentId||""))
  throw Error("Recorded run lacks bounded exact agent and claim identities.");
 const journalName="claim-"+report.claimId+".jsonl",lockName="agent-"+report.agentId+".lock";
 const expected=[journalName,lockName,reportName].sort();
 if(JSON.stringify(readdirSync(runDir).sort())!==JSON.stringify(expected))
  throw Error("Unknown, missing or changed disposable evidence files.");
 const permitPath=join(parent,"approved-stop-permit-"+p.permitId+".used");
 const snapshot=()=>{
  const permitBytes=safeFile(permitPath);
  const journalBytes=safeFile(join(runDir,journalName));
  const lockBytes=safeFile(join(runDir,lockName));
  const reportBytesNow=safeFile(join(runDir,reportName));
  if(!reportBytesNow.equals(reportBytes))
   throw Error("Original observation changed between read-only inspections.");
  const permit=JSON.parse(permitBytes.toString("utf8"));
  const claim=readLabClaim(report.claimId,runDir);
  const hashes={
   permitRecordSha256:digest(permitBytes),journalSha256:digest(journalBytes),
   lockSha256:digest(lockBytes)
  };
  return {permit,claim,hashes,
   forensicRecordSha256:digest(reportBytes),
   snapshotSha256:digest(Buffer.concat([permitBytes,journalBytes,lockBytes,reportBytesNow]))
  };
 };
 const beforeFiles=snapshot();
 const correlated=reconcileLiveStopCrashArtifacts({
  report,permit:beforeFiles.permit,claim:beforeFiles.claim,
  hashes:beforeFiles.hashes,pins:p,runDir
 });
 const beforeHost=host(p),beforeContainer=container(p);
 const afterContainer=container(p),afterHost=host(p);
 validateLiveStopNoDrift(beforeHost,afterHost);
 if(JSON.stringify(beforeContainer)!==JSON.stringify(afterContainer))
  throw Error("Container changed during repeated, read-only forensic inspection.");
 const afterFiles=snapshot();
 if(beforeFiles.snapshotSha256!==afterFiles.snapshotSha256)
  throw Error("Original disposable permit or journal changed during inspection.");
 if(readdirSync(runDir).sort().join("\n")!==expected.join("\n"))
  throw Error("Disposable evidence inventory changed during inspection.");
 process.stdout.write(JSON.stringify({
  ...correlated,
  schema:"eternyx-docker-live-stop-read-only-reinspection-v1",
  observedAt:new Date().toISOString(),
  originalEvidenceFileSha256:beforeFiles.forensicRecordSha256,
  originalEvidenceSnapshotSha256:beforeFiles.snapshotSha256,
  actualRootlessDockerEngineInspectedNow:true,
  liveContainerStatusObservedNow:beforeContainer.status,
  liveContainerRunningObservedNow:beforeContainer.running,
  stableDoubleDockerContainerInspection:true,
  stableBeforeAfterNetworkPolicyInspection:true,
  originalPrivateBytesStableDuringReview:true,
  originalStopAttributionIndependentlyVerified:false,
  independentPhysicalSiteApprovalStillRequired:true
 },null,2)+"\n");
}catch{
 process.stderr.write("Read-only live Docker stop forensics refused: validate independent original/review SHA and host pins, operator site approval, exact existing private permit and journal, no unresolved real agent claims, stable current isolated rootless Docker state and original evidence. No mutation, receipt replay, journal edit or stale-lock cleanup attempted.\n");
 process.exitCode=1;
}
