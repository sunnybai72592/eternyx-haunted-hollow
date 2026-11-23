#!/usr/bin/env node
// Local review tool, never deploys Edge Functions, flips flags, or contacts a host.
import {readFileSync,openSync,closeSync,fstatSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {createPublicKey} from "node:crypto";
import {auditDockerDeploymentConfig} from "../supabase/functions/_shared/docker-deployment-gate.mjs";
import {signDockerStagingStatement,verifyDockerStagingEnvelope}
 from "../src/lib/dockerStagingEvidence.mjs";
const usage="Usage: node scripts/docker-staging-release-gate.mjs inspect | sign /ABS/statement.json /ABS/operator-private.pem | verify /ABS/signed-report.json /ABS/pinned-operator-public.key";
function readLocal(path,max=32768,privateMode=false){
 if(!isAbsolute(path))throw Error("Only absolute local paths are accepted.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>max)throw Error("Missing or oversized evidence file.");
  if(process.platform!=="win32"&&(st.uid!==process.getuid()||
      (st.mode&(privateMode?0o077:0o022))!==0))
    throw Error("Evidence/key owner or file permissions rejected.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
function repoText(path){
 return readFileSync(new URL("../"+path,import.meta.url),"utf8");
}
export function inspectDockerRepository(){
 return auditDockerDeploymentConfig({
  config:repoText("supabase/config.toml"),
  ownerControl:repoText("supabase/functions/docker-control/index.ts"),
  enrollment:repoText("supabase/functions/docker-enrollment/index.ts"),
  authHelper:repoText("supabase/functions/_shared/user-auth.ts"),
  ownerGuard:repoText("supabase/functions/_shared/docker-owner-guard.mjs"),
  dispatch:repoText("supabase/functions/docker-command-dispatch/index.ts"),
  dispatchHandler:repoText("supabase/functions/_shared/docker-dispatch-handler.mjs"),
  heartbeat:repoText("supabase/functions/docker-heartbeat/index.ts"),
  agent:repoText("scripts/docker-lab-agent.mjs"),
 });
}
const output=record=>process.stdout.write(JSON.stringify(record,null,2)+"\n");
try{
 const [command,...args]=process.argv.slice(2);
 if(command==="inspect"){
  if(args.length)throw Error(usage);
  const report=inspectDockerRepository();
  output(report);
  if(!report.passed)process.exitCode=1;
 }else if(command==="sign"){
  if(args.length!==2)throw Error(usage);
  const statement=JSON.parse(readLocal(args[0],8192).toString("utf8"));
  const envelope=signDockerStagingStatement(statement,readLocal(args[1],8192,true));
  output(envelope);
 }else if(command==="verify"){
  if(args.length!==2)throw Error(usage);
  const envelope=JSON.parse(readLocal(args[0],16384).toString("utf8"));
  const encoded=readLocal(args[1],256).toString("utf8").trim();
  if(!/^[A-Za-z0-9_-]{43}$/.test(encoded))throw Error("Invalid pinned Ed25519 public key.");
  const bytes=Buffer.from(encoded,"base64url");
  if(bytes.length!==32||bytes.toString("base64url")!==encoded)
    throw Error("Invalid pinned public key encoding.");
  const spki=Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),bytes]);
  const result=verifyDockerStagingEnvelope(envelope,
    createPublicKey({key:spki,type:"spki",format:"der"}));
  output(result);
  if(result.classification!=="operator_attested_review_candidate")process.exitCode=1;
 }else throw Error(usage);
}catch(error){
 process.stderr.write((error instanceof Error?error.message:"Local release review failed.")+"\n");
 process.exitCode=1;
}
