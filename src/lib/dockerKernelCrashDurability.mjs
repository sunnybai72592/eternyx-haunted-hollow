// Actual local Linux kernel SIGKILL + fsync durability exercise.
// ONLY a throwaway private journal namespace is written. No Docker mutations,
// real agent process termination, network calls or receipt replay.
import {spawn} from "node:child_process";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,lstatSync,readFileSync,readdirSync} from "node:fs";
import {join,isAbsolute} from "node:path";
import {readLabClaim,reserveLabClaim} from "./dockerLabRecovery.mjs";

const FULL=/^[a-f0-9]{64}$/;
const STAGES=["reserved","attempted","terminal"];
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const stages={
 reserved:["reserved"],
 attempted:["reserved","attempted"],
 terminal:["reserved","attempted","failed"]
};
const checkPrivateDir=(path)=>{
 if(!isAbsolute(path))throw Error("Absolute private drill directory required.");
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||
    st.uid!==process.getuid()||(st.mode&0o077)!==0)
  throw Error("Drill directory must be real, owned and private 0700.");
};
async function terminateAfterFsync(worker,stage,dir,agentId,claimId,containerId){
 const token=randomBytes(32).toString("hex");
 const child=spawn(process.execPath,[worker,stage,dir,agentId,claimId,containerId,token],{
  env:{ETERNYX_DOCKER_CRASH_WORKER_TOKEN:token},stdio:["ignore","ignore","ignore","ipc"],
  windowsHide:true
 });
 return await new Promise((resolve,reject)=>{
  let ready=false,finished=false;
  const timeout=setTimeout(()=>{
   child.kill("SIGKILL");
   complete(Error("Durability child did not acknowledge fsync within timeout."));
  },8000);
  function complete(error){
   if(finished)return;
   finished=true;clearTimeout(timeout);
   if(error)reject(error);else resolve();
  }
  child.once("error",()=>complete(Error("Unable to spawn disposable crash worker.")));
  child.on("message",m=>{
   if(finished)return;
   if(ready||!m||m.token!==token||m.stage!==stage||
      m.fsyncComplete!==true){
    child.kill("SIGKILL");
    complete(Error("Invalid fsynced child acknowledgement."));
    return;
   }
   ready=true;
   if(!child.kill("SIGKILL"))
    complete(Error("Could not terminate exactly the disposable child process."));
  });
  child.once("close",(code,signal)=>{
   if(!finished){
    if(!ready||signal!=="SIGKILL")complete(Error("Worker did not exit by actual SIGKILL."));
    else complete(null);
   }
  });
 });
}
export async function runRealKernelJournalCrashDrill({
 parentDir,containerId,workerPath
}){
 if(process.platform!=="linux"||typeof process.getuid!=="function"||
    process.getuid()===0||!FULL.test(containerId||"")||
    !isAbsolute(workerPath||""))
  throw Error("Non-root Linux host, exact pinned container and worker required.");
 checkPrivateDir(parentDir);
 const runDir=mkdtempSync(join(parentDir,"eternyx-sigkill-"));
 checkPrivateDir(runDir);
 const observed=[];
 for(const stage of STAGES){
  const dir=join(runDir,stage);
  mkdirSync(dir,{mode:0o700});
  checkPrivateDir(dir);
  const agentId=randomUUID(),claimId=randomUUID();
  await terminateAfterFsync(workerPath,stage,dir,agentId,claimId,containerId);
  const st=readLabClaim(claimId,dir);
  if(st.agentId!==agentId||st.claimId!==claimId||
    st.containerId!==containerId||st.operation!=="stop"||
    JSON.stringify(st.events)!==JSON.stringify(stages[stage])||
    st.acknowledged!==false||st.attentionRequired!==true||
    st.attempted!==(stage!=="reserved")||
    st.outcome!==(stage==="terminal"?"failed":null))
   throw Error("Real child termination did not preserve expected durable journal.");
  const files=readdirSync(dir);
  const claimName="claim-"+claimId+".jsonl",lockName="agent-"+agentId+".lock";
  if(files.length!==2||!files.includes(claimName)||!files.includes(lockName))
   throw Error("Crash-durable lock and claim are incomplete.");
  for(const name of files){
   const stat=lstatSync(join(dir,name));
   if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||
      (stat.mode&0o077)!==0||stat.size>16384)
    throw Error("Crash journal or operator lock has unsafe ownership/permissions.");
  }
  let duplicateDenied=false;
  try{reserveLabClaim({agentId,claimId,containerId,operation:"stop"},dir);}
  catch(e){duplicateDenied=e?.code==="EEXIST";}
  if(!duplicateDenied)throw Error("A duplicate claim unexpectedly reserved after SIGKILL.");
  observed.push({
   stage,realChildKilledBySigkill:true,fsyncedJournalSurvived:true,
   staleLockRetained:true,duplicateClaimDenied:true,
   claimId,agentId,journalStage:st.events.join("_"),
   journalSha256:digest(readFileSync(join(dir,claimName))),
   lockSha256:digest(readFileSync(join(dir,lockName))),
   actualDockerActionAttempted:false,receiptReplayed:false
  });
 }
 return {
  schema:"eternyx-docker-kernel-sigkill-durability-v1",
  mode:"operator_only_actual_linux_kernel_process_crash",
  recordedAt:new Date().toISOString(),
  runDirectory:runDir,
  cases:observed,
  actualLinuxProcessesKilled:STAGES.length,
  realFileSystemJournalFsyncVerified:true,
  survivingLocksRequireManualInvestigation:true,
  liveDockerContainerMutated:false,
  realSignedDockerAgentKilled:false,
  remoteSignedDispatchVerified:false,
  productionDeploymentAuthorized:false,
  stagingDockerExecutionAuthorized:false,
  automaticDockerRetryAuthorized:false
 };
}
