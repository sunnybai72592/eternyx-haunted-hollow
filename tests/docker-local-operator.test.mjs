import test from "node:test";
import assert from "node:assert/strict";
import { parseOperatorArgs, isLocalEndpoint, jsonRows, safeList, safeImages, safeStats, safeInspect, verifyManagedTarget, MANAGED_LABEL, SCOPE_LABEL } from "../src/lib/dockerOperatorUtils.mjs";
const ID="a".repeat(64);
function lab(){
  return {Id:ID,Name:"/lab",Config:{User:"10001:10001",Image:"example@sha256:abc",Env:["PASSWORD=private"],Labels:{[MANAGED_LABEL]:"true",[SCOPE_LABEL]:"local-workbench"}},State:{Status:"exited"},Mounts:[],HostConfig:{Privileged:false,ReadonlyRootfs:true,NetworkMode:"none",Binds:[],PortBindings:{},CapAdd:[],Devices:[],DeviceRequests:[],CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],Memory:134217728,PidsLimit:64,RestartPolicy:{Name:"no"}}};
}
test("only explicit operations and exact full IDs parse",()=>{
  assert.equal(parseOperatorArgs(["list"]).action,"list");
  assert.equal(parseOperatorArgs(["stop",ID]).confirmed,false);
  assert.equal(parseOperatorArgs(["restart",ID,"--confirm",ID]).confirmed,true);
  for(const command of [["run",ID],["logs","abc"],["start",ID,"--confirm","b".repeat(64)],["images","--all"]]) assert.throws(()=>parseOperatorArgs(command));
});
test("refuse remote endpoints",()=>{
  assert.ok(isLocalEndpoint("unix:///var/run/docker.sock"));
  assert.ok(isLocalEndpoint("npipe:////./pipe/docker_engine"));
  for(const url of ["tcp://localhost:2375","ssh://example","https://remote:2376","unix://remote"]) assert.equal(isLocalEndpoint(url),false);
});
test("bounded, sanitized output",()=>{
  assert.equal(jsonRows('{"ID":"one"}\n{"ID":"two"}').length,2);
  assert.throws(()=>jsonRows("{}\n".repeat(101)));
  assert.throws(()=>jsonRows("secret"));
  assert.equal(safeList([{ID:"a",Names:"x",Token:"private"}])[0].Token,undefined);
  assert.equal(safeImages([{ID:"id",Authorization:"private"}])[0].Authorization,undefined);
  assert.equal(safeStats([{CPUPerc:"3%",Env:"PRIVATE"}])[0].Env,undefined);
  assert.equal(JSON.stringify(safeInspect(lab())).includes("PASSWORD"),false);
});
test("allow only hardened, labeled, resource bounded lab containers",()=>{
  assert.equal(verifyManagedTarget(lab(),ID).id,ID);
  const rejects= [
    x=>x.Id="b".repeat(64),
    x=>x.Config.Labels[MANAGED_LABEL]="false",
    x=>x.Config.User="0:0",
    x=>x.HostConfig.Privileged=true,
    x=>x.HostConfig.ReadonlyRootfs=false,
    x=>x.HostConfig.NetworkMode="host",
    x=>x.HostConfig.Binds=["/:/host"],
    x=>x.Mounts=[{Type:"bind"}],
    x=>x.HostConfig.PortBindings={"80/tcp":[{}]},
    x=>x.HostConfig.CapAdd=["SYS_ADMIN"],
    x=>x.HostConfig.CapDrop=[],
    x=>x.HostConfig.SecurityOpt=[],
    x=>x.HostConfig.PidsLimit=0,
    x=>x.HostConfig.Memory=0,
    x=>x.HostConfig.RestartPolicy.Name="always",
  ];
  for(const change of rejects){const item=lab();change(item);assert.throws(()=>verifyManagedTarget(item,ID),/denied/);}
});


import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("mock Docker CLI verifies real command execution, no accidental mutation, audits and remote refusal", { skip: process.platform === "win32" }, () => {
  const dir=mkdtempSync(join(tmpdir(),"eternyx-docker-"));
  const dockerPath=join(dir,"docker");
  const mock=[
    "#!/usr/bin/env node",
    "const fs=require('node:fs');",
    "let args=process.argv.slice(2);",
    "fs.appendFileSync(process.env.MOCK_DOCKER_TRACE,JSON.stringify(args)+'\\n');",
    "const output=(s)=>process.stdout.write(s+'\\n');",
    "if(args[0]==='context' && args[1]==='show') output('default');",
    "else if(args[0]==='context' && args[1]==='inspect') output(JSON.stringify(process.env.MOCK_DOCKER_ENDPOINT || 'unix:///var/run/docker.sock'));",
    "else {",
    " const a=args.slice(2);",
    " if(a[0]==='container' && a[1]==='ls') output(JSON.stringify({ID:'abc',Names:'test',Image:'alpine',Status:'Up',Secret:'do-not-print'}));",
    " else if(a[0]==='image' && a[1]==='ls') output(JSON.stringify({ID:'sha256:abc',Repository:'alpine',Tag:'3.21',Size:'8MB'}));",
    " else if(a[0]==='container' && a[1]==='inspect') output(process.env.MOCK_DOCKER_TARGET);",
    " else if(a[0]==='stats') output(JSON.stringify({ID:'abc',CPUPerc:'1%',MemUsage:'2MiB',MemPerc:'2%'}));",
    " else if(a[0]==='container' && a[1]==='logs') {output('safe-stdout');process.stderr.write('stderr-line\\n');}",
    " else if(a[0]==='container' && ['start','stop','restart'].includes(a[1])) output(a[2]);",
    " else process.exit(4);",
    "}",
  ].join("\n") + "\n";
  const cli=fileURLToPath(new URL("../scripts/docker-operator.mjs",import.meta.url));
  const env={...process.env,HOME:dir,PATH:dir+delimiter+process.env.PATH,MOCK_DOCKER_TRACE:join(dir,"docker-calls.jsonl"),MOCK_DOCKER_TARGET:JSON.stringify(lab())};
  const run=(args,custom=env)=>spawnSync(process.execPath,[cli,...args],{env:custom,encoding:"utf8",timeout:15000});
  try{
    writeFileSync(dockerPath,mock,{mode:0o755});chmodSync(dockerPath,0o755);
    const listing=run(["list"]);
    assert.equal(listing.status,0,listing.stderr);
    assert.equal(JSON.parse(listing.stdout).containers[0].name,"test");
    assert.doesNotMatch(listing.stdout,/do-not-print/);
    const images=run(["images"]);
    assert.equal(images.status,0,images.stderr);
    assert.equal(JSON.parse(images.stdout).images[0].repository,"alpine");
    const logged=run(["logs",ID]);
    assert.equal(logged.status,0,logged.stderr);
    assert.match(logged.stdout,/safe-stdout/);
    assert.match(logged.stdout,/stderr-line/);
    const preview=run(["stop",ID]);
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(JSON.parse(preview.stdout).outcome,"preview-only");
    let trace=readFileSync(env.MOCK_DOCKER_TRACE,"utf8");
    assert.doesNotMatch(trace,/"stop"/);
    const executed=run(["stop",ID,"--confirm",ID]);
    assert.equal(executed.status,0,executed.stderr);
    assert.equal(JSON.parse(executed.stdout).outcome,"completed");
    trace=readFileSync(env.MOCK_DOCKER_TRACE,"utf8");
    assert.match(trace,/"stop"/);
    const log=readFileSync(join(dir,".eternyx","docker-operator-audit.jsonl"),"utf8");
    assert.match(log,/"requested"/);
    assert.match(log,/"completed"/);
    const refused=run(["start",ID,"--confirm",ID],{...env,MOCK_DOCKER_ENDPOINT:"tcp://127.0.0.1:2375"});
    assert.notEqual(refused.status,0);
    assert.match(refused.stderr,/Only local Unix sockets/);
    const unsafe=lab(); unsafe.HostConfig.NetworkMode="host";
    const unsafeRun=run(["restart",ID,"--confirm",ID],{...env,MOCK_DOCKER_TARGET:JSON.stringify(unsafe)});
    assert.notEqual(unsafeRun.status,0);
    assert.match(unsafeRun.stderr,/lifecycle denied/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
