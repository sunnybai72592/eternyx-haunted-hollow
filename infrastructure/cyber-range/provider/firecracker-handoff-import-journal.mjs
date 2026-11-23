/**
 * Crash-detectable two-file operator receipt import on an offline reviewer
 * workstation. A journal marks incomplete imports and a final immutable
 * commit marker is written ONLY after both signed inputs are safely stored.
 *
 * No deletion, retry overwrite, directory creation, networking, or VM use.
 * This is file-integrity accounting, NOT physical hardware attestation.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {constants} from "node:fs";
import {lstat,open,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {validSessionId} from
  "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

export const IMPORT_PENDING=".operator-import.pending.json";
export const IMPORT_COMMITTED=".operator-import.committed.json";
const SHA=/^[a-f0-9]{64}$/;
const SMALL=2048;
const MAX_REPORT=8192;
const MAX_PEM=8192;
const FIELDS=["schemaVersion","classification","sessionId",
  "operatorSignerFingerprint","transportSha256","receiptSha256",
  "publicPemSha256","stage"];
const expectedNames=["operator-report.json","operator-public.pem"];
const digest=x=>createHash("sha256").update(x).digest("hex");
const exact=(v,keys)=>v!==null&&typeof v==="object"&&
  !Array.isArray(v)&&Object.keys(v).sort().join("|")===
  keys.slice().sort().join("|");
function eq(a,b){
  return typeof a==="string"&&SHA.test(a)&&
    typeof b==="string"&&SHA.test(b)&&
    timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
async function trustedDir(dir,owner){
  if(typeof dir!=="string"||resolve(dir)!==dir||dir==="/")
    throw Error("Invalid offline reviewer case path");
  const [info,real]=await Promise.all([lstat(dir),realpath(dir)]);
  if(real!==dir||!info.isDirectory()||info.uid!==owner||
     (info.mode&0o077)!==0)
    throw Error("Reviewer case directory is not privately owned");
}
async function readSafe(file,owner,max){
  let info;
  try{info=await lstat(file);}
  catch(err){
    if(err?.code==="ENOENT")return null;
    throw err;
  }
  if(!info.isFile()||info.uid!==owner||info.nlink!==1||
     (info.mode&0o077)!==0||info.size<1||info.size>max)
    throw Error("Unsafe offline reviewer import file");
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const a=await fd.stat();
    if(a.dev!==info.dev||a.ino!==info.ino||a.size!==info.size)
      throw Error("Reviewer file changed during open");
    const data=await fd.readFile();
    const b=await fd.stat();
    if(b.dev!==a.dev||b.ino!==a.ino||b.size!==a.size||
       b.mtimeMs!==a.mtimeMs||b.ctimeMs!==a.ctimeMs||
       data.length!==a.size)
      throw Error("Reviewer file mutated during read");
    return data;
  }finally{await fd.close();}
}
async function writeExclusive(file,data,owner){
  const fd=await open(file,constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  try{
    const start=await fd.stat();
    if(!start.isFile()||start.uid!==owner||start.nlink!==1||
       (start.mode&0o077)!==0||start.size!==0)
      throw Error("Untrusted new reviewer import file");
    await fd.writeFile(data);
    await fd.sync();
    if((await fd.stat()).size!==data.length)
      throw Error("Incomplete reviewer import write");
  }finally{await fd.close();}
}
async function syncFolder(folder){
  const fd=await open(folder,constants.O_DIRECTORY|constants.O_RDONLY);
  try{await fd.sync();}finally{await fd.close();}
}
function validateMarker(m,stage){
  if(!exact(m,FIELDS)||m.schemaVersion!==1||
     m.classification!=="operator-receipt-import-local-only"||
     !validSessionId(m.sessionId)||!SHA.test(m.operatorSignerFingerprint)||
     !SHA.test(m.transportSha256)||!SHA.test(m.receiptSha256)||
     !SHA.test(m.publicPemSha256)||m.stage!==stage)
    throw Error("Unsupported offline import journal format");
  return m;
}
function record({sessionId,operatorSignerFingerprint,transportSha256,
  receiptBytes,publicPemBytes},stage){
  if(!validSessionId(sessionId)||!SHA.test(operatorSignerFingerprint)||
     !SHA.test(transportSha256)||!Buffer.isBuffer(receiptBytes)||
     !Buffer.isBuffer(publicPemBytes)||receiptBytes.length<1||
     receiptBytes.length>MAX_REPORT||publicPemBytes.length<1||
     publicPemBytes.length>MAX_PEM)
    throw Error("Invalid pinned offline import inputs");
  return validateMarker({
    schemaVersion:1,classification:"operator-receipt-import-local-only",
    sessionId,operatorSignerFingerprint,transportSha256,
    receiptSha256:digest(receiptBytes),
    publicPemSha256:digest(publicPemBytes),stage,
  },stage);
}
const bytes=m=>Buffer.from(JSON.stringify(m)+"\n","utf8");
async function markers(folder,owner){
  const [p,c]=await Promise.all([
    readSafe(join(folder,IMPORT_PENDING),owner,SMALL),
    readSafe(join(folder,IMPORT_COMMITTED),owner,SMALL),
  ]);
  if(c&&!p)throw Error("Committed handoff marker missing its start record");
  const pending=p?validateMarker(JSON.parse(p.toString("utf8")),"pending"):null;
  const committed=c?validateMarker(JSON.parse(c.toString("utf8")),"committed"):null;
  if(p&&!bytes(pending).equals(p))throw Error("Noncanonical import start marker");
  if(c&&!bytes(committed).equals(c))throw Error("Noncanonical import commit marker");
  if(p&&c){
    const expected={...pending,stage:"committed"};
    if(!bytes(expected).equals(c))
      throw Error("Import start and commit journal records disagree");
  }
  return {pending,committed};
}
function matching(m,{sessionId,operatorSignerFingerprint,transportSha256}){
  if(!m || m.sessionId!==sessionId||
     !eq(m.operatorSignerFingerprint,operatorSignerFingerprint)||
     !eq(m.transportSha256,transportSha256))
    throw Error("Import journal identity or out-of-band digest mismatch");
}
/**
 * Read-only status. For incomplete imports, report missing filenames without
 * presenting them as verified. Conflicting existing files are always errors.
 */
export async function auditHandoffImport({
  folder,owner=0,sessionId,operatorSignerFingerprint,transportSha256,
  allowLegacy=false,
}={}){
  await trustedDir(folder,owner);
  const {pending,committed}=await markers(folder,owner);
  if(!pending){
    if(allowLegacy)return Object.freeze({state:"legacy-manual-no-journal",
      verified:false,productionReady:false});
    throw Error("Reviewer import has no transaction journal");
  }
  matching(pending,{sessionId,operatorSignerFingerprint,transportSha256});
  const statuses=await Promise.all(expectedNames.map(async (name,i)=>{
    const content=await readSafe(join(folder,name),owner,
      i===0?MAX_REPORT:MAX_PEM);
    if(content && !eq(digest(content),i===0?pending.receiptSha256:
      pending.publicPemSha256))
      throw Error("Reviewer file differs from pinned import journal");
    return {name,present:!!content};
  }));
  if(committed && statuses.some(s=>!s.present))
    throw Error("Committed reviewer import is missing a signed source");
  return Object.freeze({
    state:committed?"committed":"pending",
    verified:!!committed&&statuses.every(s=>s.present),
    pendingFiles:statuses.filter(s=>!s.present).map(s=>s.name),
    journalMatchesExternallyPinnedIdentity:true,
    sourceFiles:statuses.filter(s=>s.present).length,
    productionReady:false,
  });
}
/**
 * An uncommitted import must block independent human endorsement. Legacy
 * manually staged cases without a journal remain supported but have no
 * machine-verifiable handoff-commit assertion.
 */
export async function assertNoUnfinishedHandoff(folder,owner=0){
  await trustedDir(folder,owner);
  const {pending,committed}=await markers(folder,owner);
  if(!pending)return Object.freeze({legacyManual:true});
  if(!committed)throw Error("Unfinished offline receipt import blocks review");
  const read=await Promise.all(expectedNames.map((name,i)=>
    readSafe(join(folder,name),owner,i===0?MAX_REPORT:MAX_PEM)));
  if(read.some(x=>!x)||
     !eq(digest(read[0]),pending.receiptSha256)||
     !eq(digest(read[1]),pending.publicPemSha256))
    throw Error("Reviewed operator files differ from committed import journal");
  return Object.freeze({importCommitted:true});
}
/**
 * Original import creates a journal first; resume is a DIFFERENT explicit
 * operator action. On resume, existing byte-perfect private inputs are
 * reused, never rewritten; corrupt/foreign files halt for human inspection.
 * The case directory must already exist; never provision it automatically.
 */
export async function commitHandoffImport({
  folder,owner=0,sessionId,operatorSignerFingerprint,transportSha256,
  receiptBytes,publicPemBytes,resume=false,
}={}){
  await trustedDir(folder,owner);
  const start=record({sessionId,operatorSignerFingerprint,transportSha256,
    receiptBytes,publicPemBytes},"pending");
  const existing=await markers(folder,owner);
  if(resume){
    if(!existing.pending ||existing.committed)
      throw Error("No unfinished offline import for explicit recovery");
    matching(existing.pending,{sessionId,operatorSignerFingerprint,
      transportSha256});
    if(!bytes(existing.pending).equals(bytes(start)))
      throw Error("Recovery inputs differ from original signed import");
  }else{
    if(existing.pending||existing.committed)
      throw Error("Import already attempted; inspect or explicitly resume");
    for(const name of expectedNames)
      if(await readSafe(join(folder,name),owner,MAX_REPORT))
        throw Error("Existing reviewer input requires manual investigation");
    await writeExclusive(join(folder,IMPORT_PENDING),bytes(start),owner);
    await syncFolder(folder);
  }
  const files=[
    ["operator-report.json",receiptBytes,MAX_REPORT,start.receiptSha256],
    ["operator-public.pem",publicPemBytes,MAX_PEM,start.publicPemSha256],
  ];
  for(const [name,body,limit,expected] of files){
    const path=join(folder,name);
    const prior=await readSafe(path,owner,limit);
    if(prior){
      if(!resume||!eq(digest(prior),expected)||!prior.equals(body))
        throw Error("Conflicting reviewer case input cannot be overwritten");
    }else await writeExclusive(path,body,owner);
    await syncFolder(folder);
  }
  const end=validateMarker({...start,stage:"committed"},"committed");
  await writeExclusive(join(folder,IMPORT_COMMITTED),bytes(end),owner);
  await syncFolder(folder);
  const result=await auditHandoffImport({
    folder,owner,sessionId,operatorSignerFingerprint,transportSha256,
  });
  if(!result.verified)throw Error("Reviewer case commit was not verified");
  return result;
}
