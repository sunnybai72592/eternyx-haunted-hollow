import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync,readFileSync,chmodSync,
  unlinkSync,symlinkSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim}
 from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {requireSignedReceiptReplayClear}
 from "../src/lib/dockerSignedReceiptReplayFence.mjs";
import {requireSignedReceiptAcknowledgedEvidence}
 from "../src/lib/dockerSignedReceiptAcknowledgedFence.mjs";
import {requireDurableTerminalBeforeReceipt}
 from "../src/lib/dockerAgentAttemptDisposition.mjs";

const target="a".repeat(64),unrelated="b".repeat(64);
const fixture=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-phase34-receipt-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const ids=(containerId=target)=>({
 agentId:randomUUID(),claimId:randomUUID(),containerId,operation:"stop"
});
function state(dir,p,outcome="completed",{ack=false,agentLock=true,targetLock=false}={}){
 if(agentLock)lockLabAgent(p.agentId,dir);
 if(targetLock)lockLabContainer(p,dir);
 reserveLabClaim(p,dir);
 if(outcome!=="guard_denied")appendLabEvent(p.claimId,"attempted",dir);
 if(outcome)appendLabEvent(p.claimId,outcome,dir);
 if(ack)appendLabEvent(p.claimId,"receipt_accepted",dir);
}
function before(dir,p){
 return requireSignedReceiptReplayClear(auditSignedAgentRecoveryDirectory(dir),{
  agentId:p.agentId,claimId:p.claimId,phase:"before_send"
 });
}
function during(dir,p,hash){
 return requireSignedReceiptReplayClear(auditSignedAgentRecoveryDirectory(dir),{
  agentId:p.agentId,claimId:p.claimId,phase:"before_ack",
  originalFileSha256:hash
 });
}
function accepted(dir,p,outcome="completed"){
 return requireSignedReceiptAcknowledgedEvidence(
  auditSignedAgentRecoveryDirectory(dir),{
   agentId:p.agentId,claimId:p.claimId,containerId:p.containerId,outcome
  });
}
test("actual canonical completed journal stays bound before receipt send, before ack, and after durable ack",()=>fixture(dir=>{
 const p=ids();state(dir,p);
 const first=before(dir,p);
 assert.equal(first.outcome,"completed");
 assert.equal(requireDurableTerminalBeforeReceipt(readLabClaim(p.claimId,dir),first.outcome),true);
 assert.equal(during(dir,p,first.fileSha256).fileSha256,first.fileSha256);
 appendLabEvent(p.claimId,"receipt_accepted",dir);
 const checked=accepted(dir,p);
 assert.equal(checked.locallyAcknowledged,true);
 assert.equal(checked.independentlyVerified,false);
 assert.equal(checked.actualDockerExecutionProven,false);
 assert.equal(checked.dockerExecutedAgain,false);
 assert.throws(()=>before(dir,p),/ambiguous or not original/);
}));
test("definitive guard_denied may be delivered and acknowledged without a Docker attempt",()=>fixture(dir=>{
 const p=ids();state(dir,p,"guard_denied");
 const first=before(dir,p);
 assert.equal(first.outcome,"guard_denied");
 assert.equal(during(dir,p,first.fileSha256).outcome,"guard_denied");
 appendLabEvent(p.claimId,"receipt_accepted",dir);
 assert.equal(accepted(dir,p,"guard_denied").locallyAcknowledged,true);
 assert.throws(()=>accepted(dir,p,"completed"));
}));
test("acknowledged status refuses to invent successful Docker execution",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 const evidence=accepted(dir,p);
 assert.equal(evidence.independentlyVerified,false);
 assert.equal(evidence.actualDockerExecutionProven,false);
}));
test("already acknowledged failed legacy report cannot be claimed as clean final receipt",()=>fixture(dir=>{
 const p=ids();state(dir,p,"failed",{ack:true});
 assert.throws(()=>accepted(dir,p,"completed"),/inconsistent/);
 assert.throws(()=>accepted(dir,p,"failed"),/Invalid signed receipt/);
}));
test("unknown current attempt can never be recast as confirmed acknowledgement",()=>fixture(dir=>{
 const p=ids();state(dir,p,null);
 assert.throws(()=>before(dir,p));
 assert.throws(()=>accepted(dir,p));
}));
test("an unacknowledged terminal cannot be claimed as already acknowledged",()=>fixture(dir=>{
 const p=ids();state(dir,p);
 assert.throws(()=>accepted(dir,p),/inconsistent/);
}));
test("another agent or claim cannot claim the original acknowledged receipt",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 const snapshot=auditSignedAgentRecoveryDirectory(dir);
 for(const modify of [
  {agentId:randomUUID()},{claimId:randomUUID()},
  {containerId:unrelated},{outcome:"guard_denied"}
 ])assert.throws(()=>requireSignedReceiptAcknowledgedEvidence(snapshot,{
  agentId:p.agentId,claimId:p.claimId,containerId:p.containerId,outcome:"completed",...modify
 }));
}));
test("retained per-container lock denies both initial and already-acknowledged receipt evidence",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{targetLock:true});
 assert.throws(()=>before(dir,p),/incomplete lock release/);
 appendLabEvent(p.claimId,"receipt_accepted",dir);
 assert.throws(()=>accepted(dir,p),/inconsistent/);
}));
test("no original signed agent lock denies already-acknowledged status",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true,agentLock:false});
 assert.throws(()=>accepted(dir,p),/inconsistent/);
}));
test("older same-target unknown claim remains a hold even after this claim is acknowledged",()=>fixture(dir=>{
 const previous=ids();state(dir,previous,null,{agentLock:false});
 const p=ids();state(dir,p,"completed",{ack:true});
 assert.throws(()=>accepted(dir,p),/Unresolved same-container/);
}));
test("previous same-target failed terminal remains uncertain even with a server acknowledgement",()=>fixture(dir=>{
 const old=ids();state(dir,old,"failed",{ack:true,agentLock:false});
 const p=ids();state(dir,p,"guard_denied",{ack:true});
 assert.throws(()=>accepted(dir,p,"guard_denied"),/Unresolved same-container/);
}));
test("independent older acknowledged success is allowed without rewriting it",()=>fixture(dir=>{
 const old=ids();state(dir,old,"completed",{ack:true,agentLock:false});
 const p=ids();state(dir,p,"completed",{ack:true});
 assert.equal(accepted(dir,p).locallyAcknowledged,true);
 assert.equal(auditSignedAgentRecoveryDirectory(dir).claimCount,2);
}));
test("unrelated container UNKNOWN is not mistaken for same-target result",()=>fixture(dir=>{
 const other=ids(unrelated);state(dir,other,null,{agentLock:false});
 const p=ids();state(dir,p,"completed",{ack:true});
 assert.equal(accepted(dir,p).locallyAcknowledged,true);
}));
test("unattributed agent lock requires manual review, not an already-accepted result",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 lockLabAgent(randomUUID(),dir);
 assert.throws(()=>accepted(dir,p),/unresolved recovery finding/);
}));
test("tampered journal cannot pass accepted evidence and cannot be silently rewritten",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 const filename=join(dir,"claim-"+p.claimId+".jsonl");
 writeFileSync(filename,readFileSync(filename,"utf8")+"{\"event\":\"extra\"}\n");
 assert.throws(()=>accepted(dir,p));
 assert.equal(readFileSync(filename,"utf8").includes('"event":"extra"'),true);
}));
test("symlinked or group-readable original terminal blocks all accepted status claims",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 const file=join(dir,"claim-"+p.claimId+".jsonl");
 if(process.platform!=="win32"){
  chmodSync(file,0o640);
  assert.throws(()=>accepted(dir,p),/publicly readable/);
  chmodSync(file,0o600);
 }
 const other=join(dir,"safe-source");
 writeFileSync(other,readFileSync(file),{mode:0o600});
 unlinkSync(file);symlinkSync(other,file);
 assert.throws(()=>accepted(dir,p),/symlinked/);
}));
test("fake incomplete inventory flags and file counts cannot authorize accepted status",()=>fixture(dir=>{
 const p=ids();state(dir,p,"completed",{ack:true});
 const snapshot=auditSignedAgentRecoveryDirectory(dir);
 for(const patch of [
  {completeInventoryVerified:false},{stableDoubleReadVerified:false},
  {inventorySha256:"bad"},{fileCount:99},{claimCount:3},
  {totalLockCount:4},{productionDeploymentAuthorized:true},
  {safeToRetryClaimAutomatically:true}
 ])assert.throws(()=>requireSignedReceiptAcknowledgedEvidence({
  ...snapshot,...patch
 },{agentId:p.agentId,claimId:p.claimId,containerId:p.containerId,outcome:"completed"}),/complete stable/);
}));
test("signed agent normal path refuses remote receipt until strict inventory and after-network fingerprint check",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const terminal=s.indexOf("appendLabEvent(permit.claimId,outcome)");
 const unlock=s.indexOf("unlockContainer();",terminal);
 const normalGate=s.indexOf('phase:"before_send"',terminal);
 const normalSend=s.indexOf('const receipt=await send("receipt",permit.claimId,outcome)',terminal);
 const verify=s.indexOf('validateDockerReceiptAcknowledgement(receipt,permit.claimId,outcome)',normalSend);
 const afterGate=s.indexOf('phase:"before_ack"',normalSend);
 const append=s.indexOf('appendLabEvent(permit.claimId,"receipt_accepted")',normalSend);
 const acceptedGate=s.indexOf("requireSignedReceiptAcknowledgedEvidence(",append);
 const release=s.indexOf("retainRecoveryLock=false;",append);
 assert.ok(terminal>=0&&terminal<unlock&&unlock<normalGate&&normalGate<normalSend&&
  normalSend<verify&&verify<afterGate&&afterGate<append&&append<acceptedGate&&acceptedGate<release);
 assert.match(s,/originalFileSha256:ready.fileSha256/);
 assert.match(s,/originalFileSha256:originalReceiptEvidence.fileSha256/);
 assert.match(s,/if\(originalReceiptEvidence\)\{/);
 assert.match(s,/if\(checked.outcome===outcome&&checked.containerId===permit.containerId\)/);
 assert.match(s,/if\(!disposition.outcome\)\{/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.doesNotMatch(s,/shell:true/);
});
test("already acknowledged no-network branch checks canonical full history before printing success",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const pos=s.indexOf("if(journal.acknowledged){");
 const gate=s.indexOf("requireSignedReceiptAcknowledgedEvidence(",pos);
 const out=s.indexOf("alreadyAcknowledged:true",gate);
 const replay=s.indexOf('phase:"before_send"',out);
 assert.ok(pos>=0&&pos<gate&&gate<out&&out<replay);
 assert.match(s,/independentlyVerified:false,executedAgain:false/);
});
