// Synthetic offline drills of ETERNYX's actual journal and safety guard helpers.
// This code never runs Docker, invokes HTTP or reads production claim journals.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim,labPostcondition} from "./dockerLabRecovery.mjs";
import {verifyManagedTarget} from "./dockerOperatorUtils.mjs";
export const DOCKER_DRILL_CASES=Object.freeze([
 "duplicate_claim_denied","reserved_crash_unresolved","attempted_crash_unresolved",
 "guard_denial_never_executed","completion_pending_receipt","failure_pending_receipt",
 "receipt_acknowledged","agent_lock_exclusive","journal_tamper_rejected",
 "hardened_container_guard","postcondition_checks"
]);
const AGENT="33333333-3333-4333-8333-333333333333",ID="a".repeat(64);
const claim=()=>({agentId:AGENT,claimId:randomUUID(),containerId:ID,operation:"stop"});
function safeContainer(){
 return {Id:ID,Mounts:[],Config:{User:"10001:10001",Labels:{
  "io.eternyx.operator.managed":"true","io.eternyx.operator.scope":"local-workbench"
 }},HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",
  Binds:[],PortBindings:{},CapAdd:[],CapDrop:["ALL"],Devices:[],DeviceRequests:[],
  SecurityOpt:["no-new-privileges"],PidsLimit:64,Memory:134217728,RestartPolicy:{Name:"no"}}};
}
function exercise(name,dir){
 const item=claim();
 if(name==="duplicate_claim_denied"){
  reserveLabClaim(item,dir);
  assert.throws(()=>reserveLabClaim(item,dir),{code:"EEXIST"});
 }else if(name==="reserved_crash_unresolved"){
  reserveLabClaim(item,dir);
  assert.deepEqual(readLabClaim(item.claimId,dir).events,["reserved"]);
  assert.equal(readLabClaim(item.claimId,dir).attentionRequired,true);
 }else if(name==="attempted_crash_unresolved"){
  reserveLabClaim(item,dir);appendLabEvent(item.claimId,"attempted",dir);
  const state=readLabClaim(item.claimId,dir);
  assert.equal(state.outcome,null);assert.equal(state.attempted,true);
  assert.throws(()=>reserveLabClaim(item,dir),{code:"EEXIST"});
 }else if(name==="guard_denial_never_executed"){
  reserveLabClaim(item,dir);appendLabEvent(item.claimId,"guard_denied",dir);
  assert.equal(readLabClaim(item.claimId,dir).attempted,false);
  assert.throws(()=>appendLabEvent(item.claimId,"attempted",dir));
 }else if(["completion_pending_receipt","failure_pending_receipt"].includes(name)){
  reserveLabClaim(item,dir);appendLabEvent(item.claimId,"attempted",dir);
  appendLabEvent(item.claimId,name==="completion_pending_receipt"?"completed":"failed",dir);
  const state=readLabClaim(item.claimId,dir);
  assert.equal(state.acknowledged,false);assert.equal(state.attentionRequired,true);
 }else if(name==="receipt_acknowledged"){
  reserveLabClaim(item,dir);appendLabEvent(item.claimId,"attempted",dir);
  appendLabEvent(item.claimId,"completed",dir);appendLabEvent(item.claimId,"receipt_accepted",dir);
  assert.equal(readLabClaim(item.claimId,dir).attentionRequired,false);
  assert.throws(()=>appendLabEvent(item.claimId,"failed",dir));
 }else if(name==="agent_lock_exclusive"){
  const unlock=lockLabAgent(AGENT,dir);
  try{assert.throws(()=>lockLabAgent(AGENT,dir),{code:"EEXIST"});}
  finally{unlock();}
  lockLabAgent(AGENT,dir)();
 }else if(name==="journal_tamper_rejected"){
  const path=reserveLabClaim(item,dir);
  writeFileSync(path,readFileSync(path,"utf8").replace("reserved","completed"));
  assert.throws(()=>readLabClaim(item.claimId,dir));
 }else if(name==="hardened_container_guard"){
  const good=safeContainer();
  assert.equal(verifyManagedTarget(good,ID).id,ID);
  assert.throws(()=>verifyManagedTarget({...good,HostConfig:{...good.HostConfig,Privileged:true}},ID));
  assert.throws(()=>verifyManagedTarget({...good,HostConfig:{...good.HostConfig,NetworkMode:"host"}},ID));
  assert.throws(()=>verifyManagedTarget({...good,Mounts:[{Type:"bind"}]},ID));
  assert.throws(()=>verifyManagedTarget(good,"b".repeat(64)));
 }else if(name==="postcondition_checks"){
  const before={Id:ID,State:{Running:true,Status:"running",StartedAt:"before"}};
  const after={Id:ID,State:{Running:true,Status:"running",StartedAt:"after"}};
  assert.equal(labPostcondition("restart",before,after),true);
  assert.equal(labPostcondition("restart",before,before),false);
  assert.equal(labPostcondition("stop",before,after),false);
  assert.equal(labPostcondition("stop",before,{Id:ID,State:{Running:false,Status:"exited"}}),true);
  assert.equal(labPostcondition("start",before,{...after,Id:"b".repeat(64)}),false);
 }else throw Error("Unknown scenario.");
}
export function runDockerLabDrills(){
 const root=mkdtempSync(join(tmpdir(),"eternyx-docker-offline-"));
 let cases=[];
 try{
  cases=DOCKER_DRILL_CASES.map((id,i)=>{
   const dir=join(root,String(i));mkdirSync(dir,{mode:0o700});
   try{exercise(id,dir);return {id,result:"pass"};}
   catch{return {id,result:"fail"};}
  });
 }finally{rmSync(root,{recursive:true,force:true});}
 if(existsSync(root))throw Error("Offline drill cleanup failed.");
 const passed=cases.filter(c=>c.result==="pass").length;
 return {schema:"eternyx-docker-drill-v1",mode:"offline-synthetic-only",
  createdAt:new Date().toISOString(),cases,summary:{total:cases.length,passed,failed:cases.length-passed},
  executionAuthorized:false,actualDockerContacted:false,remoteServerVerified:false};
}
