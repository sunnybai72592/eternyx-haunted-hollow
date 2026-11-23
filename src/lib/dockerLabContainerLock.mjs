// Operator-only cross-agent exclusion for ONE exact, independently approved
// managed Docker container on ONE shared private local journal directory.
// This never invokes Docker, network requests, cleanup or automatic recovery.
import {lstatSync,openSync,closeSync,fstatSync,readFileSync,writeSync,
 fsyncSync,unlinkSync,constants} from "node:fs";
import {isAbsolute,join} from "node:path";
import {labJournalDir,readLabClaim} from "./dockerLabRecovery.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL=/^[a-f0-9]{64}$/;
const flags=constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0);

function privateDirectory(dir){
 if(typeof dir!=="string"||!isAbsolute(dir))throw Error("Absolute shared operator journal directory required.");
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=="win32"&&(st.uid!==process.getuid()||(st.mode&0o077)!==0)))
  throw Error("Container lock directory must be a real operator-private directory.");
 return dir;
}
function syncDir(dir){
 if(process.platform==="win32")return;
 const fd=openSync(dir,constants.O_RDONLY|(constants.O_DIRECTORY||0));
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
function privateLockStat(path){
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>2048||
    (process.platform!=="win32"&&(stat.uid!==process.getuid()||(stat.mode&0o077)!==0)))
  throw Error("Unsafe or tampered exclusive container recovery lock.");
 return stat;
}
export function lockLabContainer({agentId,claimId,containerId},dir=labJournalDir){
 if(!UUID.test(agentId||"")||!UUID.test(claimId||"")||!FULL.test(containerId||""))
  throw Error("Exact agent, claim and full container IDs required for exclusive Docker lock.");
 const owner=agentId.toLowerCase(),claim=claimId.toLowerCase();
 privateDirectory(dir);
 const path=join(dir,"container-"+containerId+".lock");
 // O_EXCL guarantees atomic exclusion against different agents sharing this
 // exact local private directory, even if they have different agent locks.
 // A crash or fsync error MUST leave the claimed lock for human review.
 const fd=openSync(path,flags,0o600);
 const bytes=Buffer.from(JSON.stringify({
  at:new Date().toISOString(),event:"active",agentId:owner,
  claimId:claim,containerId
 })+"\n");
 try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 syncDir(dir);
 const original=privateLockStat(path);
 let released=false;
 return ()=>{
  if(released)return;
  // No caller can remove this lock without the original claim having a
  // durable, parsed terminal result. UNKNOWN or partial journals retain it.
  const journal=readLabClaim(claim,dir);
  if(journal.agentId!==owner||journal.containerId!==containerId||
     journal.claimId!==claim||journal.outcome===null||
     !["guard_denied","completed","failed"].includes(journal.outcome))
   throw Error("Exclusive container lock cannot be released without matching durable terminal evidence.");
  const current=privateLockStat(path);
  if(current.dev!==original.dev||current.ino!==original.ino||
     current.size!==bytes.length||current.mtimeMs!==original.mtimeMs||
     current.ctimeMs!==original.ctimeMs)
   throw Error("Exclusive container lock identity changed; manual review required.");
  // O_NOFOLLOW protects the final read. Do not unlink a replaced or rewritten
  // lock, even if it still names the same container ID.
  const reader=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{
   const opened=fstatSync(reader);
   if(opened.ino!==original.ino||opened.dev!==original.dev||
      !readFileSync(reader).equals(bytes))
    throw Error("Exclusive container lock bytes changed; manual review required.");
  }finally{closeSync(reader);}
  unlinkSync(path);
  released=true;
  syncDir(dir);
 };
}
