#!/usr/bin/env node
// Explicitly opted-in local lab dispatch, single job per invocation, never daemon.
// NO public Docker socket. Agent never accepts arbitrary host, URL, command or flags.
import { spawnSync } from "node:child_process";
import { createPrivateKey,createPublicKey,randomBytes,sign } from "node:crypto";
import { readFileSync,lstatSync,mkdirSync,openSync,writeSync,closeSync,constants } from "node:fs";
import { join,isAbsolute } from "node:path";
import { homedir } from "node:os";
import {lockLabAgent,reserveLabClaim,appendLabEvent,readLabClaim,labPostcondition} from "../src/lib/dockerLabRecovery.mjs";
import {lockLabContainer} from "../src/lib/dockerLabContainerLock.mjs";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {requireSignedContainerHistoryClear}
  from "../src/lib/dockerSignedContainerHistoryFence.mjs";
import {requireSignedReceiptReplayClear}
  from "../src/lib/dockerSignedReceiptReplayFence.mjs";
import {requireSignedReceiptAcknowledgedEvidence}
  from "../src/lib/dockerSignedReceiptAcknowledgedFence.mjs";
import { verifyManagedTarget } from "../src/lib/dockerOperatorUtils.mjs";
import {validateSignedAgentEnginePins,validateSignedAgentSocket,
  validateSignedAgentEngineObserved,validateSignedAgentTarget}
  from "../src/lib/dockerSignedAgentEngineGate.mjs";
import {assertSignedAgentPreMutationUnchanged,validateSignedAgentLifecycleEvidence}
  from "../src/lib/dockerSignedAgentLastMomentGate.mjs";
import {verifyPinnedDockerCliExecutable,withPinnedDockerCliFile,signedDockerCliEnvironment}
  from "../src/lib/dockerSignedCliExecutableGate.mjs";
import {verifyPinnedDockerClientConfig,validatePinnedDockerCliCommand}
  from "../src/lib/dockerSignedClientConfigGate.mjs";
import { parseAgentAction,agentActionMessage }
  from "../supabase/functions/_shared/docker-command-contract.mjs";
import { verifyPinnedDockerLabPermit } from "../src/lib/dockerLabPermitGuard.mjs";
import { validateDockerReceiptAcknowledgement } from "../src/lib/dockerLabReceiptGuard.mjs";
import {classifyDockerAgentAttempt,requireDurableTerminalBeforeReceipt}
  from "../src/lib/dockerAgentAttemptDisposition.mjs";

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
  // The root-owned ELF is hashed through an O_NOFOLLOW descriptor and Linux
  // EXECUTES THAT VERY DESCRIPTOR (inherited as child fd 3). No second path
  // lookup by PATH or by the original pin is allowed between check and spawn.
  const clientConfig=verifyPinnedDockerClientConfig(process.env);
  validatePinnedDockerCliCommand(args,clientConfig);
  const childEnv=signedDockerCliEnvironment(homedir());
  // Every subprocess points at the independently sealed *root-owned* config,
  // NOT the operator's mutable ~/.docker (and not a DOCKER_CONFIG override).
  const r=withPinnedDockerCliFile(process.env,cli=>spawnSync(
    cli.execPath,["--config",clientConfig.dir,...args],{
    shell:false,encoding:"utf8",timeout:ms,maxBuffer:524288,
    windowsHide:true,env:childEnv,
    stdio:["ignore","pipe","pipe",cli.fd]
  }));
  if(r.error||r.status!==0)throw new Error("Local Docker command failed (pinned CLI).");
  return r.stdout.trim();
}
function localContext(){
  if(process.platform!=="linux"||typeof process.getuid!=="function"||
      process.getuid()===0||process.env.GITHUB_ACTIONS==="true"||process.env.CI==="true")
    throw new Error("Signed Docker execution requires a non-root operator Linux host outside CI.");
  const pins=validateSignedAgentEnginePins(process.env);
  // Admission requires TWO independent operator pins: Engine identity and
  // the exact installed CLI executable (no PATH-selected docker alias).
  verifyPinnedDockerCliExecutable(process.env);
  verifyPinnedDockerClientConfig(process.env);
  signedDockerCliEnvironment(homedir());
  validateSignedAgentSocket(lstatSync(pins.socketPath),process.getuid());
  const name=docker(["context","show"]);
  if(name!==pins.context)throw new Error("Selected signed-agent Docker context is not independently approved.");
  let addr;
  try{addr=JSON.parse(docker(["context","inspect",name,"--format","{{json .Endpoints.docker.Host}}"]));}
  catch{throw new Error("Cannot inspect pinned signed-agent Docker context.");}
  const info=JSON.parse(docker(["--context",name,"info","--format","{{json .}}"]));
  validateSignedAgentEngineObserved({pins,context:name,endpoint:addr,info});
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
  // Once a claim is reserved, a missing durable terminal is a manual-recovery
  // hold. Never release the agent lock on an uncertain Docker operation.
  let retainRecoveryLock=false;
  let unlockContainer=null;
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
      // Even the no-network already-acknowledged shortcut must not report a
      // corrupt or conflicting recovered receipt as safely accepted.
      const evidence=requireSignedReceiptAcknowledgedEvidence(
        auditSignedAgentRecoveryDirectory(),{
          agentId,claimId:journal.claimId,
          containerId:journal.containerId,outcome:journal.outcome
        });
      if(evidence.outcome!==journal.outcome)
        throw Error("Already-acknowledged journal and local history disagree.");
      process.stdout.write(JSON.stringify({claimId:journal.claimId,alreadyAcknowledged:true,
        independentlyVerified:false,executedAgain:false})+"\n");
      return;
    }
    // Receipt-only mode cannot treat a legacy UNKNOWN/failed marker or a
    // single file read as sufficient proof. Full bounded, double-read owner-
    // private history must establish this exact uncontested terminal claim.
    const replay=requireSignedReceiptReplayClear(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:journal.claimId,phase:"before_send"
      });
    if(replay.outcome!==journal.outcome||
       replay.containerId!==journal.containerId)
      throw Error("Receipt replay journal and complete history disagree.");
    requireDurableTerminalBeforeReceipt(journal,journal.outcome);
    const ack=await send("receipt",journal.claimId,journal.outcome);
    validateDockerReceiptAcknowledgement(ack,journal.claimId,journal.outcome);
    // Re-inspect local evidence AFTER the network acknowledgement, BEFORE
    // fsyncing receipt_accepted. A changed claim is not safe to certify.
    const afterReplay=requireSignedReceiptReplayClear(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:journal.claimId,phase:"before_ack",
        originalFileSha256:replay.fileSha256
      });
    if(afterReplay.outcome!==replay.outcome||
       afterReplay.containerId!==replay.containerId)
      throw Error("Receipt replay evidence changed after server acknowledgement.");
    appendLabEvent(journal.claimId,"receipt_accepted");
    requireSignedReceiptAcknowledgedEvidence(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:journal.claimId,
        containerId:journal.containerId,outcome:journal.outcome
      });
    process.stdout.write(JSON.stringify({claimId:journal.claimId,receiptAcknowledged:true,
      independentlyVerified:false,executedAgain:false})+"\n");
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
  const approvedPins=validateSignedAgentEnginePins(process.env);
  const permit=verifyPinnedDockerLabPermit(authorized,{
    agentId,claimId:job.claimId,requestId:job.requestId,
    operation:job.operation,containerId:job.containerId,
  },pinned);
  // Permanent per-claim exclusive reservation is made BEFORE the first Docker operation.
  // A crash or duplicate claim MUST NOT execute a previously reserved claim again.
  // Retain the exclusive lock even if creating/fsyncing a claim journal fails
  // midway: O_EXCL may have created an incomplete file before throwing.
  retainRecoveryLock=true; // Never auto-unlock after partial lock/journal fsync failures.
  try{
    // Atomically own the exact Docker container BEFORE reserving its claim or
    // making any mutating Docker call. Different agent IDs cannot overlap on
    // one operator-owned local journal directory.
    unlockContainer=lockLabContainer({
      agentId,claimId:permit.claimId,containerId:permit.containerId
    });
  }catch(error){
    // A definite EEXIST means another agent already owns the container;
    // this agent never created a claim and can safely release its own lock.
    // All other errors might follow a partial O_EXCL creation/fsync and MUST
    // retain the per-agent lock for operator investigation.
    if(error?.code==="EEXIST")retainRecoveryLock=false;
    throw error;
  }
  // This is the FIRST reliable point where O_EXCL protects history from
  // competing signed agents. Refuse earlier UNKNOWN or unacknowledged claims,
  // even legacy claims created before container locks existed.
  requireSignedContainerHistoryClear(auditSignedAgentRecoveryDirectory(),{
    agentId,claimId:permit.claimId,containerId:permit.containerId,phase:"preclaim"
  });
  reserveLabClaim({agentId,claimId:permit.claimId,operation:permit.operation,containerId:permit.containerId});
  let attempted=false,postconditionConfirmed=false;
  try{
    if(Date.parse(permit.expiresAt)<=Date.now())throw Error("Permit expired.");
    const raw=docker(["--context",context,"container","inspect","--format","{{json .}}",permit.containerId]);
    const before=JSON.parse(raw);
    verifyManagedTarget(before,permit.containerId);
    validateSignedAgentTarget(before,permit.containerId,permit.operation,
      approvedPins);
    if(Date.parse(permit.expiresAt)<=Date.now())throw Error("Permit expired.");
    // Set uncertainty BEFORE fsync. Even an interrupted/partially written
    // attempted event must never be downgraded into a guard_denied receipt.
    attempted=true;
    appendLabEvent(permit.claimId,"attempted");
    audit({claimId:permit.claimId,containerId:permit.containerId,operation:permit.operation,result:"attempted"});
    if(Date.parse(permit.expiresAt)<=Date.now())throw Error("Permit expired after attempt reservation.");
    if(localContext()!==context)throw Error("Signed-agent Docker context changed before mutation.");
    // Recheck the exact target AFTER the independent daemon/context gate and
    // immediately before mutation. Stable image/policy alone is insufficient:
    // another process could have changed a lifecycle epoch or network state.
    const justBefore=JSON.parse(docker(["--context",context,"container","inspect",
      "--format","{{json .}}",permit.containerId]));
    assertSignedAgentPreMutationUnchanged(
      before,justBefore,permit.containerId,permit.operation,approvedPins);
    // Last-moment complete private journal scan: the claim must still be the
    // exact original attempted-only record. Any missing, partial or changed
    // claim/lock or older unreconciled operation is UNKNOWN and stops here.
    requireSignedContainerHistoryClear(auditSignedAgentRecoveryDirectory(),{
      agentId,claimId:permit.claimId,containerId:permit.containerId,phase:"premutation"
    });
    if(Date.parse(permit.expiresAt)<=Date.now())
      throw Error("Signed permit expired during last-moment container reinspection.");
    docker(["--context",context,"container",permit.operation,permit.containerId],20000);
    const after=JSON.parse(docker(["--context",context,"container","inspect","--format","{{json .}}",permit.containerId]));
    validateSignedAgentTarget(after,permit.containerId,permit.operation,
      approvedPins,{stage:"after"});
    if(!labPostcondition(permit.operation,before,after))throw Error("Docker postcondition unconfirmed.");
    validateSignedAgentLifecycleEvidence(before,after,permit.operation);
    postconditionConfirmed=true;
  }catch{
    process.stderr.write("Lab guard, mutation or postcondition not confirmed. Inspect journal; never auto-retry.\n");
  }
  const disposition=classifyDockerAgentAttempt({attempted,postconditionConfirmed});
  if(!disposition.outcome){
    // NO synthetic failed receipt after a Docker timeout or disputed state.
    // Keep the owner-private exclusive lock and attempted-only journal intact.
    try{audit({claimId:permit.claimId,containerId:permit.containerId,
      operation:permit.operation,result:"unknown_attempt_manual_review_required"});}
    catch{process.stderr.write("Could not append local uncertainty audit; original recovery hold remains.\n");}
    process.stderr.write("Docker outcome UNKNOWN. No terminal event or signed receipt; agent locked pending independent human review.\n");
    process.exitCode=1;
    return;
  }
  const outcome=disposition.outcome;
  appendLabEvent(permit.claimId,outcome);
  requireDurableTerminalBeforeReceipt(readLabClaim(permit.claimId),outcome);
  // The container's exclusive lock has its own matching durable-terminal
  // check and tamper guard. Keep BOTH agent and container holds on failure.
  unlockContainer();
  unlockContainer=null;
  // The normal signed dispatch must observe the SAME strict inventory
  // admission as the separate --resend-receipt path. Keep the original
  // agent lock until the terminal and recovered history are inspected.
  // A pre-send forensic mismatch requires manual review, never a receipt.
  let originalReceiptEvidence=null;
  try{
    const ready=requireSignedReceiptReplayClear(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:permit.claimId,phase:"before_send"
      });
    if(ready.outcome!==outcome||ready.containerId!==permit.containerId)
      throw Error("Normal signed receipt outcome and forensic history disagree.");
    requireDurableTerminalBeforeReceipt(readLabClaim(permit.claimId),outcome);
    originalReceiptEvidence=ready;
    audit({claimId:permit.claimId,containerId:permit.containerId,
      operation:permit.operation,result:outcome});
    const receipt=await send("receipt",permit.claimId,outcome);
    validateDockerReceiptAcknowledgement(receipt,permit.claimId,outcome);
    // A valid server reply alone cannot prove the local journal survived
    // transport unchanged. Repeat complete history before recording ack.
    const checked=requireSignedReceiptReplayClear(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:permit.claimId,phase:"before_ack",
        originalFileSha256:ready.fileSha256
      });
    if(checked.outcome!==outcome||checked.containerId!==permit.containerId)
      throw Error("Signed receipt evidence drifted during delivery.");
    appendLabEvent(permit.claimId,"receipt_accepted");
    // Require the *new* canonical acknowledged transition to persist.
    requireSignedReceiptAcknowledgedEvidence(
      auditSignedAgentRecoveryDirectory(),{
        agentId,claimId:permit.claimId,
        containerId:permit.containerId,outcome
      });
    retainRecoveryLock=false;
    process.stdout.write(JSON.stringify({claimId:permit.claimId,
      agentReportedStatus:"reported_"+outcome,independentlyVerified:false})+"\n");
  }catch{
    // An interrupted HTTPS request is not a Docker failure. If the original
    // exact terminal file and recovery inventory are still unchanged, only
    // release the per-agent lock so the operator can explicitly invoke the
    // existing Docker-free --resend-receipt path. Otherwise retain the lock.
    if(originalReceiptEvidence){
      try{
        const checked=requireSignedReceiptReplayClear(
          auditSignedAgentRecoveryDirectory(),{
            agentId,claimId:permit.claimId,phase:"before_ack",
            originalFileSha256:originalReceiptEvidence.fileSha256
          });
        if(checked.outcome===outcome&&checked.containerId===permit.containerId)
          retainRecoveryLock=false;
      }catch{
        process.stderr.write("Receipt forensic evidence changed; retain the original agent lock for manual review.\n");
      }
    }
    process.stderr.write("Receipt delivery or local acknowledgement uncertain. Never rerun Docker; independently review the original journal before explicit receipt-only recovery.\n");
    process.exitCode=1;
  }
  } finally {if(!retainRecoveryLock)unlock();}
}
main().catch(error=>{
  process.stderr.write((error instanceof Error?error.message:"Local Docker lab dispatch failed.")+"\n");
  process.exitCode=1;
});
