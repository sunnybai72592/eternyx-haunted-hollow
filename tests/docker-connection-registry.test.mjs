import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDockerAgentServer } from "../src/lib/dockerAgentService.mjs";
import {
  readRegistry, writeRegistry, validateRegistry, parseConnectionArgs, addConnection,
  replaceConnection, removeConnection, findConnection, queryConnection,
  makeConnectionSnapshot, MAX_DOCKER_CONNECTIONS,
} from "../src/lib/dockerConnectionRegistry.mjs";

const TOKEN="a".repeat(64);
const OTHER_TOKEN="b".repeat(64);
let dir, file, tokenPath;
const registration=(id,port)=>({id,port,tokenFile:tokenPath,registeredAt:"2026-11-22T12:00:00.000Z"});
function fixture() {
  dir=mkdtempSync(join(tmpdir(),"eternyx-connections-"));
  file=join(dir,"docker-connections.json");
  tokenPath=join(dir,"agent-token");
  writeFileSync(tokenPath,TOKEN+"\n",{mode:0o600});
  chmodSync(tokenPath,0o600);
}
test("registry stores metadata only and uses private atomic files",()=>{
  fixture();
  try {
    const one=registration("lab-east",43872);
    assert.deepEqual(readRegistry(file),[]);
    writeRegistry([one],file);
    const result=readRegistry(file);
    assert.equal(result[0].id,"lab-east");
    assert.equal(result[0].port,43872);
    const contents=readFileSync(file,"utf8");
    assert.doesNotMatch(contents,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    assert.throws(()=>addConnection(result,one),/already registered/);
    assert.throws(()=>addConnection(result,registration("lab-west",43872)),/already registered/);
    const updated=replaceConnection(result,{...one,port:43873});
    assert.equal(updated[0].port,43873);
    assert.equal(removeConnection(updated,"lab-east").length,0);
    assert.throws(()=>findConnection(result,"does-not-exist"),/not found/);
    if(process.platform!=="win32"){
      chmodSync(file,0o644);
      assert.throws(()=>readRegistry(file),/0600/);
      chmodSync(file,0o600);
    }
    assert.throws(()=>validateRegistry({schemaVersion:1,connections:Array.from({length:MAX_DOCKER_CONNECTIONS+1},(_,i)=>registration("lab-"+i,44000+i))}),/oversized/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test("reject invalid identifiers, non-private token files and symlink registry",()=>{
  fixture();
  try{
    for(const bad of ["../root","UPPER","a b","1leading","x".repeat(41)]){
      assert.throws(()=>parseConnectionArgs(bad,"43872",tokenPath));
    }
    assert.throws(()=>parseConnectionArgs("valid","43872","relative-token"));
    const good=parseConnectionArgs("valid","43872",tokenPath);
    assert.equal(good.port,43872);
    if(process.platform!=="win32"){
      chmodSync(tokenPath,0o644);
      assert.throws(()=>parseConnectionArgs("valid","43872",tokenPath),/0600/);
      chmodSync(tokenPath,0o600);
      const symlink=join(dir,"registry-symlink");
      writeRegistry([registration("lab",43872)],file);
      symlinkSync(file,symlink);
      assert.throws(()=>readRegistry(symlink),/Invalid Docker connection registry file/);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test("authenticated agent probes return real health, inventory and imports",async()=>{
  fixture();
  const server=createDockerAgentServer({token:TOKEN,runDocker: async (args)=>{
    if(args[0]==="container" && args[1]==="ls") return JSON.stringify({ID:"abc",Names:"web",Image:"node:22",State:"running",Status:"Up",SECRET:"hidden"});
    if(args[0]==="image") return JSON.stringify({ID:"sha256:abc",Repository:"node",Tag:"22",Size:"100MB",SECRET:"hidden"});
    throw new Error("unrecognized");
  }});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  try{
    const entry=registration("test-server",server.address().port);
    assert.equal((await queryConnection(entry)).state,"agent-reachable");
    const list=await queryConnection(entry,"list");
    assert.equal(list.containers[0].name,"web");
    const snapshot=makeConnectionSnapshot(list);
    assert.equal(snapshot.docker.containers.length,1);
    assert.equal(snapshot.docker.containers[0].name,"web");
    assert.doesNotMatch(JSON.stringify(snapshot),/SECRET|hidden/);
    const images=await queryConnection(entry,"images");
    assert.equal(images.images[0].repository,"node");
    assert.throws(()=>makeConnectionSnapshot({}),/Invalid/);
    await assert.rejects(()=>queryConnection(entry,"logs"),/Unsupported read-only/);
    writeFileSync(tokenPath,OTHER_TOKEN+"\n",{mode:0o600});
    await assert.rejects(()=>queryConnection(entry),/HTTP 401/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    rmSync(dir,{recursive:true,force:true});
  }
});
test("cannot register fake disconnected endpoints or unknown operations",async()=>{
  fixture();
  try{
    const entry=registration("offline",45671);
    await assert.rejects(()=>queryConnection(entry),/fetch failed|aborted|timed out|unavailable/i);
    assert.deepEqual(readRegistry(file),[]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
