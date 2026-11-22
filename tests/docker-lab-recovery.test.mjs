import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {mkdtempSync,rmSync,chmodSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {lockLabAgent,reserveLabClaim,readLabClaim,appendLabEvent,listLabClaims,labPostcondition} from "../src/lib/dockerLabRecovery.mjs";
const TEST_AGENT="33333333-3333-4333-8333-333333333333";
const TEST_CLAIM="44444444-4444-4444-8444-444444444444";
const args={agentId:TEST_AGENT,claimId:TEST_CLAIM,operation:"restart",containerId:"b".repeat(64)};
test("one agent lock, durable reservation, and retry denied",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-recovery-"));
 try{
  const unlock=lockLabAgent(TEST_AGENT,dir);
  assert.throws(()=>lockLabAgent(TEST_AGENT,dir),/EEXIST/);
  unlock();
  const next=lockLabAgent(TEST_AGENT,dir);next();
  reserveLabClaim(args,dir);
  assert.throws(()=>reserveLabClaim(args,dir),/EEXIST/);
  assert.deepEqual(readLabClaim(TEST_CLAIM,dir).events,["reserved"]);
  assert.equal(listLabClaims(dir)[0].attentionRequired,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("append-only attempts, terminal results and receipt acknowledgements",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-recovery-"));
 try{
  reserveLabClaim(args,dir);
  appendLabEvent(TEST_CLAIM,"attempted",dir);
  assert.throws(()=>appendLabEvent(TEST_CLAIM,"attempted",dir));
  appendLabEvent(TEST_CLAIM,"failed",dir);
  assert.throws(()=>appendLabEvent(TEST_CLAIM,"completed",dir));
  appendLabEvent(TEST_CLAIM,"receipt_accepted",dir);
  assert.equal(readLabClaim(TEST_CLAIM,dir).acknowledged,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("guard denial is valid without Docker execution",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-recovery-"));
 try{
  reserveLabClaim(args,dir);
  appendLabEvent(TEST_CLAIM,"guard_denied",dir);
  assert.equal(readLabClaim(TEST_CLAIM,dir).attempted,false);
  assert.throws(()=>appendLabEvent(TEST_CLAIM,"attempted",dir));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("postcondition rejects incorrect Engine status, identity and unchanged restart start-time",()=>{
 const a={Id:"x",State:{Running:true,Status:"running",StartedAt:"a"}};
 const b={Id:"x",State:{Running:true,Status:"running",StartedAt:"b"}};
 assert.equal(labPostcondition("restart",a,b),true);
 assert.equal(labPostcondition("restart",a,a),false);
 assert.equal(labPostcondition("stop",a,b),false);
 assert.equal(labPostcondition("stop",a,{Id:"x",State:{Running:false,Status:"exited"}}),true);
 assert.equal(labPostcondition("start",a,{...b,Id:"y"}),false);
});
test("corrupt journal and public file permissions fail closed",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-recovery-"));
 try{
  const path=reserveLabClaim(args,dir);
  writeFileSync(path,"bad");
  assert.throws(()=>readLabClaim(TEST_CLAIM,dir));
  if(process.platform!=="win32"){chmodSync(path,0o644);assert.throws(()=>readLabClaim(TEST_CLAIM,dir),/0600/);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("receipt recovery SQL supports only identical outcome replay",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261123080000_docker_dispatch_receipt_recovery.sql",import.meta.url),"utf8");
 assert.match(sql,/v_claim\.state='reported_'\|\|p_outcome/);
 assert.match(sql,/v_claim\.state<>'claimed'/);
 assert.match(sql,/v_claim\.authorized_at IS NULL/);
 assert.doesNotMatch(sql,/GRANT EXECUTE[\s\S]+TO authenticated/);
});
test("recovery CLI is inspection-only",()=>{
 const source=readFileSync(new URL("../scripts/docker-lab-recovery.mjs",import.meta.url),"utf8");
 assert.match(source,/listLabClaims/);
 assert.doesNotMatch(source,/spawnSync|fetch\(|execSync/);
});

test("agent recovery cannot run Docker and normal execution reserves the claim before mutation",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 assert.match(s,/--resend-receipt/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.match(s,/lockLabAgent\(agentId\)/);
 assert.match(s,/readLabClaim\(process\.argv\[6\]\)/);
 assert.match(s,/send\("receipt",journal\.claimId,journal\.outcome\)/);
 assert.match(s,/reserveLabClaim\(\{agentId,claimId:permit\.claimId/);
 assert.match(s,/appendLabEvent\(permit\.claimId,"attempted"\)/);
 assert.match(s,/labPostcondition\(permit\.operation,before,after\)/);
 assert.ok(s.indexOf("reserveLabClaim({agentId")<s.indexOf('docker(["--context",context,"container",permit.operation'));
 assert.ok(s.indexOf('appendLabEvent(permit.claimId,"attempted")')<s.indexOf('docker(["--context",context,"container",permit.operation'));
 assert.doesNotMatch(s,/shell:true/);
});
test("Edge acknowledges only server-stored agent-reported outcomes",()=>{
 const source=readFileSync(new URL("../supabase/functions/docker-command-dispatch/index.ts",import.meta.url),"utf8");
 assert.match(source,/alreadyRecorded:data\.reused===true/);
 assert.match(source,/independentExecutionAudit:false/);
 assert.match(source,/docker_command_consume_nonce/);
 assert.match(source,/crypto\.subtle\.verify/);
});
