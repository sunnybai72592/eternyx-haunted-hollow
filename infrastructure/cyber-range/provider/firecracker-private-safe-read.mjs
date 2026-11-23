/**
 * Race-resistant, bounded reader for fixed private offline Labs evidence.
 *
 * The caller validates the parent directory and fixed filename separately.
 * This reader refuses symlinks/hardlinks, FIFOs/devices, swapped path names,
 * changes to inode metadata while reading, oversized files and loose modes.
 * It never contacts any service and does not attest physical source origin.
 */
import {constants} from "node:fs";
import {lstat,open} from "node:fs/promises";

const MAX_ALLOWED=128*1024;
function trustedStat(s,owner,maxBytes){
  return s.isFile()&&s.uid===BigInt(owner)&&s.nlink===1n&&
    (s.mode&0o077n)===0n&&s.size>=1n&&
    s.size<=BigInt(maxBytes);
}
function sameIdentity(a,b){
  return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
    a.mode===b.mode&&a.uid===b.uid&&a.gid===b.gid&&
    a.size===b.size&&a.mtimeNs===b.mtimeNs&&
    a.ctimeNs===b.ctimeNs;
}
async function pathStat(file,allowMissing){
  try{return await lstat(file,{bigint:true});}
  catch(err){
    if(allowMissing&&err?.code==="ENOENT")return null;
    throw err;
  }
}
/**
 * For an import journal's optional missing markers, only a file absent at
 * the INITIAL lstat can return null. Disappearance or replacement later
 * always throws; there is no permissive fallback after a race.
 *
 * fd O_NONBLOCK protects against FIFO substitution between lstat and open.
 * The last path lstat detects pathname exchange after the descriptor opened.
 */
export async function readPrivateOfflineEvidence({
  path,owner=0,maxBytes,allowMissing=false,
}={}){
  if(typeof path!=="string"||!path.startsWith("/")||
    !Number.isSafeInteger(owner)||owner<0||
    !Number.isSafeInteger(maxBytes)||maxBytes<1||
    maxBytes>MAX_ALLOWED||typeof allowMissing!=="boolean")
    throw Error("Invalid bounded offline evidence read contract");
  const initial=await pathStat(path,allowMissing);
  if(!initial)return null;
  if(!trustedStat(initial,owner,maxBytes))
    throw Error("Untrusted private offline evidence file");
  const fd=await open(path,
    constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const opened=await fd.stat({bigint:true});
    if(!trustedStat(opened,owner,maxBytes)||
       !sameIdentity(initial,opened))
      throw Error("Offline evidence inode changed during open");
    const content=await fd.readFile();
    const finalFd=await fd.stat({bigint:true});
    if(!Buffer.isBuffer(content)||
       BigInt(content.length)!==opened.size||
       !trustedStat(finalFd,owner,maxBytes)||
       !sameIdentity(opened,finalFd))
      throw Error("Offline evidence changed while being read");
    const finalPath=await pathStat(path,false);
    if(!trustedStat(finalPath,owner,maxBytes)||
       !sameIdentity(finalFd,finalPath))
      throw Error("Offline evidence path was replaced while being read");
    return content;
  }finally{await fd.close();}
}
