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
