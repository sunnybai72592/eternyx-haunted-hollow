#!/usr/bin/env node
// Offline staging acceptance assistant: reads operator-local captures ONLY.
// No Docker command, browser token, Supabase request or remote mutation.
import {openSync,fstatSync,readFileSync,closeSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {reviewLocalClaimAgainstOwnerExport} from "../src/lib/dockerLabEvidenceReview.mjs";
import {fingerprintLabContainer,compareLabContainerDrift} from "../src/lib/dockerLabPolicyDrift.mjs";
import {evaluateDockerLabPreflight} from "../src/lib/dockerLabPreflight.mjs";
import {runDockerLabDrills} from "../src/lib/dockerLabDrills.mjs";

const usage="Usage: docker-lab-review.mjs reconcile OWNER_EXPORT.json CLAIM_UUID --journal-dir /ABS/PATH [--audit-proof /ABS/PROOF.json --pinned-agent-key /ABS/PUB.key] | fingerprint /ABS/DOCKER_INSPECT.json FULL64ID | drift /ABS/BASELINE.json /ABS/CURRENT.json FULL64ID PINNED_BASELINE_SHA256 | acceptance";
function fileJSON(path,max=524288){
 if(!isAbsolute(path))throw Error("Use absolute local JSON paths; no URLs or remote endpoints.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>max)throw Error("Missing or oversized local evidence.");
  if(process.platform!=="win32"&&(st.uid!==process.getuid()||(st.mode&0o022)!==0))
    throw Error("Evidence must be owned by the current operator and not group/world writable.");
  return JSON.parse(readFileSync(fd,"utf8"));
 }finally{closeSync(fd);}
}
function failOnAttention(result){
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(result.attentionRequired||result.executionAuthorized===true)process.exitCode=1;
}
try{
 const [mode,...args]=process.argv.slice(2);
 if(mode==="reconcile"){
  if(args.length!==4&&args.length!==8)throw Error(usage);
  const [ownerPath,claimId,journalFlag,journalDir,...extra]=args;
  if(journalFlag!=="--journal-dir"||!isAbsolute(journalDir))throw Error(usage);
  let signedAudit=null,pinnedAgentPublicKey=null;
  if(extra.length){
    if(extra[0]!=="--audit-proof"||extra[2]!=="--pinned-agent-key"||
       !isAbsolute(extra[1])||!isAbsolute(extra[3]))throw Error(usage);
    signedAudit=fileJSON(extra[1],4096);
    pinnedAgentPublicKey=extra[3];
  }
  const result=reviewLocalClaimAgainstOwnerExport(fileJSON(ownerPath,131072),claimId,
    {journalDir,signedAudit,pinnedAgentPublicKey});
  failOnAttention(result);
 }else if(mode==="fingerprint"){
  if(args.length!==2)throw Error(usage);
  failOnAttention(fingerprintLabContainer(fileJSON(args[0]),args[1]));
 }else if(mode==="drift"){
  if(args.length!==4)throw Error(usage);
  failOnAttention(compareLabContainerDrift(fileJSON(args[0]),fileJSON(args[1]),args[2],args[3]));
 }else if(mode==="acceptance"){
  if(args.length!==0)throw Error(usage);
  const drills=runDockerLabDrills();
  const preflight=evaluateDockerLabPreflight();
  const result={schema:"eternyx-docker-local-acceptance-v1",
    mode:"offline-only",drillSummary:drills.summary,
    localPreflight:{passed:preflight.passed,checks:preflight.checks},
    stagedDatabaseTested:false,realDockerInspected:false,hostOwnershipAttested:false,
    executionAuthorized:false,attentionRequired:drills.summary.failed>0||!preflight.passed,
    nextStep:"Independent staging owner isolation, real sandbox inspect and signed dispatch tests remain required."};
  failOnAttention(result);
 }else throw Error(usage);
}catch(error){
 process.stderr.write((error instanceof Error?error.message:"Offline review unavailable.")+"\n");
 process.exitCode=1;
}
