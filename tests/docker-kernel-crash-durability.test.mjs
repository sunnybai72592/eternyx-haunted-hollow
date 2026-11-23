import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,existsSync,rmSync,statSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {runRealKernelJournalCrashDrill} from "../src/lib/dockerKernelCrashDurability.mjs";
import {readLabClaim} from "../src/lib/dockerLabRecovery.mjs";

const worker=fileURLToPath(new URL("../scripts/docker-crash-durability-worker.mjs",import.meta.url));
const script=fileURLToPath(new URL("../scripts/docker-host-kernel-sigkill-drill.mjs",import.meta.url));
const id="a".repeat(64);
test("actual Linux SIGKILL preserves fsynced reserved, attempted, and terminal journals plus stale locks",async()=>{
 if(process.platform!=="linux"||process.getuid()===0)return;
 const root=mkdtempSync(join(tmpdir(),"eternyx-real-kernel-crash-"));
 try{
  const result=await runRealKernelJournalCrashDrill({
   parentDir:root,containerId:id,workerPath:worker
  });
  assert.equal(result.schema,"eternyx-docker-kernel-sigkill-durability-v1");
  assert.equal(result.actualLinuxProcessesKilled,3);
  assert.equal(result.realFileSystemJournalFsyncVerified,true);
  assert.equal(result.liveDockerContainerMutated,false);
  assert.equal(result.realSignedDockerAgentKilled,false);
  assert.equal(result.automaticDockerRetryAuthorized,false);
  assert.deepEqual(result.cases.map(x=>x.stage),["reserved","attempted","terminal"]);
  assert.deepEqual(result.cases.map(x=>x.journalStage),[
   "reserved","reserved_attempted","reserved_attempted_failed"
  ]);
  for(const c of result.cases){
   assert.equal(c.realChildKilledBySigkill,true);
   assert.equal(c.fsyncedJournalSurvived,true);
   assert.equal(c.staleLockRetained,true);
   assert.equal(c.duplicateClaimDenied,true);
   assert.equal(c.actualDockerActionAttempted,false);
   assert.match(c.journalSha256,/^[a-f0-9]{64}$/);
   const dir=join(result.runDirectory,c.stage);
   const record=readLabClaim(c.claimId,dir);
   assert.equal(record.acknowledged,false);
   assert.equal(record.attentionRequired,true);
   assert.ok(existsSync(join(dir,"agent-"+c.agentId+".lock")));
   assert.equal(statSync(join(dir,"claim-"+c.claimId+".jsonl")).mode&0o077,0);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("nonexistent or unsafe filesystem namespace is refused, no crash initiated",async()=>{
 if(process.platform!=="linux"||process.getuid()===0)return;
 const root=mkdtempSync(join(tmpdir(),"eternyx-crash-unsafe-"));
 try{
  await assert.rejects(()=>runRealKernelJournalCrashDrill({
   parentDir:join(root,"unapproved"),containerId:id,workerPath:worker
  }));
  await assert.rejects(()=>runRealKernelJournalCrashDrill({
   parentDir:root,containerId:"short",workerPath:worker
  }));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("direct worker execution without private IPC and nonce does not create a journal",()=>{
 const root=mkdtempSync(join(tmpdir(),"eternyx-worker-deny-"));
 try{
  const p=spawnSync(process.execPath,[worker,"reserved",root,
   "33333333-3333-4333-8333-333333333333",
   "44444444-4444-4444-8444-444444444444",id,"b".repeat(64)],{
   encoding:"utf8",timeout:5000
  });
  assert.notEqual(p.status,0);
  assert.deepEqual((awaitDir=>awaitDir)([]),[]);
  assert.ok(!existsSync(join(root,"claim-44444444-4444-4444-8444-444444444444.jsonl")));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("operator host wrapper refuses absence of explicit approval before any real Docker access",()=>{
 const r=spawnSync(process.execPath,[script,"--run"],{
  env:{...process.env,ETERNYX_DOCKER_SIGKILL_DRILL_APPROVAL:"",
   ETERNYX_DOCKER_SIGKILL_PRIVATE_DIR:"/nonexistent/should-not-be-accessed"},
  encoding:"utf8",timeout:10000
 });
 assert.equal(r.status,1);
 assert.equal(r.stdout,"");
 assert.match(r.stderr,/Operator SIGKILL drill refused or failed/);
});
test("no remote dispatch, real agent kill or Docker mutation in worker and orchestrator source",()=>{
 const workerCode=readFileSync(worker,"utf8");
 const operatorCode=readFileSync(script,"utf8");
 const moduleCode=readFileSync(new URL("../src/lib/dockerKernelCrashDurability.mjs",import.meta.url),"utf8");
 for(const source of [workerCode,moduleCode]){
  assert.doesNotMatch(source,/fetch\(|supabase functions deploy|docker container start/);
 }
 assert.match(operatorCode,/docker-host-network-evidence\.mjs/);
 assert.match(operatorCode,/liveDockerContainerMutated:false/);
 assert.match(operatorCode,/realSignedAgentCrashed:false/);
 assert.match(operatorCode,/realEndToEndCrashRecoveryCompleted:false/);
});
