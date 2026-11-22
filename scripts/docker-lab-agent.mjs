#!/usr/bin/env node
// Explicitly opted-in local lab dispatch, single job per invocation, never daemon.
// NO public Docker socket. Agent never accepts arbitrary host, URL, command or flags.
import { spawnSync } from "node:child_process";
import { createPrivateKey,createPublicKey,randomBytes,sign } from "node:crypto";
import { readFileSync,lstatSync,mkdirSync,openSync,writeSync,closeSync,constants } from "node:fs";
import { join,isAbsolute } from "node:path";
import { homedir } from "node:os";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim,labPostcondition} from "../src/lib/dockerLabRecovery.mjs";
import { isLocalEndpoint,verifyManagedTarget } from "../src/lib/dockerOperatorUtils.mjs";
import { parseAgentAction,agentActionMessage }
  from "../supabase/functions/_shared/docker-command-contract.mjs";
import { verifyPinnedDockerLabPermit } from "../src/lib/dockerLabPermitGuard.mjs";
import { validateDockerReceiptAcknowledgement } from "../src/lib/dockerLabReceiptGuard.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HELP="Usage: ETERNYX_REMOTE_LAB_ENABLED=true ETERNYX_SUPABASE_URL=https://PROJECT.supabase.co node scripts/docker-lab-agent.mjs AGENT_UUID /ABSOLUTE/AGENT-PRIVATE.pem /ABSOLUTE/PINNED-SERVER-PUBLIC.key --execute-lab";
function privateFile(path){
  if(!isAbsolute(path))throw new Error("Private key path must be absolute.");
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.size>8192)throw new Error("Key must be a small real file.");
  if(process.platform!=="win32" && ((st.mode&0o077)!==0 || st.uid!==process.getuid()))
    throw new Error("Private key file requires owner-only access.");
  return readFileSync(path);
}
function pubFile(path){
  if(!isAbsolute(path))throw new Error("Pinned public key path must be absolute.");
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.size>1024)throw new Error("Invalid pinned server public key.");
  if(process.platform!=="win32" && st.uid!==process.getuid())
    throw new Error("Pinned public key must be owned by the operator.");
  const raw=readFileSync(path,"utf8").trim();
  if(!/^[A-Za-z0-9_-]{43}$/.test(raw))throw new Error("Invalid pinned Ed25519 public key.");
  const bytes=Buffer.from(raw,"base64url");
  if(bytes.length!==32||bytes.toString("base64url")!==raw)throw new Error("Noncanonical pinned key.");
  return createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),bytes]),format:"der",type:"spki"});
}
function docker(args,ms=8000){
  const r=spawnSync("docker",args,{shell:false,encoding:"utf8",timeout:ms,maxBuffer:524288,windowsHide:true});
  if(r.error||r.status!==0)throw new Error("Local Docker command failed.");
  return r.stdout.trim();
}
function localContext(){
  if(process.env.DOCKER_HOST&&!isLocalEndpoint(process.env.DOCKER_HOST))
    throw new Error("Remote Docker endpoints are forbidden.");
  const name=docker(["context","show"]);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(name))throw new Error("Invalid Docker context.");
  let addr;
  try{addr=JSON.parse(docker(["context","inspect",name,"--format","{{json .Endpoints.docker.Host}}"]));}
  catch{throw new Error("Cannot inspect local Docker context.");}
  if(!isLocalEndpoint(addr))throw new Error("Only local Docker Engine is supported.");
  return name;
}
function audit(data){
  const dir=join(homedir(),".eternyx");
  mkdirSync(dir,{recursive:true,mode:0o700});
  const path=join(dir,"docker-lab-dispatch-audit.jsonl");
  const fd=openSync(path,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
  try{writeSync(fd,JSON.stringify({at:new Date().toISOString(),...data})+"\n");}finally{closeSync(fd);}
}
function createAction(kind,agentId,claimId,outcome,key){
  const raw={kind,agentId,signedAt:new Date().toISOString(),nonce:randomBytes(32).toString("base64url"),
    claimId,outcome,signature:"A".repeat(86)};
  raw.signature=sign(null,Buffer.from(agentActionMessage(raw)),key).toString("base64url");
  if(!parseAgentAction(raw))throw new Error("Invalid signed agent action.");
  return raw;
}
async function main(){
  const retryReceipt=process.argv.length===7&&process.argv[5]==="--resend-receipt"&&UUID.test(process.argv[6]||"");
  const executeLab=process.argv.length===6&&process.argv[5]==="--execute-lab";
  if((!executeLab&&!retryReceipt)||!UUID.test(process.argv[2]))
    throw new Error(HELP+" OR --resend-receipt CLAIM_UUID");
  if(process.env.ETERNYX_REMOTE_LAB_ENABLED!=="true")
    throw new Error("Operator lab execution is disabled by default. Set ETERNYX_REMOTE_LAB_ENABLED=true explicitly.");
  const host=new URL(process.env.ETERNYX_SUPABASE_URL||"");
  if(host.protocol!=="https:"||!/^[a-z0-9-]+\.supabase\.co$/.test(host.hostname)||
    host.pathname!=="/"||host.username||host.password||host.port||host.search||host.hash)
    throw new Error("Expected exact HTTPS Supabase project URL.");
  const agentId=process.argv[2].toLowerCase();
  const key=createPrivateKey(privateFile(process.argv[3]));
  if(key.asymmetricKeyType!=="ed25519")throw new Error("Ed25519 agent key required.");
  const pinned=pubFile(process.argv[4]);
  const unlock=lockLabAgent(agentId);
  try {
    const context=executeLab?localContext():null; // Receipt-only recovery never touches Docker
  const endpoint=host.origin+"/functions/v1/docker-command-dispatch";
  const send=async(kind,claimId=null,outcome=null)=>{
    const report=createAction(kind,agentId,claimId,outcome,key);
    const response=await fetch(endpoint,{method:"POST",redirect:"error",cache:"no-store",
      headers:{"Content-Type":"application/json","Accept":"application/json",
      ...(process.env.ETERNYX_SUPABASE_PUBLISHABLE_KEY?{"apikey":process.env.ETERNYX_SUPABASE_PUBLISHABLE_KEY}:{})},
      body:JSON.stringify(report),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("Signed dispatch request rejected (HTTP "+response.status+").");
    const result=await response.json();
    if(!result||typeof result!=="object")throw new Error("Invalid dispatch response.");
    return result;
  };
  if(retryReceipt){
    const journal=readLabClaim(process.argv[6]);
    if(journal.agentId!==agentId||!journal.outcome)throw Error("No finished receipt exists for this agent; inspect the local journal.");
    if(journal.acknowledged){
      process.stdout.write(JSON.stringify({claimId:journal.claimId,alreadyAcknowledged:true})+"\n");
      return;
    }
    const ack=await send("receipt",journal.claimId,journal.outcome);
    validateDockerReceiptAcknowledgement(ack,journal.claimId,journal.outcome);
    appendLabEvent(journal.claimId,"receipt_accepted");
    process.stdout.write(JSON.stringify({claimId:journal.claimId,receiptAcknowledged:true,executedAgain:false})+"\n");
    return;
  }
  const polled=await send("claim");
  if(!polled.job){process.stdout.write(JSON.stringify({job:false,mode:"manual-lab-poll"})+"\n");return;}
  const job=polled.job;
  if(job.agentId!==agentId||!UUID.test(job.claimId)||!UUID.test(job.requestId)||
    !["start","stop","restart"].includes(job.operation)|| !/^[a-f0-9]{64}$/.test(job.containerId)||
    !Number.isFinite(Date.parse(job.expiresAt))||Date.parse(job.expiresAt)<=Date.now())
    throw new Error("Claimed job was invalid; nothing executed.");
  // A second signed round trip verifies policy, active approval, signature and
  // short expiry *again*, right before the guarded local action.
  const authorized=await send("authorize",job.claimId);
  const permit=verifyPinnedDockerLabPermit(authorized,{
    agentId,claimId:job.claimId,requestId:job.requestId,
    operation:job.operation,containerId:job.containerId,
  },pinned);
  // Permanent per-claim exclusive reservation is made BEFORE the first Docker operation.
  // A crash or duplicate claim MUST NOT execute a previously reserved claim again.
  reserveLabClaim({agentId,claimId:permit.claimId,operation:permit.operation,containerId:permit.containerId});
  let outcome="guard_denied",attempted=false;
  try{
    if(Date.parse(permit.expiresAt)<=Date.now())throw Error("Permit expired.");
    const raw=docker(["--context",context,"container","inspect","--format","{{json .}}",permit.containerId]);
    const before=JSON.parse(raw);
    verifyManagedTarget(before,permit.containerId);
    if(Date.parse(permit.expiresAt)<=Date.now())throw Error("Permit expired.");
    audit({claimId:permit.claimId,containerId:permit.containerId,operation:permit.operation,result:"attempted"});
    appendLabEvent(permit.claimId,"attempted");
    attempted=true;
    outcome="failed";
    docker(["--context",context,"container",permit.operation,permit.containerId],20000);
    const after=JSON.parse(docker(["--context",context,"container","inspect","--format","{{json .}}",permit.containerId]));
    if(!labPostcondition(permit.operation,before,after))throw Error("Docker postcondition unconfirmed.");
    outcome="completed";
  }catch{
    process.stderr.write("Lab mutation refused, failed or uncertain. Review local journal; never auto-retry.\n");
  }
  if(attempted&&outcome==="guard_denied")outcome="failed";
  appendLabEvent(permit.claimId,outcome);
  audit({claimId:permit.claimId,containerId:permit.containerId,operation:permit.operation,result:outcome});
  try{
    const receipt=await send("receipt",permit.claimId,outcome);
    validateDockerReceiptAcknowledgement(receipt,permit.claimId,outcome);
    appendLabEvent(permit.claimId,"receipt_accepted");
    process.stdout.write(JSON.stringify({claimId:permit.claimId,
      agentReportedStatus:"reported_"+outcome,independentlyVerified:false})+"\n");
  }catch{
    process.stderr.write("Receipt delivery uncertain. Use --resend-receipt with exact claim ID, never rerun Docker.\n");
    process.exitCode=1;
  }
  } finally {unlock();}
}
main().catch(error=>{
  process.stderr.write((error instanceof Error?error.message:"Local Docker lab dispatch failed.")+"\n");
  process.exitCode=1;
});
