#!/usr/bin/env node
// Offline-only release evidence parity. Never invokes Git, Supabase, Docker,
// a shell command, HTTP, or the production execution feature flags.
import {openSync,closeSync,fstatSync,readFileSync,lstatSync,constants} from "node:fs";
import {isAbsolute,join} from "node:path";
import {createPublicKey} from "node:crypto";
import {DOCKER_RELEASE_SOURCE_PATHS,DOCKER_STAGING_EVIDENCE_CHECKS,
 makeDockerStagingSourceSnapshot,reviewDockerStagingEvidence} from "../src/lib/dockerStagingParity.mjs";
const usage="Usage: node scripts/docker-staging-parity.mjs snapshot COMMIT_SHA | review /ABS/SNAPSHOT.json /ABS/SIGNED.json /ABS/PINNED-OPERATOR.pub /ABS/STAGING-AUTH.json /ABS/ARTIFACT-DIR";
function safeRead(path,max=262144,sensitive=false){
 if(!isAbsolute(path))throw Error("Absolute operator evidence path required.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<2||st.size>max||
     process.platform!=="win32"&&(st.uid!==process.getuid()||
       (st.mode&(sensitive?0o077:0o022))!==0))
    throw Error("Invalid size, ownership, or permissions for staging evidence.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
function sourceFiles(){
 return Object.fromEntries(DOCKER_RELEASE_SOURCE_PATHS.map(path=>[
   path,readFileSync(new URL("../"+path,import.meta.url),"utf8")
 ]));
}
function pinnedOperatorKey(path){
 const key=safeRead(path,256).toString("utf8").trim();
 if(!/^[A-Za-z0-9_-]{43}$/.test(key))throw Error("Invalid raw Ed25519 operator pin.");
 const bytes=Buffer.from(key,"base64url");
 if(bytes.length!==32||bytes.toString("base64url")!==key)
   throw Error("Noncanonical operator public-key pin.");
 return createPublicKey({key:Buffer.concat([
   Buffer.from("302a300506032b6570032100","hex"),bytes
 ]),format:"der",type:"spki"});
}
const parsed=path=>JSON.parse(safeRead(path,65536,true).toString("utf8"));
function evidenceDir(path){
 if(!isAbsolute(path))throw Error("Absolute artifact directory required.");
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||
    process.platform!=="win32"&&(st.uid!==process.getuid()||(st.mode&0o077)!==0))
    throw Error("Staging artifacts directory must be private to its owner.");
 return Object.fromEntries(DOCKER_STAGING_EVIDENCE_CHECKS.slice(3).map(id=>[
  id,safeRead(join(path,id+".json"),262144,true)
 ]));
}
function output(r){process.stdout.write(JSON.stringify(r,null,2)+"\n");}
try{
 const [command,...args]=process.argv.slice(2);
 if(command==="snapshot"){
   if(args.length!==1)throw Error(usage);
   output(makeDockerStagingSourceSnapshot(args[0],sourceFiles()));
 }else if(command==="review"){
   if(args.length!==5)throw Error(usage);
   const env=process.env;
   if(env.ETERNYX_DOCKER_STAGING_PARITY_REVIEW!=="true")
     throw Error("Explicit offline parity-review opt-in is required.");
   const result=reviewDockerStagingEvidence({
    snapshot:parsed(args[0]),sourceFiles:sourceFiles(),
    pinnedSnapshotSha256:env.ETERNYX_DOCKER_PINNED_SOURCE_SNAPSHOT_SHA256,
    signedStatement:parsed(args[1]),pinnedOperatorKey:pinnedOperatorKey(args[2]),
    hostedProbeBytes:safeRead(args[3],262144,true),
    artifactBytes:evidenceDir(args[4]),
    pinnedStagingHost:env.ETERNYX_DOCKER_STAGING_PINNED_HOST,
    productionHost:env.ETERNYX_DOCKER_PRODUCTION_HOST,
   });
   output(result);
 }else throw Error(usage);
}catch{
 process.stderr.write("Docker staging parity review refused: invalid source pin, incomplete evidence, stale or untrusted operator report, or unsafe local files. No credentials or evidence contents were printed.\n");
 process.exitCode=1;
}
