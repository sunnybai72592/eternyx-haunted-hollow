import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,statSync,lstatSync,mkdtempSync,rmSync,
  writeFileSync,symlinkSync,chmodSync} from "node:fs";
import {tmpdir,homedir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
 validateSignedDockerCliPins,verifyPinnedDockerCliExecutable,
 signedDockerCliEnvironment
} from "../src/lib/dockerSignedCliExecutableGate.mjs";

const CLI="/usr/bin/ls";
const pins=()=>({
 ETERNYX_DOCKER_AGENT_CLI_PATH:CLI,
 ETERNYX_DOCKER_AGENT_CLI_SHA256:
  createHash("sha256").update(readFileSync(CLI)).digest("hex")
});

test("canonical absolute CLI path and independent full SHA256 are mandatory",()=>{
 const p=pins();
 assert.equal(validateSignedDockerCliPins(p).path,CLI);
 for(const patch of [
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"docker"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"./docker"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/tmp/../usr/bin/docker"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr//bin/docker"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr/./bin/docker"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr/bin/docker/"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr/bin/docker%00"},
  {ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr/bin/\ndocker"},
  {ETERNYX_DOCKER_AGENT_CLI_SHA256:"a".repeat(63)},
  {ETERNYX_DOCKER_AGENT_CLI_SHA256:"A".repeat(64)},
  {ETERNYX_DOCKER_AGENT_CLI_SHA256:"wrong"}
 ])assert.throws(()=>validateSignedDockerCliPins({...p,...patch}));
 for(const bad of [null,{},[],{...p,ETERNYX_DOCKER_AGENT_CLI_PATH:null}])
  assert.throws(()=>validateSignedDockerCliPins(bad));
});
test("actual trusted root-owned system binary is verified by current on-disk bytes",()=>{
 const st=lstatSync(CLI);
 assert.equal(st.uid,0);
 assert.equal(st.isFile(),true);
 const accepted=verifyPinnedDockerCliExecutable(pins());
 assert.equal(accepted.path,CLI);
 assert.equal(accepted.hashVerified,true);
 assert.equal(accepted.rootOwned,true);
 assert.equal(accepted.symlinkFree,true);
 assert.equal(accepted.independentlyApprovedHost,false);
 assert.equal(accepted.sha256,pins().ETERNYX_DOCKER_AGENT_CLI_SHA256);
});
test("binary SHA256 mismatch fails closed even for an otherwise trusted root-owned executable",()=>{
 assert.throws(()=>verifyPinnedDockerCliExecutable({
  ...pins(),ETERNYX_DOCKER_AGENT_CLI_SHA256:"0".repeat(64)
 }),/SHA-256 differs/);
});
test("operator-writable or symlinked CLI path is rejected, even with its matching hash",()=>{
 const dir=mkdtempSync(join(tmpdir(),"docker-cli-pin-"));
 try{
  const src=join(dir,"docker");
  writeFileSync(src,"#!/bin/sh\nexit 0\n",{mode:0o755});
  const digest=createHash("sha256").update(readFileSync(src)).digest("hex");
  assert.throws(()=>verifyPinnedDockerCliExecutable({
   ETERNYX_DOCKER_AGENT_CLI_PATH:src,ETERNYX_DOCKER_AGENT_CLI_SHA256:digest
  }),/root-owned/);
  const alias=join(dir,"docker-alias");
  symlinkSync(CLI,alias);
  assert.throws(()=>verifyPinnedDockerCliExecutable({
   ETERNYX_DOCKER_AGENT_CLI_PATH:alias,ETERNYX_DOCKER_AGENT_CLI_SHA256:pins().ETERNYX_DOCKER_AGENT_CLI_SHA256
  }),/root-owned/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("operating system cannot be tricked into following PATH to an unpinned Docker CLI",()=>{
 const env=signedDockerCliEnvironment(homedir());
 assert.equal(env.HOME,homedir());
 assert.equal(env.PATH,"/usr/bin:/bin");
 assert.equal(env.LANG,"C");
 assert.equal(env.LC_ALL,"C");
 assert.equal(Object.keys(env).sort().join(","),"HOME,LANG,LC_ALL,PATH");
 for(const key of ["DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG",
  "LD_PRELOAD","LD_LIBRARY_PATH","LD_AUDIT","LD_DEBUG","PATH_OVERRIDE",
  "HTTPS_PROXY","HTTP_PROXY","ALL_PROXY","GIT_CONFIG_GLOBAL",
  "BASH_ENV","NODE_OPTIONS","XDG_CONFIG_HOME"]){
  assert.equal(Object.hasOwn(env,key),false,key);
 }
});
test("CLI subprocess environment refuses noncanonical or publicly writable HOME",()=>{
 for(const home of ["/tmp/../home/runner","/tmp//bad","relative","/tmp/\nabc"])
  assert.throws(()=>signedDockerCliEnvironment(home));
 const dir=mkdtempSync(join(tmpdir(),"unsafe-docker-home-"));
 try{
  if(process.platform!=="win32"){
   chmodSync(dir,0o777);
   assert.throws(()=>signedDockerCliEnvironment(dir),/non-writable/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("no Docker binary, server or network is actually invoked in the refusal harness",()=>{
 const agent=fileURLToPath(new URL("../scripts/docker-lab-agent.mjs",import.meta.url));
 const r=spawnSync(process.execPath,[
  agent,"33333333-3333-4333-8333-333333333333",
  "/not-a-key.pem","/not-a-server-pub.key","--execute-lab"
 ],{encoding:"utf8",timeout:10000,env:{
  ...process.env,PATH:"/tmp/malicious-docker-first",
  ETERNYX_REMOTE_LAB_ENABLED:"",ETERNYX_SUPABASE_URL:""
 }});
 assert.notEqual(r.status,0);
 assert.equal(r.stdout,"");
 assert.match(r.stderr,/disabled by default/);
});
test("actual signed agent verifies CLI pins before first Docker command and on each invocation",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const func=s.slice(s.indexOf("function docker(args,ms=8000){"),s.indexOf("function localContext(){"));
 assert.match(func,/const cli=verifyPinnedDockerCliExecutable\(process\.env\)/);
 assert.match(func,/const childEnv=signedDockerCliEnvironment\(homedir\(\)\)/);
 assert.match(func,/spawnSync\(cli\.path,args/);
 assert.match(func,/env:childEnv/);
 assert.doesNotMatch(func,/spawnSync\("docker"/);
 assert.doesNotMatch(func,/shell:true/);
 const preflight=s.indexOf("const pins=validateSignedAgentEnginePins(process.env)");
 const pinned=s.indexOf("verifyPinnedDockerCliExecutable(process.env)",s.indexOf("function localContext(){"));
 const firstDocker=s.indexOf('const name=docker(["context","show"])');
 assert.ok(preflight>=0&&preflight<pinned&&pinned<firstDocker);
 const firstClaim=s.indexOf('const polled=await send("claim")');
 const mutation=s.indexOf('docker(["--context",context,"container",permit.operation,permit.containerId]');
 assert.ok(firstDocker<firstClaim&&firstClaim<mutation);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.match(s,/if\(!disposition\.outcome\)\{/);
});
