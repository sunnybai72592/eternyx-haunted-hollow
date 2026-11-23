/**
 * Crash-resistant no-overwrite publication of private OFFLINE evidence files.
 *
 * Files are written and fsynced to a secret random staging inode, then
 * atomically hardlinked into the final directory entry with no replacement.
 * This is local filesystem crash integrity, NOT independent host attestation.
 *
 * If the process dies with a staging inode still present, later operations
 * must stop for human investigation; nothing is silently deleted or retried.
 * Only staging inodes created by the current call are cleaned on exceptions.
 */
import {randomBytes} from "node:crypto";
import {constants} from "node:fs";
import {link,lstat,open,readdir,realpath,unlink} from "node:fs/promises";
import {join,resolve} from "node:path";

export const OFFLINE_STAGE_PREFIX=".eternyx-stage-";
const STAGE=/^\.eternyx-stage-[a-f0-9]{32}\.tmp$/;
const OUTPUTS=new Map([
  [".operator-import.pending.json",2048],
  [".operator-import.committed.json",2048],
  ["operator-report.json",8192],
  ["operator-public.pem",8192],
  ["review-verdict.json",8192],
  ["review-disposition.json",8192],
  ["case-checkpoint.json",8192],
  ["review-runtime-addendum.json",4096],
]);
async function directory(folder,owner){
  if(typeof folder!=="string"||resolve(folder)!==folder||
     folder==="/")
    throw Error("Invalid offline private case folder");
  const [s,real]=await Promise.all([lstat(folder),realpath(folder)]);
  if(real!==folder||!s.isDirectory()||s.uid!==owner||
     (s.mode&0o077)!==0)
    throw Error("Untrusted offline private case directory");
}
async function syncDir(folder){
  const fd=await open(folder,constants.O_DIRECTORY|constants.O_RDONLY|
    constants.O_NOFOLLOW);
  try{await fd.sync();}finally{await fd.close();}
}
export async function assertNoOfflineStageResidue(folder,owner=0){
  await directory(folder,owner);
  const entries=await readdir(folder);
  // Also refuse malformed lookalikes: never guess which remnants are safe.
  if(entries.some(x=>x.startsWith(OFFLINE_STAGE_PREFIX)))
    throw Error("Interrupted offline evidence staging requires manual review");
  return Object.freeze({stagingClean:true});
}
/**
 * Only a fixed allowlisted basename can be published. This cannot replace,
 * delete, read or mutate an existing final destination.
 *
 * A temporary inode may survive a genuine power loss. A fresh operation
 * will then fail closed via assertNoOfflineStageResidue().
 *
 * A successful call guarantees the final path was first visible only after
 * the complete private payload was fsynced, then the containing folder synced.
 */
export async function publishOfflineEvidence({
  folder,name,data,owner=0,
}={}){
  if(!OUTPUTS.has(name)||!Buffer.isBuffer(data)||
     data.length<1||data.length>OUTPUTS.get(name))
    throw Error("Unsupported or unbounded offline evidence publication");
  await assertNoOfflineStageResidue(folder,owner);
  const target=join(folder,name);
  // Existing final names, including dangling symlinks, are NEVER followed or
  // overwritten. link() also refuses all existing target inode types.
  try{await lstat(target);throw Error("Private evidence output already exists");}
  catch(e){if(e?.code!=="ENOENT")throw e;}
  const stage=join(folder,OFFLINE_STAGE_PREFIX+
    randomBytes(16).toString("hex")+".tmp");
  let staged=false,linked=false;
  try{
    const fd=await open(stage,constants.O_WRONLY|constants.O_CREAT|
      constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    staged=true;
    try{
      const start=await fd.stat();
      if(!start.isFile()||start.uid!==owner||start.nlink!==1||
         (start.mode&0o077)!==0||start.size!==0)
        throw Error("Untrusted new offline staging inode");
      await fd.writeFile(data);
      await fd.sync();
      const done=await fd.stat();
      if(done.size!==data.length||done.uid!==owner||
         !done.isFile()||done.nlink!==1||
         (done.mode&0o077)!==0)
        throw Error("Incomplete private staged evidence");
    }finally{await fd.close();}
    // This is the atomic, no-clobber publication point.
    await link(stage,target);
    linked=true;
    await unlink(stage);
    staged=false;
    await syncDir(folder);
    const final=await lstat(target);
    if(!final.isFile()||final.uid!==owner||final.nlink!==1||
       (final.mode&0o077)!==0||final.size!==data.length)
      throw Error("Untrusted published evidence inode");
    return Object.freeze({
      recorded:true,immutableDestination:true,atomicVisibility:true,
      privateFile:true,publicLabsEnabled:false,
    });
  }finally{
    // On exception, clean only this invocation's *random staging name*,
    // never a pre-existing final evidence file or a foreign staging inode.
    if(staged){
      try{await unlink(stage);}catch(e){
        if(e?.code!=="ENOENT")throw e;
      }
      if(linked)await syncDir(folder);
    }
  }
}
