#!/usr/bin/env node
// Offline handoff ONLY: no Docker, Git subprocess, network, crash injection, or receipt replay.
import {openSync,closeSync,readFileSync,fstatSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {prepareDockerHostCrashHandoff,authorHostCrashEvidence,
 countersignHostCrashEvidence,verifyHostCrashEvidence}
 from "../src/lib/dockerHostCrashEvidenceHandoff.mjs";

const env=process.env,HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
function local(path,max=32768){
 if(typeof path!=="string"||!isAbsolute(path))throw Error("Absolute owner-private file path required.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<2||st.size>max||
   st.uid!==process.getuid()||(st.mode&0o077)!==0)
   throw Error("Unsafe or oversized evidence or key file.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
function json(path){return JSON.parse(local(path).toString("utf8"));}
function pins(){
 const p={
  approvedSourceCommitSha:env.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  daemonIdentitySha256:env.ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256,
  socketEndpointSha256:env.ETERNYX_DOCKER_HOST_SOCKET_SHA256,
  containerId:env.ETERNYX_DOCKER_HOST_CONTAINER_ID,
  imageSha256:env.ETERNYX_DOCKER_HOST_IMAGE_SHA256,
  managedContainerPolicySha256:env.ETERNYX_DOCKER_HOST_POLICY_SHA256,
  routeSnapshotSha256:env.ETERNYX_DOCKER_HOST_ROUTE_SHA256
 };
 if(!SHA.test(p.approvedSourceCommitSha||"")||
  Object.entries(p).slice(1).some(([k,v])=>!HEX.test(v||"")))
  throw Error("Missing independent exact host evidence pins.");
 return p;
}
const emit=o=>process.stdout.write(JSON.stringify(o,null,2)+"\n");
try{
 const [action,...args]=process.argv.slice(2);
 if(process.platform!=="linux"||process.getuid()===0||
    env.CI==="true"||env.GITHUB_ACTIONS==="true"||
    env.ETERNYX_DOCKER_HOST_EVIDENCE_HANDOFF_APPROVAL!=="I_APPROVE_OFFLINE_HOST_EVIDENCE_REVIEW")
  throw Error("Offline operator-only Linux evidence review approval required.");
 const p=pins();
 if(action==="author"&&args.length===3){
  const [baselineBytes,triageBytes]=args.slice(0,2).map(x=>local(x));
  const candidate=prepareDockerHostCrashHandoff({baselineBytes,triageBytes,pins:p});
  emit(authorHostCrashEvidence(candidate,local(args[2],8192)));
 }else if(action==="countersign"&&args.length===5){
  if(env.ETERNYX_DOCKER_HOST_INDEPENDENT_REVIEW_APPROVAL!=="I_REVIEWED_EXTERNAL_HOST_RECORDS")
   throw Error("Independent reviewer has not confirmed site records.");
  const [authored,baselineBytes,triageBytes]=[
   json(args[0]),local(args[1]),local(args[2])];
  const candidate=prepareDockerHostCrashHandoff({baselineBytes,triageBytes,pins:p});
  if(JSON.stringify(authored.candidate)!==JSON.stringify(candidate))
   throw Error("Authored evidence is not bound to these same raw on-host reports.");
  emit(countersignHostCrashEvidence(authored,local(args[4],8192),local(args[3],8192)));
 }else if(action==="verify"&&args.length===5){
  emit(verifyHostCrashEvidence({
   packageBytes:local(args[0]),baselineBytes:local(args[1]),triageBytes:local(args[2]),
   authorPublicKey:local(args[3],8192),reviewerPublicKey:local(args[4],8192),pins:p
  }));
 }else throw Error("Usage: author /ABS/baseline.json /ABS/triage.json /ABS/author-private.pem | countersign /ABS/authored.json /ABS/baseline.json /ABS/triage.json /ABS/author-public.pem /ABS/reviewer-private.pem | verify /ABS/dual.json /ABS/baseline.json /ABS/triage.json /ABS/author-public.pem /ABS/reviewer-public.pem");
}catch{
 process.stderr.write("Host crash evidence review refused: missing operator/reviewer approval, independent identity pins, private evidence, valid Ed25519 keys, consistency, or signature. No Docker call, receipt action, journal edit, deployment or crash test occurred.\n");
 process.exitCode=1;
}
