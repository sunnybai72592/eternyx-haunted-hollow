/**
 * Fail-closed cross-file stability gate for OFFLINE Firecracker reviewer cases.
 *
 * Individually safe descriptor reads are not a transaction: an original
 * report could change after the operator public key or source logs are read.
 * Call this AFTER collecting the original raw buffers and AGAIN immediately
 * before publishing any new human-signed case record.
 *
 * This is a bounded, repeat-read comparison, NOT a filesystem lock, a TPM
 * quote, an independently sourced measurement or proof against hostile root.
 */
import {lstat} from "node:fs/promises";
import {join} from "node:path";
import {readPrivateOfflineEvidence} from "./firecracker-private-safe-read.mjs";
import {assertNoOfflineStageResidue} from "./firecracker-offline-atomic-publish.mjs";

const BASE=Object.freeze([
  "operator-report.json","operator-public.pem",
  "host-preflight.json","image-provenance.json",
  "supervisor-journal.txt","cgroup-death.txt",
]);
const OPTIONAL=Object.freeze({
  ".operator-import.pending.json":2048,
  ".operator-import.committed.json":2048,
  "review-verdict.json":8192,
  "review-disposition.json":8192,
  "case-checkpoint.json":8192,
  "review-runtime-addendum.json":4096,
  "runtime-supervisor.json":4096,
  "runtime-cgroup.json":4096,
  "runtime-guest.json":4096,
  "runtime-timeout.json":4096,
});
const MAX=Object.freeze({
  "operator-report.json":8192,"operator-public.pem":8192,
  "host-preflight.json":128*1024,
  "image-provenance.json":128*1024,
  "supervisor-journal.txt":128*1024,
  "cgroup-death.txt":128*1024,
  "guest-challenge.txt":128*1024,
  "timeout-result.txt":128*1024,
  ...OPTIONAL,
});
const MODES=new Set(["guest-vsock","watchdog-900","guest-and-watchdog"]);

function requiredNames(mode){
  if(!MODES.has(mode))throw Error("Unsupported offline snapshot mode");
  return [
    ...BASE,
    ...(mode.includes("guest")?["guest-challenge.txt"]:[]),
    ...(mode.includes("watchdog")?["timeout-result.txt"]:[]),
  ];
}
function validate({mode,expectedFiles,owner,folder}){
  if(typeof folder!=="string"||!folder.startsWith("/")||
     !Number.isSafeInteger(owner)||owner<0||
     expectedFiles===null||typeof expectedFiles!=="object"||
     Array.isArray(expectedFiles))
    throw Error("Untrusted offline snapshot specification");
  const base=requiredNames(mode);
  const allowed=new Set([...base,...Object.keys(OPTIONAL)]);
  if(!mode.includes("guest"))allowed.delete("runtime-guest.json");
  if(!mode.includes("watchdog"))allowed.delete("runtime-timeout.json");
  const keys=Object.keys(expectedFiles);
  if(keys.length<base.length||keys.length>base.length+Object.keys(OPTIONAL).length||
     base.some(name=>!Object.prototype.hasOwnProperty.call(expectedFiles,name))||
     keys.some(name=>!allowed.has(name)||
       !Buffer.isBuffer(expectedFiles[name])||
       expectedFiles[name].length<1||
       expectedFiles[name].length>MAX[name]))
    throw Error("Missing or unexpected bounded offline snapshot source");
  return keys.slice().sort();
}
function sameDirectory(a,b){
  return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&a.gid===b.gid&&
    a.mode===b.mode&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
/**
 * Re-read every original file with no-follow descriptor protection.
 * File bytes are compared exactly, so same-length edits also fail.
 * No values from the file are echoed on failure.
 */
export async function verifyStableOfflineCaseSnapshot({
  folder,mode,expectedFiles,owner=0,
}={}){
  const names=validate({folder,mode,expectedFiles,owner});
  await assertNoOfflineStageResidue(folder,owner);
  const initialDir=await lstat(folder,{bigint:true});
  for(const name of names){
    const actual=await readPrivateOfflineEvidence({
      path:join(folder,name),owner,maxBytes:MAX[name],
    });
    if(!actual.equals(expectedFiles[name]))
      throw Error("Offline case source changed across review snapshot");
  }
  await assertNoOfflineStageResidue(folder,owner);
  const finalDir=await lstat(folder,{bigint:true});
  if(!sameDirectory(initialDir,finalDir))
    throw Error("Offline case directory mutated during review snapshot");
  return Object.freeze({
    stableAcrossSecondPass:true,
    verifiedSourceFiles:names.length,
    checkedPrivateDirectory:true,
    noStagingRemnants:true,
    physicalHostAttested:false,
    independentSourceAuthenticityVerified:false,
    publicLabsEnabled:false,productionReady:false,
  });
}
