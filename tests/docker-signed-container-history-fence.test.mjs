import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {lockLabAgent,reserveLabClaim,appendLabEvent}
 from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {requireSignedContainerHistoryClear}
 from "../src/lib/dockerSignedContainerHistoryFence.mjs";

const TARGET="a".repeat(64), OTHER="b".repeat(64);
const withDir=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-history-fence-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const newIds=(containerId=TARGET)=>({
 agentId:randomUUID(),claimId:randomUUID(),containerId
});
const create=(dir,ids,stage="attempted",operation="stop")=>{
 reserveLabClaim({...ids,operation},dir);
 if(stage!=="reserved")appendLabEvent(ids.claimId,"attempted",dir);
 if(["completed","acknowledged"].includes(stage))
  appendLabEvent(ids.claimId,"completed",dir);
 if(["failed","failed_acknowledged"].includes(stage))
  appendLabEvent(ids.claimId,"failed",dir);
 if(["guard_denied","guard_acknowledged"].includes(stage)){
  // This branch needs no attempted event, so it has its own fixture below.
  throw Error("Use guard() for a pre-attempt terminal.");
 }
 if(["acknowledged","failed_acknowledged"].includes(stage))
  appendLabEvent(ids.claimId,"receipt_accepted",dir);
};
const guard=(dir,ids)=>{
 reserveLabClaim({...ids,operation:"stop"},dir);
 appendLabEvent(ids.claimId,"guard_denied",dir);
 appendLabEvent(ids.claimId,"receipt_accepted",dir);
};
const acquired=(dir,ids)=>{
 lockLabAgent(ids.agentId,dir);
 lockLabContainer(ids,dir);
};
const run=(dir,ids,phase)=>requireSignedContainerHistoryClear(
 auditSignedAgentRecoveryDirectory(dir),{...ids,phase});
test("pristine history under real fsynced agent and container locks admits preclaim only",()=>withDir(dir=>{
 const ids=newIds();acquired(dir,ids);
 const x=run(dir,ids,"preclaim");
 assert.equal(x.historyChecked,true);
 assert.equal(x.phase,"preclaim");
 assert.equal(x.executionAuthorizedByHistoryAlone,false);
 assert.equal(x.clearedAnyRecoveryLock,false);
 assert.equal(x.recoveredLegacyClaimAutomatically,false);
 assert.throws(()=>run(dir,ids,"premutation"),/original durable attempted/);
}));
test("legacy acknowledged, completed claim for identical target is accepted but never erased",()=>withDir(dir=>{
 const old=newIds();
 create(dir,old,"acknowledged");
 const now=newIds();acquired(dir,now);
 assert.equal(run(dir,now,"preclaim").previouslyUnresolvedSameContainer,false);
 create(dir,now,"attempted");
 assert.equal(run(dir,now,"premutation").historyChecked,true);
 assert.equal(auditSignedAgentRecoveryDirectory(dir).claimCount,2);
}));
test("legacy UNKNOWN attempted-only claim without its pre-Phase-30 container lock blocks new action",()=>withDir(dir=>{
 const old=newIds();create(dir,old,"attempted");
 const now=newIds();acquired(dir,now);
 const inspection=auditSignedAgentRecoveryDirectory(dir);
 assert.equal(inspection.unknownAttemptWithoutContainerLockDetected,true);
 assert.throws(()=>run(dir,now,"preclaim"),/Older unresolved/);
 assert.equal(inspection.claimCount,1);
}));
test("legacy reserved-only claim blocks same target even though Docker attempt was not journaled",()=>withDir(dir=>{
 const old=newIds();create(dir,old,"reserved");
 const now=newIds();acquired(dir,now);
 assert.throws(()=>run(dir,now,"preclaim"),/Older unresolved/);
}));
test("terminal completed but receipt unacknowledged blocks a new action on same container",()=>withDir(dir=>{
 const old=newIds();create(dir,old,"completed");
 const now=newIds();acquired(dir,now);
 assert.throws(()=>run(dir,now,"preclaim"),/Older unresolved/);
}));
test("pre-attempt guard denial without acknowledged receipt also blocks same target",()=>withDir(dir=>{
 const old=newIds();reserveLabClaim({...old,operation:"stop"},dir);
 appendLabEvent(old.claimId,"guard_denied",dir);
 const now=newIds();acquired(dir,now);
 assert.throws(()=>run(dir,now,"preclaim"),/Older unresolved/);
}));
test("legacy failed outcome remains quarantined even if its receipt was accepted",()=>withDir(dir=>{
 const old=newIds();create(dir,old,"failed_acknowledged");
 const now=newIds();acquired(dir,now);
 assert.throws(()=>run(dir,now,"preclaim"),/Older unresolved/);
}));
test("completed, acknowledged guard denial may be admitted with no claim deletion",()=>withDir(dir=>{
 const old=newIds();guard(dir,old);
 const now=newIds();acquired(dir,now);
 assert.equal(run(dir,now,"preclaim").historyChecked,true);
}));
test("UNKNOWN claim for another container does not falsely imply same-target mutation",()=>withDir(dir=>{
 const old=newIds(OTHER);create(dir,old,"attempted");
 const now=newIds(TARGET);acquired(dir,now);
 assert.equal(run(dir,now,"preclaim").previouslyUnresolvedSameContainer,false);
}));
test("an unrelated orphan agent lock prevents assuming which container it owns",()=>withDir(dir=>{
 const now=newIds(),orphan=randomUUID();acquired(dir,now);
 lockLabAgent(orphan,dir);
 assert.throws(()=>run(dir,now,"preclaim"),/Unattributed local agent/);
}));
test("existing claimed ID is rejected even if historical claim is acknowledged",()=>withDir(dir=>{
 const now=newIds();create(dir,now,"acknowledged");acquired(dir,now);
 assert.throws(()=>run(dir,now,"preclaim"),/already exists/);
}));
test("re-read during attempt validates current claim as exact reserved -> attempted transition",()=>withDir(dir=>{
 const now=newIds();acquired(dir,now);create(dir,now,"attempted");
 assert.equal(run(dir,now,"premutation").phase,"premutation");
}));
test("an attempted claim with a different original agent ID cannot pass as this lock owner",()=>withDir(dir=>{
 const old=newIds(),now=newIds();create(dir,old,"attempted");acquired(dir,now);
 const wrong={...now,claimId:old.claimId};
 assert.throws(()=>run(dir,wrong,"premutation"));
}));
test("reserved-only, completed and acknowledged current claims cannot pass premutation",()=>withDir(dir=>{
 for(const stage of ["reserved","completed","acknowledged"]){
  const now=newIds();acquired(dir,now);create(dir,now,stage);
  assert.throws(()=>run(dir,now,"premutation"),/original durable attempted/);
  // Each fixture uses new directory because retained agent and container
  // locks are not allowed to be cleaned by a failed gate.
  break;
 }
}));
for(const stage of ["completed","acknowledged"])test("premutation rejects current "+stage+" journal",()=>withDir(dir=>{
 const now=newIds();acquired(dir,now);create(dir,now,stage);
 assert.throws(()=>run(dir,now,"premutation"),/original durable attempted/);
}));
test("last-moment recheck blocks new older claim that appeared after initial history check",()=>withDir(dir=>{
 const now=newIds();acquired(dir,now);
 assert.equal(run(dir,now,"preclaim").historyChecked,true);
 create(dir,now,"attempted");
 assert.equal(run(dir,now,"premutation").historyChecked,true);
 const old=newIds();create(dir,old,"reserved");
 assert.throws(()=>run(dir,now,"premutation"),/Older unresolved/);
}));
test("no agent lock, no target lock, or mismatch in exact lock ownership can authorize history",()=>withDir(dir=>{
 const now=newIds();
 lockLabAgent(now.agentId,dir);
 assert.throws(()=>run(dir,now,"preclaim"),/Exact original/);
 lockLabContainer({...now,claimId:randomUUID()},dir);
 assert.throws(()=>run(dir,now,"preclaim"),/Exact original/);
}));
test("malformed or excess journal inventory blocks the entire history check",()=>withDir(dir=>{
 const now=newIds();acquired(dir,now);
 writeFileSync(join(dir,"junk"),"data");
 assert.throws(()=>run(dir,now,"preclaim"),/Unknown, noncanonical/);
}));
test("fake incomplete or mutable snapshot cannot be presented as an execution permit",()=>withDir(dir=>{
 const now=newIds();acquired(dir,now);
 const snapshot=auditSignedAgentRecoveryDirectory(dir);
 for(const change of [
  {completeInventoryVerified:false},
  {stableDoubleReadVerified:false},
  {inventorySha256:"BAD"},
  {fileCount:99},
  {containerLockCount:0},
  {safeToRetryClaimAutomatically:true},
  {productionDeploymentAuthorized:true}
 ])assert.throws(()=>requireSignedContainerHistoryClear(
  {...snapshot,...change},{...now,phase:"preclaim"}),/complete stable/);
}));
test("real agent runs history fence after O_EXCL lock, before reservation, and after attempted just before Docker mutation",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const lock=s.indexOf("unlockContainer=lockLabContainer({");
 const preclaim=s.indexOf('phase:"preclaim"');
 const reserve=s.indexOf("reserveLabClaim({agentId,claimId:permit.claimId");
 const attempted=s.indexOf('appendLabEvent(permit.claimId,"attempted")');
 const secondSnapshot=s.indexOf("const justBefore=JSON.parse(docker(");
 const drift=s.indexOf("assertSignedAgentPreMutationUnchanged(");
 const premutation=s.indexOf('phase:"premutation"');
 const mutation=s.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 const terminal=s.indexOf("requireDurableTerminalBeforeReceipt(readLabClaim(permit.claimId),outcome)");
 assert.ok(lock>=0&&lock<preclaim&&preclaim<reserve&&reserve<attempted&&
   attempted<secondSnapshot&&secondSnapshot<drift&&drift<premutation&&
   premutation<mutation&&mutation<terminal);
 assert.match(s,/auditSignedAgentRecoveryDirectory\(\)/);
 assert.match(s,/if\(!disposition\.outcome\)\{/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.doesNotMatch(s,/shell:true/);
});
