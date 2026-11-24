#!/usr/bin/env node
// Real operator-host read-only preflight for the signed ETERNYX Docker agent.
// Never contacts Supabase, mutates Docker, claims work, signs receipts,
// clears locks or changes deployment flags. Not an isolation attestation.
import {spawnSync} from "node:child_process";
import {homedir} from "node:os";
import {lstatSync} from "node:fs";
import {createHash} from "node:crypto";
import {validateSignedAgentEnginePins,validateSignedAgentSocket}
 from "../src/lib/dockerSignedAgentEngineGate.mjs";
import {verifyPinnedDockerCliExecutable,withPinnedDockerCliFile,signedDockerCliEnvironment}
 from "../src/lib/dockerSignedCliExecutableGate.mjs";
import {verifyPinnedDockerClientConfig,validatePinnedDockerCliCommand}
 from "../src/lib/dockerSignedClientConfigGate.mjs";
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {evaluateSignedDockerHostReadOnly}
 from "../src/lib/dockerSignedHostReadOnlyPreflight.mjs";

const FULL=/^[a-f0-9]{64}$/;
const OPS=new Set(["start","stop","restart"]);
const digest=x=>createHash("sha256").update(x).digest("hex");
function readOnlyDocker(args,pinned){
 // Absolutely no arbitrary shell, flags or mutation grammar. This
 // allowlist is stricter than the signed execution agent's command gate.
 const c=pinned.context;
 const exact=expected=>args.length===expected.length&&
  args.every((x,i)=>x===expected[i]);
 const allowed=exact(["context","show"])||
  exact(["context","inspect",c,"--format","{{json .Endpoints.docker.Host}}"])||
  exact(["--context",c,"info","--format","{{json .}}"])||
  (args.length===7&&args.slice(0,6).every((x,i)=>
    x===["--context",c,"container","inspect","--format","{{json .}}"][i])&&
    FULL.test(args[6]));
 if(!allowed)throw Error("Read-only host preflight forbids Docker mutation or extra commands.");
 // Revalidate full root-owned config and independently pinned ELF before each
 // read-only Docker subprocess; the executable stays open through child fd3.
 const config=verifyPinnedDockerClientConfig(process.env);
 if(config.context!==c||config.endpoint!==pinned.host)
  throw Error("Root-owned Docker client context changed before read-only observation.");
 validatePinnedDockerCliCommand(args,config);
 const safeEnv=signedDockerCliEnvironment(homedir());
 const r=withPinnedDockerCliFile(process.env,cli=>spawnSync(
  cli.execPath,["--config",config.dir,...args],{
   shell:false,encoding:"utf8",timeout:8000,maxBuffer:524288,
   windowsHide:true,env:safeEnv,
   stdio:["ignore","pipe","pipe",cli.fd]
  }));
 if(r.error||r.status!==0||typeof r.stdout!=="string"||r.stdout.length>524288)
  throw Error("Read-only host preflight CLI observation unavailable.");
 return r.stdout.trim();
}
function json(text){
 if(typeof text!=="string"||text.length===0||text.length>524288)
  throw Error("Missing or oversized read-only Docker observation.");
 let data;
 try{data=JSON.parse(text);}
 catch{throw Error("Non-JSON signed Docker host observation refused.");}
 if(!data||typeof data!=="object"||Array.isArray(data))
  throw Error("Docker host observation is not a JSON object.");
 return data;
}
function observe(pins,id){
 const context=readOnlyDocker(["context","show"],pins);
 if(context!==pins.context)
  throw Error("Read-only Docker current context differs from signed pin.");
 let endpoint;
 try{endpoint=JSON.parse(readOnlyDocker([
  "context","inspect",context,"--format","{{json .Endpoints.docker.Host}}"
 ],pins));}
 catch{throw Error("Read-only Docker context endpoint could not be verified.");}
 return {
  context,endpoint,
  info:json(readOnlyDocker(["--context",context,"info","--format","{{json .}}"],pins)),
  target:json(readOnlyDocker([
   "--context",context,"container","inspect","--format","{{json .}}",id
  ],pins))
 };
}
function main(){
 const args=process.argv.slice(2);
 if(args.length!==3||args[0]!=="--read-only"||
    !FULL.test(args[1]||"")||!OPS.has(args[2]))
  throw Error("Usage: docker-lab-host-preflight.mjs --read-only FULL_CONTAINER_ID start|stop|restart");
 if(process.platform!=="linux"||typeof process.getuid!=="function"||
    process.getuid()===0||process.env.CI==="true"||
    process.env.GITHUB_ACTIONS==="true")
  throw Error("Read-only host acceptance requires a non-root, separately approved Linux operator outside CI.");
 // This command MUST NOT be run on a host with execution switches enabled.
 if(process.env.ETERNYX_REMOTE_LAB_ENABLED==="true"||
    process.env.DOCKER_REMOTE_LAB_ENABLED==="true")
  throw Error("Disable all lab execution flags before read-only host preflight.");
 const [_,containerId,operation]=args;
 const pins=validateSignedAgentEnginePins(process.env);
 const configBefore=verifyPinnedDockerClientConfig(process.env);
 const cliBefore=verifyPinnedDockerCliExecutable(process.env);
 signedDockerCliEnvironment(homedir());
 const socketBefore=lstatSync(pins.socketPath);
 validateSignedAgentSocket(socketBefore,process.getuid());
 const inventoryBefore=auditSignedAgentRecoveryDirectory();
 const first=observe(pins,containerId);
 const second=observe(pins,containerId);
 const socketAfter=lstatSync(pins.socketPath);
 validateSignedAgentSocket(socketAfter,process.getuid());
 if(socketBefore.dev!==socketAfter.dev||
    socketBefore.ino!==socketAfter.ino||
    socketBefore.uid!==socketAfter.uid||
    socketBefore.mode!==socketAfter.mode)
  throw Error("Rootless Docker Unix socket changed during read-only preflight.");
 const configAfter=verifyPinnedDockerClientConfig(process.env);
 const cliAfter=verifyPinnedDockerCliExecutable(process.env);
 if(configBefore.sha256!==configAfter.sha256||
    configBefore.dir!==configAfter.dir||
    cliBefore.sha256!==cliAfter.sha256||
    cliBefore.path!==cliAfter.path)
  throw Error("Independent Docker CLI or config pins changed during preflight.");
 const inventoryAfter=auditSignedAgentRecoveryDirectory();
 const report=evaluateSignedDockerHostReadOnly({
  pins,contextBefore:first.context,contextAfter:second.context,
  endpointBefore:first.endpoint,endpointAfter:second.endpoint,
  infoBefore:first.info,infoAfter:second.info,
  targetBefore:first.target,targetAfter:second.target,
  containerId,operation,
  inventoryBefore,inventoryAfter,
  cli:cliAfter,config:configAfter
 });
 // Only allowlisted SHA-256 commitments, booleans and controlled labels.
 // Never print raw inspect JSON, daemon ID, host paths, secrets or socket URI.
 process.stdout.write(JSON.stringify({
  ...report,inspectedAt:new Date().toISOString(),
  readOnlyHostEvidenceSha256:digest("ETERNYX_DOCKER_HOST_READONLY_OUTPUT_V1\n"+
    report.evidenceSha256)
 })+"\n");
}
try{main();}
catch(error){
 process.stderr.write((error instanceof Error?error.message:
  "Read-only Docker host preflight refused.")+"\n");
 process.exitCode=1;
}
