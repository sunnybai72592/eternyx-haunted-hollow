#!/usr/bin/env node
// Actual one-shot rootless Docker STOP + OS SIGKILL of disposable local worker.
// Absolutely NO remote dispatch, public user execution, automatic retry or restart.
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {lstatSync,mkdtempSync,openSync,closeSync,writeSync,fsyncSync,
 readFileSync,realpathSync,constants} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {labJournalDir,readLabClaim,reserveLabClaim} from "../src/lib/dockerLabRecovery.mjs";
import {validateLiveStopContainer,validateLiveStopHostEvidence,
 validateLiveStopNoDrift} from "../src/lib/dockerLiveStopCrashGate.mjs";

const e=process.env;
const HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=x=>createHash("sha256").update(x).digest("hex");
function run(bin,args,ms=18000){
 const r=spawnSync(bin,args,{shell:false,encoding:"utf8",timeout:ms,
  maxBuffer:524288,env:e,windowsHide:true});
 if(r.error||r.status!==0||typeof r.stdout!=="string")
  throw Error("The bounded live read-only inspection failed.");
 return r.stdout.trim();
}
function liveHost(){
 const script=fileURLToPath(new URL("./docker-host-network-evidence.mjs",import.meta.url));
 const result=JSON.parse(run(process.execPath,[script,"--inspect"],30000));
 return validateLiveStopHostEvidence(result,{
  approvedSourceCommitSha:e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  daemonIdentitySha256:e.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  imageSha256:e.ETERNYX_DOCKER_HOST_IMAGE_SHA256
 });
}
function container(expectedState,baseline){
 const raw=run("docker",["--context",e.ETERNYX_DOCKER_HOST_CONTEXT,
  "container","inspect","--format","{{json .}}",
  e.ETERNYX_DOCKER_HOST_CONTAINER_ID]);
 const obj=JSON.parse(raw);
 return validateLiveStopContainer(obj,{
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  imageSha256:e.ETERNYX_DOCKER_HOST_IMAGE_SHA256,
  managedContainerPolicySha256:baseline.managedContainerPolicySha256
 },expectedState);
}
function privateDir(path){
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||
    st.uid!==process.getuid()||(st.mode&0o077)!==0)
  throw Error("The operator directory must be owner-private and non-symlinked.");
}
function outside(path,other){
 return path!==other&&!path.startsWith(other+"/")&&!other.startsWith(path+"/");
}
function usedPermit(parent,permitId,containerId,commit,runDir){
 const path=join(parent,"approved-stop-permit-"+permitId+".used");
 const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|
  (constants.O_NOFOLLOW||0),0o600);
 try{
  writeSync(fd,JSON.stringify({
   schema:"eternyx-one-time-disposable-docker-stop-permit-v1",
   permitId,containerId,approvedCommit:commit,runDir,usedAt:new Date().toISOString()
  })+"\n");
  fsyncSync(fd);
 }finally{closeSync(fd);}
 return path;
}
function childStop(worker,runDir,agentId,claimId,containerId,baseline){
 const token=randomBytes(32).toString("hex");
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[
   worker,runDir,agentId,claimId,containerId,token
  ],{
   env:{...e,ETERNYX_DOCKER_LIVE_STOP_WORKER_NONCE:token,
    ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256:baseline.managedContainerPolicySha256},
   stdio:["ignore","ignore","ignore","ipc"],windowsHide:true
  });
  let acknowledged=false,failed=null,finished=false;
  const alarm=setTimeout(()=>{
   failed=Error("Disposable stop worker exceeded its allowed interval; outcome uncertain.");
   child.kill("SIGKILL");
  },32000);
  child.on("error",err=>{
   failed=Error("Could not launch the disposable stop worker.");
   child.kill("SIGKILL");
  });
  child.on("message",m=>{
   if(acknowledged||!m||m.token!==token||
      m.stage!=="docker_stop_returned_after_fsynced_attempt"||
      m.claimId!==claimId||m.containerId!==containerId){
    failed=Error("Invalid disposable worker completion acknowledgement.");
    child.kill("SIGKILL");return;
   }
   acknowledged=true;
   if(!child.kill("SIGKILL"))
    failed=Error("Unable to SIGKILL the exact disposable worker PID.");
  });
  child.once("close",(_,signal)=>{
   if(finished)return;finished=true;clearTimeout(alarm);
   if(failed)reject(failed);
   else if(!acknowledged||signal!=="SIGKILL")
    reject(Error("Worker did not terminate via SIGKILL after one Docker stop."));
   else resolve({workerSIGKILLObserved:true,stopCLIReportedReturn:true});
  });
 });
}
try{
 if(process.argv.length!==3||process.argv[2]!=="--one-disposable-stop"||
    process.platform!=="linux"||typeof process.getuid!=="function"||
    process.getuid()===0||e.CI==="true"||e.GITHUB_ACTIONS==="true"||
    e.ETERNYX_DOCKER_LIVE_STOP_APPROVAL!=="I_APPROVE_ONE_DISPOSABLE_PINNED_STOP"||
    e.ETERNYX_DOCKER_LIVE_STOP_SITE_WITNESS!=="INDEPENDENT_PHYSICAL_ISOLATION_REVIEW_COMPLETED"||
    e.ETERNYX_DOCKER_HOST_READONLY_APPROVAL!=="I_APPROVE_LOCAL_DOCKER_INSPECTION"||
    e.ETERNYX_DOCKER_HOST_NETWORK_APPROVAL!=="I_APPROVE_LOCAL_NETWORK_INSPECTION"||
    e.ETERNYX_REMOTE_LAB_ENABLED==="true"||e.DOCKER_REMOTE_LAB_ENABLED==="true"||
    !SHA.test(e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA||"")||
    !HEX.test(e.ETERNYX_DOCKER_HOST_CONTAINER_ID||"")||
    !HEX.test(e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256||"")||
    !UUID.test(e.ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID||""))
  throw Error("Separate written permit, approved source, isolated host, and exact pinned disposable target required.");
 const parent=realpathSync(e.ETERNYX_DOCKER_LIVE_STOP_PRIVATE_DIR||"");
 privateDir(parent);
 const live=realpathSync(labJournalDir);
 const repo=realpathSync(process.cwd());
 if(!outside(parent,live)||!outside(parent,repo))
  throw Error("Operator drill evidence must be outside live journals and source.");
 const baseline=liveHost();
 if(baseline.managedContainerPolicySha256!==e.ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256)
  throw Error("Independent operator security-policy digest does not match real Docker.");
 container("running",baseline);
 const runDir=mkdtempSync(join(parent,"eternyx-real-docker-stop-"));
 privateDir(runDir);
 const permitPath=usedPermit(parent,e.ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID,
  e.ETERNYX_DOCKER_HOST_CONTAINER_ID,e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,runDir);
 const agentId=randomUUID(),claimId=randomUUID();
 const worker=fileURLToPath(new URL("./docker-live-stop-crash-worker.mjs",import.meta.url));
 const processOutcome=await childStop(worker,runDir,agentId,claimId,
  e.ETERNYX_DOCKER_HOST_CONTAINER_ID,baseline);
 const record=readLabClaim(claimId,runDir);
 if(record.agentId!==agentId||record.claimId!==claimId||
    record.containerId!==e.ETERNYX_DOCKER_HOST_CONTAINER_ID||
    record.operation!=="stop"||record.outcome!==null||
    !record.attempted||record.acknowledged||
    JSON.stringify(record.events)!=='["reserved","attempted"]')
  throw Error("Crash journal must remain unresolved after the actual stop.");
 const lock=join(runDir,"agent-"+agentId+".lock"),journal=join(runDir,
  "claim-"+claimId+".jsonl");
 for(const path of [lock,journal]){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0)throw Error("Preserved crash journal or stale lock unsafe.");
 }
 let duplicateClaimDenied=false;
 try{reserveLabClaim({agentId,claimId,
  containerId:e.ETERNYX_DOCKER_HOST_CONTAINER_ID,operation:"stop"},runDir);}
 catch(err){duplicateClaimDenied=err?.code==="EEXIST";}
 if(!duplicateClaimDenied)throw Error("Duplicate Docker mutation claim not permanently reserved.");
 const post=container("stopped",baseline);
 const after=liveHost();
 validateLiveStopNoDrift(baseline,after);
 const report={
  schema:"eternyx-docker-live-disposable-stop-worker-sigkill-v1",
  recordedAt:new Date().toISOString(),
  sourceCommitSha:baseline.approvedSourceCommitSha,
  containerId:baseline.containerId,
  imageSha256:baseline.imageSha256,
  daemonIdentitySha256:baseline.daemonIdentitySha256,
  socketEndpointSha256:baseline.socketEndpointSha256,
  policySha256:baseline.managedContainerPolicySha256,
  routeSnapshotSha256:baseline.routeSnapshotSha256,
  permitId:e.ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID,
  permitRecordSha256:hash(readFileSync(permitPath)),
  journalSha256:hash(readFileSync(journal)),lockSha256:hash(readFileSync(lock)),
  claimId,agentId,recordedAttemptedWithoutOutcome:true,
  workerSIGKILLObserved:processOutcome.workerSIGKILLObserved,
  stopCLIReportedReturn:processOutcome.stopCLIReportedReturn,
  realPinnedDockerContainerObservedExited:post.status==="exited",
  duplicateClaimDenied,staleLockPreserved:true,
  rootlessLiveHostInspectedBeforeAndAfter:true,
  rootlessHostPolicyAndRoutesStable:true,
  actualSignedAgentInterrupted:false,
  originalSignedDispatchTested:false,
  serverReceiptVerified:false,
  automaticRetryAuthorized:false,
  productionDeploymentAuthorized:false,
  stagingDockerExecutionAuthorized:false,
  independentHumanReviewRequired:true
 };
 const observation=join(runDir,"live-stop-crash-evidence.json");
 const fd=openSync(observation,constants.O_CREAT|constants.O_EXCL|
  constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
 try{writeSync(fd,JSON.stringify(report,null,2)+"\n");fsyncSync(fd);}
 finally{closeSync(fd);}
 process.stdout.write(JSON.stringify({
  ...report,evidenceSha256:hash(readFileSync(observation)),
  privateEvidenceDirectory:runDir
 },null,2)+"\n");
}catch{
 process.stderr.write("One-shot disposable Docker stop/crash drill refused or unresolved. Inspect the private permit, fsynced attempted journal, stale lock and Docker state MANUALLY. Never retry the stopped claim, unlock automatically or enable a remote or production Docker workflow.\n");
 process.exitCode=1;
}
