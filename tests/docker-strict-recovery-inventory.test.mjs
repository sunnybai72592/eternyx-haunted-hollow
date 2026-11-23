import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,chmodSync,
 symlinkSync,readFileSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {lockLabAgent,reserveLabClaim,appendLabEvent}
 from "../src/lib/dockerLabRecovery.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";

const CONTAINER="a".repeat(64);
const dir=()=>mkdtempSync(join(tmpdir(),"eternyx-strict-recovery-"));
const withDir=fn=>{
 const path=dir();
 try{return fn(path);}finally{rmSync(path,{recursive:true,force:true});}
};
function claim(path,agentId,claimId,stage="attempted"){
 reserveLabClaim({agentId,claimId,operation:"stop",containerId:CONTAINER},path);
 if(stage!=="reserved")appendLabEvent(claimId,"attempted",path);
 if(stage==="completed")appendLabEvent(claimId,"completed",path);
 if(stage==="acknowledged"){
  appendLabEvent(claimId,"completed",path);
  appendLabEvent(claimId,"receipt_accepted",path);
 }
}
test("existing completely empty private journal directory gets a truthful no-evidence report",()=>withDir(path=>{
 const report=auditSignedAgentRecoveryDirectory(path);
 assert.equal(report.schema,"eternyx-docker-signed-agent-strict-recovery-inventory-v1");
 assert.equal(report.fileCount,0);
 assert.equal(report.completeInventoryVerified,true);
 assert.equal(report.stableDoubleReadVerified,true);
 assert.equal(report.disposition,"no_unresolved_local_evidence");
 assert.equal(report.realDockerStateInspected,false);
 assert.equal(report.safeToRetryClaimAutomatically,false);
 assert.equal(report.productionDeploymentAuthorized,false);
}));
test("real fsynced attempted-only journal and retained lock are correlated without certifying success or lock age",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();
 lockLabAgent(a,path);
 claim(path,a,c);
 const first=auditSignedAgentRecoveryDirectory(path);
 const second=auditSignedAgentRecoveryDirectory(path);
 assert.equal(first.fileCount,2);
 assert.equal(first.claimCount,1);
 assert.equal(first.lockCount,1);
 assert.equal(first.inventorySha256,second.inventorySha256);
 assert.equal(first.disposition,"manual_review_required");
 assert.deepEqual(first.claims[0].events,["reserved","attempted"]);
 assert.equal(first.claims[0].lockPresent,true);
 assert.equal(first.claims[0].receiptReplayAuthorized,false);
 assert.equal(first.blocked[0].reason,"attempted_outcome_unknown");
 assert.equal(first.agentLockCurrentlyActiveProven,false);
 assert.equal(first.lockSafeToClearAutomatically,false);
 assert.equal(first.uncertainOutcomeAuthorizedForReceipt,false);
 assert.throws(()=>lockLabAgent(a,path),/EEXIST/);
}));
test("partial reservation with a lock is preserved for independent review",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();
 lockLabAgent(a,path);claim(path,a,c,"reserved");
 const report=auditSignedAgentRecoveryDirectory(path);
 assert.equal(report.blocked[0].reason,"reserved_without_terminal");
 assert.equal(report.claims[0].attempted,false);
 assert.equal(report.claims[0].outcome,null);
}));
test("attempted-only claim missing its recovery lock raises a separate safety finding",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();claim(path,a,c);
 const r=auditSignedAgentRecoveryDirectory(path);
 assert.equal(r.unknownAttemptWithoutLockDetected,true);
 assert.equal(r.blocked[0].lockPresent,false);
 assert.equal(r.disposition,"manual_review_required");
}));
test("orphaned agent lock is not assumed stale and is never automatically cleared",()=>withDir(path=>{
 const a=randomUUID();lockLabAgent(a,path);
 const r=auditSignedAgentRecoveryDirectory(path);
 assert.equal(r.claimCount,0);
 assert.equal(r.lockCount,1);
 assert.equal(r.blocked[0].reason,"lock_without_claim_or_preclaim_process");
 assert.equal(r.agentLockCurrentlyActiveProven,false);
 assert.equal(r.lockSafeToClearAutomatically,false);
}));
test("real durable terminal without acknowledgement remains manual review, even without lock",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();
 claim(path,a,c,"completed");
 const r=auditSignedAgentRecoveryDirectory(path);
 assert.equal(r.claims[0].outcome,"completed");
 assert.equal(r.claims[0].receiptReplayAuthorized,false);
 assert.equal(r.blocked[0].reason,"terminal_receipt_not_acknowledged");
}));
test("fully acknowledged claims do not imply host proof or production authorization",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();claim(path,a,c,"acknowledged");
 const r=auditSignedAgentRecoveryDirectory(path);
 assert.equal(r.blocked.length,0);
 assert.equal(r.claims[0].acknowledged,true);
 assert.equal(r.remoteReceiptAcknowledgementVerified,false);
 assert.equal(r.independentPhysicalIsolationVerified,false);
 assert.equal(r.productionDeploymentAuthorized,false);
}));
test("unknown or leftover temporary files fail closed rather than being silently omitted",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();claim(path,a,c);
 writeFileSync(join(path,"hidden-recovery.json"),"x",{mode:0o600});
 assert.throws(()=>auditSignedAgentRecoveryDirectory(path),/Unknown, noncanonical/);
}));
test("more than 100 files fails closed instead of a misleading first-100 listing",()=>withDir(path=>{
 for(let i=0;i<101;i++)writeFileSync(join(path,"unexpected-"+i),"x",{mode:0o600});
 assert.throws(()=>auditSignedAgentRecoveryDirectory(path),/100-file boundary/);
}));
test("owner-private file guard refuses symlinks and world-readable journal or lock",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();lockLabAgent(a,path);claim(path,a,c);
 const target=join(path,"claim-"+c+".jsonl");
 const symlink=join(path,"claim-"+randomUUID()+".jsonl");
 symlinkSync(target,symlink);
 assert.throws(()=>auditSignedAgentRecoveryDirectory(path),/Unsafe, symlinked/);
 unlinkSync(symlink);
 if(process.platform!=="win32"){
  chmodSync(target,0o644);
  assert.throws(()=>auditSignedAgentRecoveryDirectory(path),/publicly readable/);
  chmodSync(target,0o600);
  const lock=join(path,"agent-"+a+".lock");
  chmodSync(lock,0o666);
  assert.throws(()=>auditSignedAgentRecoveryDirectory(path),/publicly readable/);
 }
}));
test("invalid agent lock bytes and noncanonical JSON fail closed",()=>withDir(path=>{
 const a=randomUUID();lockLabAgent(a,path);
 const lock=join(path,"agent-"+a+".lock");
 for(const raw of ["not-json\n",JSON.stringify({event:"active",agentId:a,at:"yesterday"})+"\n",
   JSON.stringify({at:new Date().toISOString(),event:"active",agentId:a,extra:true})+"\n",
   JSON.stringify({at:new Date().toISOString(),event:"released",agentId:a})+"\n",
   ""]){
  writeFileSync(lock,raw);
  assert.throws(()=>auditSignedAgentRecoveryDirectory(path));
 }
}));
test("corrupt claim journal blocks entire report; no partial success",()=>withDir(path=>{
 const a=randomUUID(),c=randomUUID();claim(path,a,c);
 const p=join(path,"claim-"+c+".jsonl");
 writeFileSync(p,'{"event":"reserved"}\n',{mode:0o600});
 assert.throws(()=>auditSignedAgentRecoveryDirectory(path));
}));
test("missing real journal directory is refused, not created as a side effect",()=>{
 const path=join(tmpdir(),"eternyx-no-such-private-"+randomUUID());
 assert.throws(()=>auditSignedAgentRecoveryDirectory(path));
});
test("read-only operator CLI exposes strict mode without Docker, socket or network contact",()=>{
 const root=dir();
 try{
  const journal=join(root,".eternyx","docker-lab-journal");
  mkdirSync(journal,{recursive:true,mode:0o700});
  const a=randomUUID(),c=randomUUID();
  lockLabAgent(a,journal);claim(journal,a,c);
  const script=fileURLToPath(new URL("../scripts/docker-lab-recovery.mjs",import.meta.url));
  const run=spawnSync(process.execPath,[script,"--strict-inventory"],{
   encoding:"utf8",env:{...process.env,HOME:root},timeout:10000
  });
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.claimCount,1);
  assert.equal(report.lockCount,1);
  assert.equal(report.disposition,"manual_review_required");
  const s=readFileSync(script,"utf8");
  assert.match(s,/auditSignedAgentRecoveryDirectory/);
  assert.doesNotMatch(s,/spawnSync|fetch\(|execSync|unlinkSync/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
