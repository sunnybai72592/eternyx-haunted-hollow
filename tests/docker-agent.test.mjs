import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDockerAgentServer } from "../src/lib/dockerAgentService.mjs";
import { readAgentToken, readAgentPort } from "../src/lib/dockerAgentConfig.mjs";

const TOKEN = "a".repeat(64);
const ID = "b".repeat(64);
async function fixture(task) {
  const calls = [];
  const server = createDockerAgentServer({token:TOKEN, runDocker: async args => {
    calls.push(args);
    if (args[0] === "container" && args[1] === "ls") return JSON.stringify({ID:"abc", Names:"web", Image:"node", State:"running", Status:"Up", SECRET:"hidden"});
    if (args[0] === "image") return JSON.stringify({ID:"sha256:abc", Repository:"node", Tag:"22", Size:"95MB",SECRET:"hidden"});
    if (args[0] === "stats") return JSON.stringify({ ID:"abc", CPUPerc:"3%", MemUsage:"8MB", SECRET:"hidden" });
    if (args[0] === "container" && args[1] === "inspect") return JSON.stringify({Id:ID,Name:"/web",Config:{Image:"node",Env:["SECRET=hidden"]},HostConfig:{ReadonlyRootfs:true},State:{Status:"running"}});
    throw new Error("Unsupported");
  }});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const url = "http://127.0.0.1:"+server.address().port;
  const get = (path,options={}) => fetch(url+path,{...options,headers:{Authorization:"Bearer "+TOKEN,...(options.headers||{})}});
  try { await task({get,url,calls}); } finally { await new Promise(resolve=>server.close(resolve)); }
}
test("reject unauthenticated requests, browser origins and mutation methods",async()=>{
  await fixture(async ({get,url,calls})=>{
    assert.equal((await fetch(url+"/v1/containers")).status,401);
    assert.equal((await get("/v1/containers",{headers:{Origin:"https://untrusted.invalid"}})).status,403);
    assert.equal((await get("/v1/containers",{method:"POST"})).status,405);
    assert.equal((await get("/v1/containers/"+ID+"/logs")).status,404);
    assert.equal((await get("/v1/containers/short")).status,404);
    assert.equal((await get("/v1/containers?x=1")).status,404);
    assert.equal(calls.length,0);
  });
});
test("real Docker invocation contract returns sanitized bounded observations",async()=>{
  await fixture(async({get,calls})=>{
    let response=await get("/v1/health");
    assert.equal(response.status,200);
    assert.equal((await response.json()).mode,"read-only");
    response=await get("/v1/containers");
    assert.equal(response.status,200);
    const list=await response.json();
    assert.equal(list.containers[0].name,"web");
    assert.doesNotMatch(JSON.stringify(list),/SECRET|hidden/);
    response=await get("/v1/images");
    assert.equal((await response.json()).images[0].repository,"node");
    response=await get("/v1/containers/"+ID);
    const one=await response.json();
    assert.equal(one.container.name,"/web");
    assert.doesNotMatch(JSON.stringify(one),/SECRET|hidden/);
    response=await get("/v1/containers/"+ID+"/stats");
    assert.equal((await response.json()).stats[0].cpu,"3%");
    assert.equal(calls.length,4);
  });
});
test("failed CLI response does not leak internal paths or secrets",async()=>{
  const server=createDockerAgentServer({token:TOKEN,runDocker:()=>{throw new Error("PASSWORD=private /home/root/.docker");}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const response=await fetch("http://127.0.0.1:"+server.address().port+"/v1/images",{headers:{Authorization:"Bearer "+TOKEN}});
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/PASSWORD|root|private/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test("agent refuses weak credentials and invalid port",()=>{
  assert.throws(()=>createDockerAgentServer({token:"short",runDocker:()=>""}));
  assert.equal(readAgentPort(),43871);
  assert.equal(readAgentPort("43872"),43872);
  for(const port of ["0","80","65536","-1","abc"]) assert.throws(()=>readAgentPort(port));
});
test("token file enforces owner, mode, size and rejects symlinks",()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-agent-token-"));
  const path=join(dir,"token");
  try{
    writeFileSync(path,TOKEN+"\n",{mode:0o600});
    chmodSync(path,0o600);
    assert.equal(readAgentToken(path),TOKEN);
    if(process.platform!=="win32"){
      chmodSync(path,0o644);
      assert.throws(()=>readAgentToken(path),/0600/);
      chmodSync(path,0o600);
    }
    writeFileSync(path,"wrong",{mode:0o600});
    assert.throws(()=>readAgentToken(path),/random hex/);
    if(process.platform!=="win32"){
      const link=join(dir,"symlink");
      symlinkSync(path,link);
      assert.throws(()=>readAgentToken(link),/regular file/);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
