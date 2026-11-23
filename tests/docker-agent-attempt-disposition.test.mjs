import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {classifyDockerAgentAttempt,requireDurableTerminalBeforeReceipt}
 from "../src/lib/dockerAgentAttemptDisposition.mjs";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim}
 from "../src/lib/dockerLabRecovery.mjs";

const AGENT="33333333-3333-4333-8333-333333333333";
const CLAIM="44444444-4444-4444-8444-444444444444";
const ID="a".repeat(64);
const args={agentId:AGENT,claimId:CLAIM,containerId:ID,operation:"stop"};
const decision=(attempted,postconditionConfirmed)=>
 classifyDockerAgentAttempt({attempted,postconditionConfirmed});

test("pre-attempt refusal has guard_denied only, subject to a durable terminal journal",()=>{
 assert.deepEqual(decision(false,false),{
  outcome:"guard_denied",keepRecoveryLockUntilDurableOutcome:true,maySendTerminalReceipt:true
 });
});
test("verified exact Docker postcondition is the only path to a completed new-agent outcome",()=>{
 assert.deepEqual(decision(true,true),{
  outcome:"completed",keepRecoveryLockUntilDurableOutcome:true,maySendTerminalReceipt:true
 });
});
test("command timeout, subprocess error, lost inspect, mismatched state all stay UNKNOWN after attempted marker",()=>{
 const d=decision(true,false);
 assert.equal(d.outcome,null);
 assert.equal(d.maySendTerminalReceipt,false);
 assert.equal(d.keepRecoveryLockUntilDurableOutcome,true);
});
test("malformed attempt state is rejected instead of downgraded into guard_denied or completed",()=>{
 for(const v of [
  {attempted:false,postconditionConfirmed:true},
  {attempted:null,postconditionConfirmed:false},
  {attempted:true,postconditionConfirmed:1},
  {attempted:0,postconditionConfirmed:false},
  {}
 ])assert.throws(()=>classifyDockerAgentAttempt(v));
});
test("real fsynced journal and original lock are preserved after UNKNOWN operation, and cannot generate a receipt",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-agent-unknown-"));
 try{
  lockLabAgent(AGENT,dir);
  reserveLabClaim(args,dir);
  appendLabEvent(CLAIM,"attempted",dir);
  const journal=readLabClaim(CLAIM,dir);
  assert.deepEqual(journal.events,["reserved","attempted"]);
  assert.equal(journal.attempted,true);
  assert.equal(journal.outcome,null);
  assert.equal(journal.attentionRequired,true);
  assert.equal(journal.acknowledged,false);
  assert.deepEqual(readdirSync(dir).sort(),[
   "agent-"+AGENT+".lock","claim-"+CLAIM+".jsonl"
  ]);
  assert.throws(()=>lockLabAgent(AGENT,dir),/EEXIST/);
  assert.throws(()=>reserveLabClaim(args,dir),/EEXIST/);
  for(const outcome of ["failed","completed","guard_denied"]){
   assert.throws(()=>requireDurableTerminalBeforeReceipt(journal,outcome));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("definitive pre-mutation denial is eligible for a receipt only after durable journal readback",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-agent-denied-"));
 try{
  reserveLabClaim(args,dir);
  assert.throws(()=>requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"guard_denied"));
  appendLabEvent(CLAIM,"guard_denied",dir);
  assert.equal(requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"guard_denied"),true);
  assert.throws(()=>requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"completed"));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("real successful postcondition permits signed receipt only after durable completed entry",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-agent-completed-"));
 try{
  reserveLabClaim(args,dir);
  appendLabEvent(CLAIM,"attempted",dir);
  assert.throws(()=>requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"completed"));
  appendLabEvent(CLAIM,"completed",dir);
  const journal=readLabClaim(CLAIM,dir);
  assert.equal(requireDurableTerminalBeforeReceipt(journal,"completed"),true);
  appendLabEvent(CLAIM,"receipt_accepted",dir);
  assert.throws(()=>requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"completed"));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("legacy definite failed receipt recovery remains limited to an existing terminal result",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-agent-legacy-failed-"));
 try{
  reserveLabClaim(args,dir);
  appendLabEvent(CLAIM,"attempted",dir);
  appendLabEvent(CLAIM,"failed",dir);
  assert.equal(requireDurableTerminalBeforeReceipt(readLabClaim(CLAIM,dir),"failed"),true);
  assert.throws(()=>requireDurableTerminalBeforeReceipt({...readLabClaim(CLAIM,dir),outcome:"unknown"},"failed"));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("real signed agent preserves uncertain lock and denies false receipts; reservation fsync precedes Docker",()=>{
 const agent=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const before=agent.indexOf('appendLabEvent(permit.claimId,"attempted")');
 const mutate=agent.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 const set=agent.indexOf("attempted=true;");
 const confirm=agent.indexOf("postconditionConfirmed=true;");
 const classify=agent.indexOf("classifyDockerAgentAttempt({attempted,postconditionConfirmed})");
 const terminal=agent.indexOf("appendLabEvent(permit.claimId,outcome)");
 const receipt=agent.indexOf('send("receipt",permit.claimId,outcome)');
 assert.ok(set>=0&&before>=0&&mutate>=0&&set<before&&before<mutate);
 assert.ok(confirm>mutate&&classify>confirm&&terminal>classify&&receipt>terminal);
 assert.match(agent,/if\(!disposition\.outcome\)\{/);
 assert.match(agent,/result:"unknown_attempt_manual_review_required"/);
 assert.match(agent,/No terminal event or signed receipt/);
 assert.match(agent,/finally \{if\(!retainRecoveryLock\)unlock\(\);\}/);
 assert.match(agent,/retainRecoveryLock=true; \/\/ Never auto-unlock/);
 assert.match(agent,/requireDurableTerminalBeforeReceipt\(readLabClaim\(permit.claimId\),outcome\)/);
 assert.match(agent,/requireDurableTerminalBeforeReceipt\(journal,journal.outcome\)/);
 assert.doesNotMatch(agent,/outcome="failed"/);
});
test("agent unauthorized invocation never reaches a Docker process or signed server",()=>{
 const agent=fileURLToPath(new URL("../scripts/docker-lab-agent.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[agent,AGENT,
  "/nonexistent/agent.pem","/nonexistent/server.key","--execute-lab"],{
  encoding:"utf8",timeout:12000,env:{
   ...process.env,ETERNYX_REMOTE_LAB_ENABLED:"",ETERNYX_SUPABASE_URL:""
  }
 });
 assert.notEqual(r.status,0);
 assert.equal(r.stdout,"");
 assert.match(r.stderr,/disabled by default/);
});
