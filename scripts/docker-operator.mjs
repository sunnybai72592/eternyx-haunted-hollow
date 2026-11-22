#!/usr/bin/env node
// Trusted operator only. Does not listen on any network socket.
import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, writeSync, closeSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseOperatorArgs, isLocalEndpoint, jsonRows, safeList, safeImages, safeStats, safeInspect, verifyManagedTarget } from "../src/lib/dockerOperatorUtils.mjs";
const help = [
  "ETERNYX Docker operator: trusted workstation only",
  "  node scripts/docker-operator.mjs list|images",
  "  node scripts/docker-operator.mjs inspect|stats|logs FULL_CONTAINER_ID",
  "  node scripts/docker-operator.mjs start|stop|restart FULL_CONTAINER_ID",
  "  node scripts/docker-operator.mjs start|stop|restart FULL_CONTAINER_ID --confirm FULL_CONTAINER_ID",
  "The first lifecycle command previews; a confirmed command executes only on hardened, labeled local lab targets.",
].join("\n");
function docker(argv,ms=8000) {
  const result=spawnSync("docker",argv,{shell:false,encoding:"utf8",timeout:ms,maxBuffer:524288,windowsHide:true});
  if (result.error || result.status!==0) throw new Error("Docker operation failed; verify local Engine and CLI permissions.");
  return result.stdout.trim();
}
function context() {
  if (process.env.DOCKER_HOST && !isLocalEndpoint(process.env.DOCKER_HOST)) throw new Error("Remote DOCKER_HOST endpoints are not supported.");
  const name=docker(["context","show"]);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(name)) throw new Error("Unsupported Docker context.");
  let address;
  try { address=JSON.parse(docker(["context","inspect",name,"--format","{{json .Endpoints.docker.Host}}"])); }
  catch { throw new Error("Cannot inspect Docker context endpoint."); }
  if (!isLocalEndpoint(address)) throw new Error("Only local Unix sockets and Windows named pipes are permitted.");
  return name;
}
function inspect(pre,id) {
  let item;
  try { item=JSON.parse(docker([...pre,"container","inspect","--format","{{json .}}",id])); }
  catch { throw new Error("Unable to inspect the requested container."); }
  if (item?.Id!==id) throw new Error("Docker returned a different container ID.");
  return item;
}
function audit(entry) {
  const dir=join(homedir(),".eternyx");
  mkdirSync(dir,{recursive:true,mode:0o700});
  const p=join(dir,"docker-operator-audit.jsonl");
  const flags=constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW || 0);
  const fd=openSync(p,flags,0o600);
  try {writeSync(fd,JSON.stringify({timestamp:new Date().toISOString(),...entry})+"\n");}
  finally {closeSync(fd);}
}
const output=(value)=>process.stdout.write(JSON.stringify(value,null,2)+"\n");
function main(){
  const cmd=parseOperatorArgs(process.argv.slice(2));
  if(cmd.action==="help"){process.stdout.write(help+"\n");return;}
  const current=context(), pre=["--context",current];
  if(cmd.action==="list") return output({source:"live-docker",context:current,containers:safeList(jsonRows(docker([...pre,"container","ls","--all","--format","{{json .}}"])))});
  if(cmd.action==="images") return output({source:"live-docker",context:current,images:safeImages(jsonRows(docker([...pre,"image","ls","--format","{{json .}}"])))});
  if(cmd.action==="stats") return output({source:"live-docker",context:current,stats:safeStats(jsonRows(docker([...pre,"stats","--no-stream","--format","{{json .}}",cmd.id]),1))});
  if(cmd.action==="logs"){
    process.stderr.write("Warning: container logs can contain secrets. Keep output private.\n");
    return process.stdout.write(docker([...pre,"container","logs","--timestamps","--tail","50",cmd.id])+"\n");
  }
  const item=inspect(pre,cmd.id);
  if(cmd.action==="inspect") return output({source:"live-docker",context:current,container:safeInspect(item)});
  const target=verifyManagedTarget(item,cmd.id);
  if(!cmd.confirmed) return output({outcome:"preview-only",context:current,action:cmd.action,target,note:"Re-run with --confirm and the identical complete container ID."});
  // Abort before any mutation if an audit record cannot be recorded.
  audit({context:current,action:cmd.action,id:cmd.id,outcome:"requested"});
  try{
    docker([...pre,"container",cmd.action,cmd.id],20000);
    audit({context:current,action:cmd.action,id:cmd.id,outcome:"completed"});
    return output({outcome:"completed",action:cmd.action,id:cmd.id});
  }catch(err){
    audit({context:current,action:cmd.action,id:cmd.id,outcome:"failed"});
    throw err;
  }
}
try{ main(); }catch(err){process.stderr.write((err instanceof Error?err.message:"Docker operator failed")+"\n");process.exitCode=1;}
