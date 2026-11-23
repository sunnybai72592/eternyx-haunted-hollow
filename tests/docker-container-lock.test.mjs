import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync,
 chmodSync,symlinkSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim}
 from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";

const target="a".repeat(64),otherTarget="b".repeat(64);
const temp=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-target-lock-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const ids=(containerId=target)=>({agentId:randomUUID(),claimId:randomUUID(),containerId});
const reserve=(p,dir,operation="stop")=>reserveLabClaim({...p,operation},dir);
test("different agent IDs cannot own the same full Docker container on one operator journal",()=>temp(dir=>{
 const a=ids(),b=ids();
 const unlockA=lockLabContainer(a,dir);
 assert.throws(()=>lockLabContainer(b,dir),{code:"EEXIST"});
 assert.equal(readdirSync(dir).length,1);
 assert.equal(readdirSync(dir)[0],"container-"+target+".lock");
 assert.throws(()=>unlockA(),/durable terminal/);
 reserve(a,dir);appendLabEvent(a.claimId,"guard_denied",dir);
 unlockA();
 assert.deepEqual(readdirSync(dir),["claim-"+a.claimId+".jsonl"]);
 const unlockB=lockLabContainer(b,dir);
 reserve(b,dir);appendLabEvent(b.claimId,"guard_denied",dir);
 unlockB();
}));
test("OS-level O_EXCL excludes a second process with a different agent ID",()=>temp(dir=>{
 const a=ids(),b=ids();
 const unlockA=lockLabContainer(a,dir);
 const url=new URL("../src/lib/dockerLabContainerLock.mjs",import.meta.url).href;
 const script="import {lockLabContainer} from "+JSON.stringify(url)+";"+
  "try{lockLabContainer("+JSON.stringify(b)+","+JSON.stringify(dir)+");process.exit(0)}"+
  "catch(e){process.exit(e?.code==='EEXIST'?73:72)}";
 const r=spawnSync(process.execPath,["--input-type=module","-e",script],{
  encoding:"utf8",timeout:10000
 });
 assert.equal(r.status,73,r.stderr);
 reserve(a,dir);appendLabEvent(a.claimId,"guard_denied",dir);unlockA();
}));
test("distinct containers can hold separate locks without conflicts",()=>temp(dir=>{
 const a=ids(target),b=ids(otherTarget);
 const unlockA=lockLabContainer(a,dir);
 const unlockB=lockLabContainer(b,dir);
 assert.equal(readdirSync(dir).length,2);
 reserve(a,dir);reserve(b,dir);
 appendLabEvent(a.claimId,"guard_denied",dir);
 appendLabEvent(b.claimId,"guard_denied",dir);
 unlockA();unlockB();
}));
test("reserved-only and attempted-only journal retain target and agent locks and refuse duplicate work",()=>temp(dir=>{
 const a=ids(),b=ids();
 lockLabAgent(a.agentId,dir);
 const release=lockLabContainer(a,dir);
 reserve(a,dir);
 assert.throws(()=>release(),/durable terminal/);
 appendLabEvent(a.claimId,"attempted",dir);
 assert.equal(readLabClaim(a.claimId,dir).outcome,null);
 assert.throws(()=>release(),/durable terminal/);
 assert.throws(()=>lockLabContainer(b,dir),{code:"EEXIST"});
 assert.throws(()=>lockLabAgent(a.agentId,dir),{code:"EEXIST"});
 const audit=auditSignedAgentRecoveryDirectory(dir);
 assert.equal(audit.containerLockCount,1);
 assert.equal(audit.lockCount,1);
 assert.equal(audit.totalLockCount,2);
 assert.equal(audit.claims[0].containerLockPresent,true);
 assert.equal(audit.blocked[0].reason,"attempted_outcome_unknown");
 assert.equal(audit.disposition,"manual_review_required");
 assert.equal(audit.containerLockSafeToClearAutomatically,false);
 assert.equal(audit.safeToRetryClaimAutomatically,false);
}));
test("only matching fsynced terminal state releases container lock; second release is idempotent",()=>temp(dir=>{
 const a=ids(),release=lockLabContainer(a,dir);
 reserve(a,dir);
 appendLabEvent(a.claimId,"attempted",dir);
 appendLabEvent(a.claimId,"completed",dir);
 release();release();
 assert.equal(readdirSync(dir).some(x=>x.endsWith(".lock")),false);
 assert.equal(readLabClaim(a.claimId,dir).outcome,"completed");
}));
test("another agent's completed journal cannot authorize releasing the lock",()=>temp(dir=>{
 const a=ids(),b=ids(),release=lockLabContainer(a,dir);
 reserve(b,dir);appendLabEvent(b.claimId,"guard_denied",dir);
 assert.throws(()=>release());
 reserve(a,dir);appendLabEvent(a.claimId,"guard_denied",dir);
 release();
}));
test("tampering with lock bytes refuses release and invalidates forensic inventory",()=>temp(dir=>{
 const a=ids(),release=lockLabContainer(a,dir);
 reserve(a,dir);appendLabEvent(a.claimId,"guard_denied",dir);
 const file=join(dir,"container-"+target+".lock");
 writeFileSync(file,JSON.stringify({event:"active",claimId:a.claimId})+"\n",{mode:0o600});
 assert.throws(()=>release(),/changed|tampered/);
 assert.throws(()=>auditSignedAgentRecoveryDirectory(dir));
}));
test("symlinked and publicly readable container locks fail closed",()=>temp(dir=>{
 const a=ids(),release=lockLabContainer(a,dir);
 reserve(a,dir);appendLabEvent(a.claimId,"guard_denied",dir);
 const file=join(dir,"container-"+target+".lock");
 if(process.platform!=="win32"){
  chmodSync(file,0o644);
  assert.throws(()=>auditSignedAgentRecoveryDirectory(dir),/publicly readable/);
  chmodSync(file,0o600);
 }
 const old=join(dir,"original-lock");
 const raw=readFileSync(file);
 unlinkSync(file);writeFileSync(old,raw,{mode:0o600});
 symlinkSync(old,file);
 assert.throws(()=>auditSignedAgentRecoveryDirectory(dir),/Unsafe, symlinked/);
 assert.throws(()=>release());
}));
test("orphan container lock is flagged, not assumed stale or safe to clear",()=>temp(dir=>{
 const a=ids();
 lockLabContainer(a,dir); // crash between O_EXCL lock and journal reservation
 const r=auditSignedAgentRecoveryDirectory(dir);
 assert.equal(r.containerLockCount,1);
 assert.equal(r.claimCount,0);
 assert.equal(r.blocked[0].reason,"container_lock_without_matching_claim");
 assert.equal(r.containerLockSafeToClearAutomatically,false);
}));
test("container lock for another claim is flagged as mismatched",()=>temp(dir=>{
 const a=ids(),b=ids();
 lockLabContainer(a,dir);
 reserve({...b,containerId:target},dir);
 const r=auditSignedAgentRecoveryDirectory(dir);
 assert.ok(r.blocked.some(x=>x.reason==="container_lock_without_matching_claim"));
 assert.ok(r.claims.some(c=>c.containerLockPresent===false));
}));
test("legacy attempted-only claim missing container lock is flagged without rewriting it",()=>temp(dir=>{
 const a=ids();
 reserve(a,dir);appendLabEvent(a.claimId,"attempted",dir);
 const r=auditSignedAgentRecoveryDirectory(dir);
 assert.equal(r.unknownAttemptWithoutContainerLockDetected,true);
 assert.ok(r.blocked.some(x=>x.reason==="unknown_attempt_without_matching_container_lock"));
}));
test("actual signed agent locks container before claim, releases after terminal, keeps receipt-only Docker-free",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const permit=s.indexOf("verifyPinnedDockerLabPermit(authorized,");
 const lock=s.indexOf("unlockContainer=lockLabContainer({");
 const reserved=s.indexOf("reserveLabClaim({agentId,claimId:permit.claimId");
 const attempted=s.indexOf('appendLabEvent(permit.claimId,"attempted")');
 const mutation=s.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 const terminal=s.indexOf("requireDurableTerminalBeforeReceipt(readLabClaim(permit.claimId),outcome)");
 const release=s.indexOf("unlockContainer();");
 const receipt=s.indexOf('send("receipt",permit.claimId,outcome)');
 assert.ok(permit>=0&&permit<lock&&lock<reserved&&reserved<attempted&&attempted<mutation);
 assert.ok(mutation<terminal&&terminal<release&&release<receipt);
 assert.match(s,/if\(error\?\.code==="EEXIST"\)retainRecoveryLock=false/);
 assert.match(s,/if\(!retainRecoveryLock\)unlock\(\)/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.match(s,/if\(!disposition\.outcome\)\{/);
 assert.doesNotMatch(s,/shell:true/);
});
