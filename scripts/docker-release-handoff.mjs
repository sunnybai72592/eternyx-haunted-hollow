#!/usr/bin/env node
// Docker RELEASE EVIDENCE ONLY. No network, Git shell, Supabase mutation,
// production credentials, automatic approval, or Docker Engine calls.
import {openSync,closeSync,fstatSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {createPublicKey} from "node:crypto";
import {validateDockerDeploymentManifest} from "../src/lib/dockerStagingDeploymentInventory.mjs";
import {prepareDockerReleaseCandidate,authorSignDockerCandidate,
 reviewerCountersignDockerCandidate,verifyDockerReleaseHandoff}
 from "../src/lib/dockerReleaseHandoff.mjs";
const usage="Usage: docker-release-handoff.mjs prepare /ABS/parity.json /ABS/inventory.json /ABS/manifest.json | author /ABS/candidate.json /ABS/author-private.pem | countersign /ABS/authored.json /ABS/reviewer-private.pem /ABS/author-pinned.pub | verify /ABS/dual.json /ABS/author-pinned.pub /ABS/reviewer-pinned.pub /ABS/parity.json /ABS/inventory.json /ABS/manifest.json";
const env=process.env;
function local(path,max=131072){
 if(!isAbsolute(path))throw Error("Absolute evidence path required.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<2||st.size>max||
     process.platform!=="win32"&&(st.uid!==process.getuid()||(st.mode&0o077)!==0))
   throw Error("Review files must be regular, owner-private and size bounded.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
function rawKey(path){
 const encoded=local(path,256).toString("utf8").trim();
 if(!/^[A-Za-z0-9_-]{43}$/.test(encoded))
   throw Error("Noncanonical pinned operator Ed25519 key.");
 const key=Buffer.from(encoded,"base64url");
 if(key.length!==32||key.toString("base64url")!==encoded)
   throw Error("Invalid pinned operator Ed25519 key.");
 return createPublicKey({key:Buffer.concat([
  Buffer.from("302a300506032b6570032100","hex"),key]),format:"der",type:"spki"});
}
function json(path,max=131072){return JSON.parse(local(path,max).toString("utf8"));}
function evidence(a,b,c){
 return {parityBytes:local(a),managementBytes:local(b),
  manifestBytes:local(c,16384),
  pinnedManifestSha256:env.ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256};
}
function contextPin(manifestBytes){
 const manifest=validateDockerDeploymentManifest(JSON.parse(manifestBytes.toString("utf8")));
 if(env.ETERNYX_DOCKER_STAGING_REF!==manifest.stagingProjectRef||
    env.ETERNYX_DOCKER_PRODUCTION_REF!==manifest.productionProjectRef||
    env.ETERNYX_DOCKER_APPROVED_COMMIT_SHA!==manifest.releaseCommitSha)
   throw Error("Independent staging, production and release commit pins required.");
}
function print(value){process.stdout.write(JSON.stringify(value,null,2)+"\n");}
try{
 const [command,...args]=process.argv.slice(2);
 if(env.ETERNYX_DOCKER_RELEASE_REVIEW_ENABLED!=="true")
  throw Error("Release evidence review is explicitly disabled.");
 if(command==="prepare"&&args.length===3){
  const input=evidence(...args);contextPin(input.manifestBytes);
  print(prepareDockerReleaseCandidate(input));
 }else if(command==="author"&&args.length===2){
  print(authorSignDockerCandidate(json(args[0]),local(args[1],8192)));
 }else if(command==="countersign"&&args.length===3){
  print(reviewerCountersignDockerCandidate(
   json(args[0]),local(args[1],8192),rawKey(args[2])));
 }else if(command==="verify"&&args.length===6){
  const input=evidence(...args.slice(3));contextPin(input.manifestBytes);
  print(verifyDockerReleaseHandoff({attestation:json(args[0]),authorPublicKey:rawKey(args[1]),
   reviewerPublicKey:rawKey(args[2]),...input}));
 }else throw Error(usage);
}catch{
 process.stderr.write("Docker release handoff refused: invalid pins, incomplete metadata, different evidence, untrusted signatures or unsafe private files. No credentials or evidence contents were printed. No deployment was attempted.\n");
 process.exitCode=1;
}
