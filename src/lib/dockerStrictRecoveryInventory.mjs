// Strict read-only reconciliation for the *real* local signed Docker agent's
// existing recovery directory. No Docker calls, no network, no cleanup, no
// journal append or terminal-outcome inference.
import {createHash} from "node:crypto";
import {lstatSync,openSync,closeSync,fstatSync,readFileSync,readdirSync,constants} from "node:fs";
import {isAbsolute,join} from "node:path";
import {labJournalDir,readLabClaim} from "./dockerLabRecovery.mjs";

const UUID="[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const claimRe=new RegExp("^claim-("+UUID+")\\.jsonl$");
const lockRe=new RegExp("^agent-("+UUID+")\\.lock$");
const MAX_ENTRIES=100,MAX_FILE=16384;
const digest=b=>createHash("sha256").update(b).digest("hex");
const onlyKeys=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(",")===keys.slice().sort().join(",");
const iso=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function privateDirectory(dir){
 if(typeof dir!=="string"||!isAbsolute(dir))throw Error("Absolute signed-agent journal directory required.");
 const st=lstatSync(dir); // NEVER create a missing journal directory.
 if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=="win32"&&
      (st.uid!==process.getuid()||(st.mode&0o077)!==0)))
  throw Error("Journal directory is not an owned/private real directory.");
 return {dev:st.dev,ino:st.ino,mode:st.mode};
}
function readBoundedPrivateFile(dir,name){
 const path=join(dir,name),before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||before.size<=0||before.size>MAX_FILE||
    (process.platform!=="win32"&&
      (before.uid!==process.getuid()||(before.mode&0o077)!==0)))
  throw Error("Unsafe, symlinked, oversized or publicly readable recovery file.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
     opened.size!==before.size||opened.size<=0||opened.size>MAX_FILE||
     (process.platform!=="win32"&&
       (opened.uid!==process.getuid()||(opened.mode&0o077)!==0)))
   throw Error("Recovery file identity changed before read.");
  const raw=readFileSync(fd);
  const after=fstatSync(fd);
  const nameAfter=lstatSync(path);
  if(raw.length!==before.size||after.size!==before.size||
     after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||
     nameAfter.ino!==before.ino||nameAfter.dev!==before.dev||
     nameAfter.size!==before.size||nameAfter.mtimeMs!==before.mtimeMs||
     nameAfter.ctimeMs!==before.ctimeMs)
   throw Error("Recovery file changed during read.");
  return {sha256:digest(raw),raw};
 }finally{closeSync(fd);}
}
function parseLock(raw,expectedAgent){
 if(raw.length>2048||raw.at(-1)!==10)throw Error("Truncated or invalid agent lock.");
 let entry;try{entry=JSON.parse(raw.toString("utf8"));}catch{throw Error("Invalid agent lock JSON.");}
 if(!onlyKeys(entry,["at","event","agentId"])||entry.event!=="active"||
    entry.agentId!==expectedAgent||!iso(entry.at)||
    raw.toString("utf8")!==JSON.stringify({at:entry.at,event:entry.event,agentId:entry.agentId})+"\n")
  throw Error("Agent lock does not contain the canonical durable active record.");
 return {agentId:expectedAgent,at:entry.at};
}
function singlePass(dir){
 const dirId=privateDirectory(dir);
 const names=readdirSync(dir).sort();
 if(names.length>MAX_ENTRIES)throw Error("Journal inventory exceeds the strict 100-file boundary; no partial listing allowed.");
 const seen=new Set(),claims=[],locks=[],files=[];
 for(const name of names){
  const c=claimRe.exec(name),l=lockRe.exec(name);
  if(!c&&!l)throw Error("Unknown, noncanonical or unexpectedly named journal entry.");
  if(seen.has(name))throw Error("Duplicate journal inventory entry.");
  seen.add(name);
  const data=readBoundedPrivateFile(dir,name);
  files.push({name,sha256:data.sha256});
  if(l){
   const parsed=parseLock(data.raw,l[1]);
   locks.push({...parsed,fileSha256:data.sha256});
  }else{
   const state=readLabClaim(c[1],dir);
   // The existing strict journal parser uses a separate read. Compare raw file
   // identity again so no claim from a changing path can be certified.
   if(readBoundedPrivateFile(dir,name).sha256!==data.sha256)
    throw Error("Claim changed while validating canonical event ordering.");
   if(state.claimId!==c[1])throw Error("Claim filename and journal identity differ.");
   claims.push({
    claimId:state.claimId,agentId:state.agentId,operation:state.operation,
    containerId:state.containerId,events:state.events,outcome:state.outcome,
    attempted:state.attempted,acknowledged:state.acknowledged,
    attentionRequired:state.attentionRequired,fileSha256:data.sha256
   });
  }
 }
 const current=privateDirectory(dir);
 if(dirId.dev!==current.dev||dirId.ino!==current.ino||
    readdirSync(dir).sort().join("\n")!==names.join("\n"))
  throw Error("Journal directory or its file inventory changed during inspection.");
 const evidenceSha256=digest(JSON.stringify(files));
 return {evidenceSha256,claims,locks,fileCount:names.length};
}
export function auditSignedAgentRecoveryDirectory(dir=labJournalDir){
 const first=singlePass(dir),second=singlePass(dir);
 if(first.evidenceSha256!==second.evidenceSha256||
    JSON.stringify(first)!==JSON.stringify(second))
  throw Error("Recovery inventory changed between complete read-only passes.");
 const byAgent=new Map();
 for(const lock of second.locks){
  if(byAgent.has(lock.agentId))throw Error("Conflicting owner locks.");
  byAgent.set(lock.agentId,lock);
 }
 const blocked=[];
 for(const claim of second.claims){
  const lockPresent=byAgent.has(claim.agentId);
  if(claim.outcome===null){
   blocked.push({
    claimId:claim.claimId,agentId:claim.agentId,reason:claim.attempted
     ?"attempted_outcome_unknown":"reserved_without_terminal",
    lockPresent,manualReviewRequired:true
   });
  }else if(claim.attentionRequired){
   blocked.push({
    claimId:claim.claimId,agentId:claim.agentId,reason:"terminal_receipt_not_acknowledged",
    lockPresent,manualReviewRequired:true
   });
  }
 }
 for(const lock of second.locks){
  const matches=second.claims.filter(c=>c.agentId===lock.agentId);
  if(!matches.length)blocked.push({
   agentId:lock.agentId,reason:"lock_without_claim_or_preclaim_process",
   lockPresent:true,manualReviewRequired:true
  });
 }
 const missingLockForUnknown=blocked.some(x=>x.reason==="attempted_outcome_unknown"&&!x.lockPresent);
 const hasRetainedLocks=second.locks.length>0;
 return {
  schema:"eternyx-docker-signed-agent-strict-recovery-inventory-v1",
  inspectedAt:new Date().toISOString(),
  fileCount:second.fileCount,claimCount:second.claims.length,
  lockCount:second.locks.length,inventorySha256:second.evidenceSha256,
  completeInventoryVerified:true,stableDoubleReadVerified:true,
  claims:second.claims.map(c=>({...c,
   lockPresent:byAgent.has(c.agentId),
   receiptReplayAuthorized:false
  })),
  locks:second.locks.map(l=>({...l,
   claimCount:second.claims.filter(c=>c.agentId===l.agentId).length})),
  blocked,
  disposition:blocked.length||hasRetainedLocks?"manual_review_required":"no_unresolved_local_evidence",
  unknownAttemptWithoutLockDetected:missingLockForUnknown,
  agentLockCurrentlyActiveProven:false,
  lockSafeToClearAutomatically:false,
  safeToRetryClaimAutomatically:false,
  uncertainOutcomeAuthorizedForReceipt:false,
  realDockerStateInspected:false,
  remoteReceiptAcknowledgementVerified:false,
  independentPhysicalIsolationVerified:false,
  productionDeploymentAuthorized:false
 };
}
