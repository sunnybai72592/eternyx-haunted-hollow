import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync,
  lstatSync,chmodSync,unlinkSync,renameSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim} from "../src/lib/dockerLabRecovery.mjs";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";

const containerId="a".repeat(64);
const fixtures=fn=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-journal-durable-"));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
};
const ids=()=>({agentId:randomUUID(),claimId:randomUUID(),containerId,operation:"restart"});

test("real agent lock and permanent claim are complete private files after creation",()=>fixtures(dir=>{
 const a=ids();
 const release=lockLabAgent(a.agentId,dir);
 const lock=join(dir,"agent-"+a.agentId+".lock");
 const st=lstatSync(lock);
 assert.equal(st.isFile(),true);
 assert.equal(st.isSymbolicLink(),false);
 assert.equal((st.mode&0o077),0);
 const obj=JSON.parse(readFileSync(lock,"utf8"));
 assert.equal(obj.agentId,a.agentId);
 assert.equal(obj.event,"active");
 const path=reserveLabClaim(a,dir);
 const journal=readLabClaim(a.claimId,dir);
 assert.deepEqual(journal.events,["reserved"]);
 assert.equal(lstatSync(path).mode&0o077,0);
 assert.equal(JSON.parse(readFileSync(path,"utf8")).containerId,containerId);
 assert.throws(()=>reserveLabClaim(a,dir),{code:"EEXIST"});
 release();
 assert.equal(readdirSync(dir).length,1);
}));
test("crash-like child exit retains original fsynced agent lock and unacknowledged journal",()=>fixtures(dir=>{
 const a=ids(),url=new URL("../src/lib/dockerLabRecovery.mjs",import.meta.url).href;
 const script=[
  "import {lockLabAgent,reserveLabClaim,appendLabEvent} from "+JSON.stringify(url)+";",
  "const a="+JSON.stringify(a)+",dir="+JSON.stringify(dir)+";",
  'lockLabAgent(a.agentId,dir);reserveLabClaim(a,dir);appendLabEvent(a.claimId,"attempted",dir);',
  "process.exit(93);"
 ].join("");
 const r=spawnSync(process.execPath,["--input-type=module","-e",script],{
   encoding:"utf8",timeout:10000
 });
 assert.equal(r.status,93,r.stderr);
 const state=readLabClaim(a.claimId,dir);
 assert.deepEqual(state.events,["reserved","attempted"]);
 assert.equal(state.outcome,null);
 assert.throws(()=>lockLabAgent(a.agentId,dir),{code:"EEXIST"});
 assert.throws(()=>reserveLabClaim(a,dir),{code:"EEXIST"});
 const report=auditSignedAgentRecoveryDirectory(dir);
 assert.equal(report.lockCount,1);
 assert.equal(report.claims[0].outcome,null);
 assert.equal(report.safeToRetryClaimAutomatically,false);
}));
test("original agent lock may be released only once; re-lock creates a fresh inode",()=>fixtures(dir=>{
 const a=ids();
 const path=join(dir,"agent-"+a.agentId+".lock");
 const release=lockLabAgent(a.agentId,dir);
 const first=lstatSync(path);
 release();release();
 assert.equal(readdirSync(dir).length,0);
 const next=lockLabAgent(a.agentId,dir);
 assert.equal(lstatSync(path).isFile(),true);
 assert.notEqual(lstatSync(path).ino,first.ino);
 next();
}));
test("same-path replacement with identical bytes never authorizes unlocking the original agent lock",()=>fixtures(dir=>{
 const a=ids(),release=lockLabAgent(a.agentId,dir);
 const path=join(dir,"agent-"+a.agentId+".lock");
 const source=readFileSync(path),identity=lstatSync(path);
 const shadow=join(dir,"agent-replacement");
 writeFileSync(shadow,source,{mode:0o600});
 renameSync(shadow,path);
 assert.notEqual(lstatSync(path).ino,identity.ino);
 assert.throws(()=>release(),/identity|changed/);
 assert.equal(readFileSync(path).equals(source),true);
}));
test("modifying original agent lock bytes leaves it unreleased for review",()=>fixtures(dir=>{
 const a=ids(),release=lockLabAgent(a.agentId,dir);
 const path=join(dir,"agent-"+a.agentId+".lock");
 const raw=readFileSync(path,"utf8");
 writeFileSync(path,raw.replace('"active"','"alterd"'));
 assert.throws(()=>release(),/identity|changed/);
 assert.equal(lstatSync(path).isFile(),true);
}));
test("public access on a formerly private agent lock is a hard unlock failure",()=>fixtures(dir=>{
 if(process.platform==="win32")return;
 const a=ids(),release=lockLabAgent(a.agentId,dir);
 const path=join(dir,"agent-"+a.agentId+".lock");
 chmodSync(path,0o644);
 assert.throws(()=>release(),/0600|identity|changed/);
 assert.equal(lstatSync(path).isFile(),true);
}));
test("replaced lock pathname symlink cannot be followed or deleted by release",()=>fixtures(dir=>{
 const a=ids(),release=lockLabAgent(a.agentId,dir);
 const path=join(dir,"agent-"+a.agentId+".lock");
 const target=join(dir,"untouched");
 writeFileSync(target,"sentinel",{mode:0o600});
 unlinkSync(path);symlinkSync(target,path);
 assert.throws(()=>release(),/0600|identity|changed|Invalid/);
 assert.equal(readFileSync(target,"utf8"),"sentinel");
}));
test("damaged, partial and invalid canonical journals refuse signed receipt readback",()=>fixtures(dir=>{
 const a=ids(),path=reserveLabClaim(a,dir);
 const before=readFileSync(path,"utf8");
 for(const body of [before.slice(0,-1),before+"not-json\n",before+"{\"event\":\"completed\"}\n"]){
  writeFileSync(path,body);
  assert.throws(()=>readLabClaim(a.claimId,dir));
 }
}));
test("journal parser and append refuse symlink replacement",()=>fixtures(dir=>{
 const a=ids(),path=reserveLabClaim(a,dir);
 const origin=join(dir,"target");
 writeFileSync(origin,readFileSync(path),{mode:0o600});
 unlinkSync(path);
 symlinkSync(origin,path);
 assert.throws(()=>readLabClaim(a.claimId,dir));
 assert.throws(()=>appendLabEvent(a.claimId,"attempted",dir));
 assert.deepEqual(JSON.parse(readFileSync(origin,"utf8")).event,"reserved");
}));
test("append must preserve strict reserved -> attempted -> completed -> acknowledgement, one line each",()=>fixtures(dir=>{
 const a=ids();
 reserveLabClaim(a,dir);
 appendLabEvent(a.claimId,"attempted",dir);
 appendLabEvent(a.claimId,"completed",dir);
 appendLabEvent(a.claimId,"receipt_accepted",dir);
 const state=readLabClaim(a.claimId,dir);
 assert.deepEqual(state.events,["reserved","attempted","completed","receipt_accepted"]);
 assert.equal(state.acknowledged,true);
 assert.equal(readFileSync(join(dir,"claim-"+a.claimId+".jsonl"),"utf8").trim().split("\n").length,4);
 assert.throws(()=>appendLabEvent(a.claimId,"failed",dir));
}));
test("untrusted or group-accessible journal directory blocks all file operations",()=>fixtures(dir=>{
 if(process.platform==="win32")return;
 const a=ids();
 chmodSync(dir,0o770);
 assert.throws(()=>lockLabAgent(a.agentId,dir),/private/);
 assert.throws(()=>reserveLabClaim(a,dir),/private/);
}));
test("directory fsync happens after file fsync for BOTH lock and new claim; original agent still handles UNKNOWN",()=>{
 const source=readFileSync(new URL("../src/lib/dockerLabRecovery.mjs",import.meta.url),"utf8");
 const agent=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 assert.match(source,/if\(writeSync\(fd,bytes\)!==bytes\.length\)/);
 assert.match(source,/fsyncSync\(fd\)/);
 assert.match(source,/fsyncSync\(dfd\)/);
 const agentLock=source.slice(source.indexOf("export function lockLabAgent"),source.indexOf("export function reserveLabClaim"));
 const claim=source.slice(source.indexOf("export function reserveLabClaim"),source.indexOf("export function readLabClaim"));
 assert.ok(agentLock.indexOf("writeDurable(fd,")>=0&&agentLock.indexOf("writeDurable(fd,")<agentLock.indexOf("syncJournalDirectory(dir)"));
 assert.ok(claim.indexOf("writeDurable(fd,")>=0&&claim.indexOf("writeDurable(fd,")<claim.indexOf("syncJournalDirectory(dir)"));
 assert.match(agentLock,/assertSameFile\(original,fstatSync\(reader\)\)/);
 assert.match(agentLock,/readFileSync\(reader\)\.equals\(bytes\)/);
 assert.match(agentLock,/unlinkSync\(path\);\s*syncJournalDirectory\(dir\)/);
 assert.match(agent,/retainRecoveryLock=true; \/\/ Never auto-unlock/);
 assert.match(agent,/finally \{if\(!retainRecoveryLock\)unlock\(\);\}/);
 assert.match(agent,/if\(!disposition\.outcome\)\{/);
 assert.ok(agent.indexOf('appendLabEvent(permit.claimId,"attempted")')<
    agent.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]'));
 assert.match(agent,/const context=executeLab\?localContext\(\):null/);
});
