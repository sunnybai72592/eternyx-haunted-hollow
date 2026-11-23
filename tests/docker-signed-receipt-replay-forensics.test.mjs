import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,readFileSync,writeFileSync,chmodSync,
  readdirSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim}
 from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {requireSignedReceiptReplayClear}
 from "../src/lib/dockerSignedReceiptReplayFence.mjs";
import {requireDurableTerminalBeforeReceipt}
 from "../src/lib/dockerAgentAttemptDisposition.mjs";

const TARGET="a".repeat(64),OTHER="b".repeat(64);
const temp=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-receipt-forensics-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const ids=(containerId=TARGET)=>({agentId:randomUUID(),claimId:randomUUID(),operation:"stop",containerId});
function prepare(dir,p,{outcome="completed",acked=false,agentLock=true,containerLock=false}={}){
 if(agentLock)lockLabAgent(p.agentId,dir);
 if(containerLock)lockLabContainer(p,dir);
 reserveLabClaim(p,dir);
 if(outcome!=="guard_denied")appendLabEvent(p.claimId,"attempted",dir);
 if(outcome)appendLabEvent(p.claimId,outcome,dir);
 if(acked)appendLabEvent(p.claimId,"receipt_accepted",dir);
}
const guard=(dir,p,phase="before_send",fingerprint=null)=>requireSignedReceiptReplayClear(
 auditSignedAgentRecoveryDirectory(dir),{
  agentId:p.agentId,claimId:p.claimId,phase,
  originalFileSha256:fingerprint
 });
test("completed terminal with exact original agent lock permits receipt-only pre-send and pre-ack",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 const before=guard(dir,p);
 assert.equal(before.historyChecked,true);
 assert.equal(before.outcome,"completed");
 assert.equal(before.dockerExecuted,false);
 assert.equal(before.independentlyVerified,false);
 assert.equal(before.locksAutomaticallyReleased,false);
 assert.equal(before.unknownAttemptReplayed,false);
 assert.equal(requireDurableTerminalBeforeReceipt(readLabClaim(p.claimId,dir),before.outcome),true);
 const after=guard(dir,p,"before_ack",before.fileSha256);
 assert.equal(after.fileSha256,before.fileSha256);
 appendLabEvent(p.claimId,"receipt_accepted",dir);
 assert.equal(readLabClaim(p.claimId,dir).acknowledged,true);
 assert.throws(()=>guard(dir,p),/ambiguous or not original/);
}));
test("pre-attempt guard_denied terminal can be resent without Docker",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{outcome:"guard_denied"});
 const state=guard(dir,p);
 assert.equal(state.outcome,"guard_denied");
 assert.equal(requireDurableTerminalBeforeReceipt(readLabClaim(p.claimId,dir),"guard_denied"),true);
 assert.equal(guard(dir,p,"before_ack",state.fileSha256).outcome,"guard_denied");
}));
test("legacy failed terminal is not replayable as if a Docker failure was independently proven",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{outcome:"failed"});
 assert.equal(readLabClaim(p.claimId,dir).outcome,"failed");
 assert.throws(()=>guard(dir,p),/ambiguous or not original/);
}));
test("UNKNOWN and reserved-only claims can never be turned into a signed receipt",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{outcome:null});
 assert.throws(()=>guard(dir,p),/ambiguous or not original/);
}));
test("completed but already acknowledged cannot be resent or duplicated",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{acked:true});
 assert.throws(()=>guard(dir,p),/ambiguous or not original/);
}));
test("no matching invocation-owned agent lock refuses replay",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{agentLock:false});
 assert.throws(()=>guard(dir,p),/ambiguous or not original|lock release/);
}));
test("a still-retained container lock means prior operation is not fully resolved",()=>temp(dir=>{
 const p=ids();prepare(dir,p,{containerLock:true});
 assert.throws(()=>guard(dir,p),/incomplete lock release/);
}));
test("an older UNKNOWN attempt for the same target fences the later terminal receipt",()=>temp(dir=>{
 const old=ids();prepare(dir,old,{outcome:null,agentLock:false});
 const p=ids();prepare(dir,p);
 assert.throws(()=>guard(dir,p),/unresolved history/);
}));
test("an older unacknowledged completion for same target is not ignored",()=>temp(dir=>{
 const old=ids();prepare(dir,old,{agentLock:false});
 const p=ids();prepare(dir,p);
 assert.throws(()=>guard(dir,p),/unresolved history/);
}));
test("an older acknowledged legacy failed report remains quarantined",()=>temp(dir=>{
 const old=ids();prepare(dir,old,{outcome:"failed",acked:true,agentLock:false});
 const p=ids();prepare(dir,p);
 assert.throws(()=>guard(dir,p),/unresolved history/);
}));
test("prior acknowledged definite completion for same target is not deleted or falsely blocked",()=>temp(dir=>{
 const old=ids();prepare(dir,old,{acked:true,agentLock:false});
 const p=ids();prepare(dir,p);
 assert.equal(guard(dir,p).historyChecked,true);
 assert.equal(auditSignedAgentRecoveryDirectory(dir).claimCount,2);
}));
test("unresolved claim for a different exact container need not prevent receipt for this one",()=>temp(dir=>{
 const unrelated=ids(OTHER);prepare(dir,unrelated,{outcome:null,agentLock:false});
 const p=ids();prepare(dir,p);
 assert.equal(guard(dir,p).outcome,"completed");
}));
test("unattributed orphan agent lock blocks full-history receipt admission",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 lockLabAgent(randomUUID(),dir);
 assert.throws(()=>guard(dir,p),/unreconciled local recovery/);
}));
test("changing original claim after server acknowledgement prevents local receipt_accepted",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 const first=guard(dir,p);
 const path=join(dir,"claim-"+p.claimId+".jsonl");
 const original=readFileSync(path,"utf8");
 // This is an intentionally untrusted edit. The strict journal parser itself
 // will reject an extra non-canonical event; no local ack is written.
 writeFileSync(path,original+"not-json\n",{mode:0o600});
 assert.throws(()=>guard(dir,p,"before_ack",first.fileSha256));
 assert.equal(readFileSync(path,"utf8").includes("receipt_accepted"),false);
}));
test("wrong pre-ack evidence fingerprint is refused, even with otherwise valid terminal",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 assert.throws(()=>guard(dir,p,"before_ack","f".repeat(64)),/changed during delivery/);
}));
test("symlinked or public journal cannot be used as terminal receipt proof",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 const path=join(dir,"claim-"+p.claimId+".jsonl");
 if(process.platform!=="win32"){
  chmodSync(path,0o644);
  assert.throws(()=>guard(dir,p),/publicly readable/);
  chmodSync(path,0o600);
 }
 symlinkSync(path,join(dir,"untrusted-alias"));
 assert.throws(()=>guard(dir,p),/Unknown, noncanonical/);
}));
test("unknown extra file and over-cap inventory cannot authorize a partial receipt",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 writeFileSync(join(dir,"unrecognized-recovery"),"oops",{mode:0o600});
 assert.throws(()=>guard(dir,p),/Unknown, noncanonical/);
}));
test("forged incomplete inventory flags or counters refuse local replay",()=>temp(dir=>{
 const p=ids();prepare(dir,p);
 const snapshot=auditSignedAgentRecoveryDirectory(dir);
 for(const patch of [
  {completeInventoryVerified:false},
  {stableDoubleReadVerified:false},
  {inventorySha256:"invalid"},
  {fileCount:99},
  {totalLockCount:12},
  {safeToRetryClaimAutomatically:true},
  {productionDeploymentAuthorized:true},
  {uncertainOutcomeAuthorizedForReceipt:true},
  {lockSafeToClearAutomatically:true}
 ])assert.throws(()=>requireSignedReceiptReplayClear({...snapshot,...patch},{
  agentId:p.agentId,claimId:p.claimId,phase:"before_send"
 }),/incomplete or unsafe/);
}));
test("source order is full inventory before network, stable recheck after acknowledgement, then fsynced ack",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const receiptStart=s.indexOf("if(retryReceipt){");
 const first=s.indexOf('phase:"before_send"');
 const policy=s.indexOf("requireDurableTerminalBeforeReceipt(journal,journal.outcome)");
 const network=s.indexOf('const ack=await send("receipt",journal.claimId,journal.outcome)');
 const ackValidation=s.indexOf("validateDockerReceiptAcknowledgement(ack,journal.claimId,journal.outcome)");
 const second=s.indexOf('phase:"before_ack"');
 const durable=s.indexOf('appendLabEvent(journal.claimId,"receipt_accepted")');
 const claimPoll=s.indexOf('const polled=await send("claim")');
 assert.ok(receiptStart>=0&&receiptStart<first&&first<policy&&policy<network&&
  network<ackValidation&&ackValidation<second&&second<durable&&durable<claimPoll);
 assert.match(s,/originalFileSha256:replay.fileSha256/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.doesNotMatch(s,/shell:true/);
});
