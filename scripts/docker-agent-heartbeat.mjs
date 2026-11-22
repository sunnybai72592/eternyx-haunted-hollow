#!/usr/bin/env node
// CLI-initiated signed Docker Engine observation. No inbound port or Docker
// socket is exposed. Never sends credentials, container names or logs.
import { spawnSync } from "node:child_process";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { isLocalEndpoint } from "../src/lib/dockerOperatorUtils.mjs";
import { dockerHeartbeatMessage, parseDockerHeartbeat } from "../supabase/functions/_shared/docker-heartbeat-contract.mjs";
const usage="Usage: ETERNYX_SUPABASE_URL=https://PROJECT.supabase.co node scripts/docker-agent-heartbeat.mjs AGENT_UUID ABSOLUTE_PRIVATE_KEY_FILE";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function docker(args){
  const result=spawnSync("docker",args,{shell:false,encoding:"utf8",maxBuffer:131072,timeout:7000,windowsHide:true});
  return result.error||result.status!==0?null:result.stdout.trim();
}
function observation(){
  if(process.env.DOCKER_HOST && !isLocalEndpoint(process.env.DOCKER_HOST))
    return {engineAvailable:false,engineVersion:"",containerCount:null};
  const name=docker(["context","show"]);
  if(!name || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(name))
    return {engineAvailable:false,engineVersion:"",containerCount:null};
  const raw=docker(["context","inspect",name,"--format","{{json .Endpoints.docker.Host}}"]);
  let address;
  try{address=JSON.parse(raw);}catch{return {engineAvailable:false,engineVersion:"",containerCount:null};}
  if(!isLocalEndpoint(address))return {engineAvailable:false,engineVersion:"",containerCount:null};
  const version=docker(["--context",name,"version","--format","{{.Server.Version}}"]);
  if(!version||!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(version))
    return {engineAvailable:false,engineVersion:"",containerCount:null};
  const all=docker(["--context",name,"container","ls","--all","--format","{{.ID}}"]);
  const count=all===null?null:all===""?0:all.split(/\r?\n/).length;
  return {engineAvailable:true,engineVersion:version,
    containerCount:count!==null&&count<=5000?count:null};
}
function loadPrivateKey(path){
  if(!isAbsolute(path))throw new Error("Private key path must be absolute.");
  const file=lstatSync(path);
  if(!file.isFile()||file.isSymbolicLink()||file.size>8192)throw new Error("Invalid private key file.");
  if(process.platform!=="win32" &&
    ((file.mode & 0o077)!==0 || typeof process.getuid==="function" && file.uid!==process.getuid()))
    throw new Error("Private key requires current-user ownership and 0600 permissions.");
  const key=createPrivateKey(readFileSync(path,"utf8"));
  if(key.asymmetricKeyType!=="ed25519")throw new Error("Expected Ed25519 private key.");
  return key;
}
async function main(){
  if(process.argv.length!==4 || !UUID.test(process.argv[2]))throw new Error(usage);
  const url=new URL(process.env.ETERNYX_SUPABASE_URL || "");
  if(url.protocol!=="https:" || !url.hostname.endsWith(".supabase.co") ||
     url.username || url.password || url.pathname!=="/" || url.search || url.hash || url.port)
    throw new Error("Expected the HTTPS Supabase project URL, without paths or credentials.");
  const key=loadPrivateKey(process.argv[3]);
  const report={
    agentId:process.argv[2].toLowerCase(),
    signedAt:new Date().toISOString(),
    nonce:randomBytes(32).toString("base64url"),
    ...observation(),
    signature:"A".repeat(86), // validated final signature replaces this immediately
  };
  const message=dockerHeartbeatMessage(report);
  report.signature=sign(null,Buffer.from(message,"utf8"),key).toString("base64url");
  if(!parseDockerHeartbeat(report))throw new Error("Unable to build a valid signed report.");
  const response=await fetch(url.origin+"/functions/v1/docker-heartbeat",{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json","Accept":"application/json",
      ...(process.env.ETERNYX_SUPABASE_PUBLISHABLE_KEY?{"apikey":process.env.ETERNYX_SUPABASE_PUBLISHABLE_KEY}:{})},
    body:JSON.stringify(report),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error("Docker heartbeat rejected (HTTP "+response.status+"). Check enrollment, deployment and clock.");
  const data=await response.json();
  if(data?.accepted!==true || data?.agentId!==report.agentId)
    throw new Error("Heartbeat acknowledgement was invalid.");
  process.stdout.write(JSON.stringify({
    accepted:true,agentId:report.agentId,receivedAt:data.receivedAt,
    engineCliReported:report.engineAvailable,mode:"signed-push-only",
  },null,2)+"\n");
}
main().catch(error=>{
  process.stderr.write((error instanceof Error?error.message:"Docker heartbeat failed.")+"\n");
  process.exitCode=1;
});
