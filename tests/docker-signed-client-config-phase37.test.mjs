import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync,lstatSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 validateSignedDockerConfigContents,
 validateSignedDockerClientConfigPins,
 verifyPinnedDockerClientConfig,
 validatePinnedDockerCliCommand
} from "../src/lib/dockerSignedClientConfigGate.mjs";

const C="eternyx-phase37-ci";
const ENDPOINT="unix:///run/user/1001/docker.sock";
const TARGET="a".repeat(64);
const sha=x=>createHash("sha256").update(x).digest("hex");
const metaId=sha(C);
const cleanConfig=()=>({currentContext:C});
const cleanMeta=()=>({
 Name:C,Metadata:{},Endpoints:{docker:{Host:ENDPOINT,SkipTLSVerify:false}}
});
const json=x=>Buffer.from(JSON.stringify(x)+"\n");
const parsed=(c=cleanConfig(),m=cleanMeta())=>
 validateSignedDockerConfigContents({
  configRaw:json(c),metaRaw:json(m),context:C,endpoint:ENDPOINT
 });
const pins=dir=>({
 ETERNYX_DOCKER_AGENT_CONTEXT:C,
 ETERNYX_DOCKER_AGENT_ENDPOINT:ENDPOINT,
 ETERNYX_DOCKER_AGENT_DAEMON_SHA256:"1".repeat(64),
 ETERNYX_DOCKER_AGENT_IMAGE_SHA256:"2".repeat(64),
 ETERNYX_DOCKER_AGENT_POLICY_SHA256:"3".repeat(64),
 ETERNYX_DOCKER_AGENT_CONFIG_DIR:dir,
 ETERNYX_DOCKER_AGENT_CONFIG_SHA256:parsed().manifestSha256
});

test("one minimal rootless Unix-socket context yields a deterministic two-file manifest",()=>{
 const a=parsed(),b=parsed();
 assert.equal(a.context,C);
 assert.equal(a.endpoint,ENDPOINT);
 assert.equal(a.metaRelative,"contexts/meta/"+metaId+"/meta.json");
 assert.match(a.manifestSha256,/^[a-f0-9]{64}$/);
 assert.equal(a.manifestSha256,b.manifestSha256);
 assert.equal(a.credentialHelpersAbsent,true);
 assert.equal(a.pluginConfigAbsent,true);
 assert.equal(a.tlsMaterialAbsent,true);
 assert.equal(a.onlyOneLocalContext,true);
});
test("operator config dir and manifest hash must be independently provided canonical values",()=>{
 const env=pins("/etc/eternyx-ci-phase37-agent");
 assert.equal(validateSignedDockerClientConfigPins(env).dir,env.ETERNYX_DOCKER_AGENT_CONFIG_DIR);
 for(const mutation of [
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"~/.docker"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"relative"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/tmp/../etc/cfg"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/etc//docker"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/etc/./docker"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/etc/docker/"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/etc/docker%2f"},
  {ETERNYX_DOCKER_AGENT_CONFIG_DIR:"/"},
  {ETERNYX_DOCKER_AGENT_CONFIG_SHA256:"a".repeat(63)},
  {ETERNYX_DOCKER_AGENT_CONFIG_SHA256:"A".repeat(64)},
  {ETERNYX_DOCKER_AGENT_CONFIG_SHA256:"wrong"},
  {ETERNYX_DOCKER_AGENT_CONTEXT:"remote/host"},
  {ETERNYX_DOCKER_AGENT_ENDPOINT:"tcp://127.0.0.1:2375"},
  {DOCKER_CONFIG:"/tmp/adversarial-context"},
  {DOCKER_HOST:"unix:///tmp/unreviewed.sock"}
 ])assert.throws(()=>validateSignedDockerClientConfigPins({...env,...mutation}),undefined,
  JSON.stringify(mutation));
});
test("credential helpers, auth material, plugins and additional current contexts all fail closed",()=>{
 for(const patch of [
  {auths:{}},{auths:{"registry.invalid":{auth:"secret"}}},
  {credsStore:"desktop"},{credHelpers:{"registry.invalid":"evil"}},
  {plugins:{"scan":{"hooks":"anything"}}},
  {currentContext:"default"},{currentContext:"remote"},
  {currentContext:"other",auths:{}},
  {experimental:"enabled"},{proxies:{}},
  {stackOrchestrator:"swarm"}
 ])assert.throws(()=>parsed({...cleanConfig(),...patch}),/wrong context|forbidden/);
});
test("only exact named local context meta with empty metadata, one Unix socket and no TLS is eligible",()=>{
 const original=cleanMeta();
 const alterations=[
  {Name:"default"},
  {Name:"other"},
  {Metadata:{description:"unexpected"}},
  {Endpoints:{docker:{Host:"tcp://127.0.0.1:2375",SkipTLSVerify:false}}},
  {Endpoints:{docker:{Host:"ssh://user@host",SkipTLSVerify:false}}},
  {Endpoints:{docker:{Host:ENDPOINT,SkipTLSVerify:true}}},
  {Endpoints:{docker:{Host:ENDPOINT}}},
  {Endpoints:{docker:{Host:ENDPOINT,SkipTLSVerify:false},evil:{Host:"ssh://"}}},
  {TLSMaterial:{}},{Storage:{}},
  {Plugins:{}},
  {Endpoints:{}}
 ];
 for(const patch of alterations){
  assert.throws(()=>parsed(cleanConfig(),{...original,...patch}),/different endpoint|unexpected metadata/,
   JSON.stringify(patch));
 }
});
test("noncanonical JSON, duplicate keys, BOM, whitespace, truncation, and malformed text are denied",()=>{
 const raw=json(cleanMeta());
 const unsafeConfig=[
  Buffer.from('{"currentContext":"'+C+'","currentContext":"'+C+'"}\n'),
  Buffer.from('{"currentContext":"'+C+'"}'),
  Buffer.from(' {\n  "currentContext":"'+C+'"\n}\n'),
  Buffer.from("\ufeff"+JSON.stringify(cleanConfig())+"\n"),
  Buffer.from("not-json\n"),
  Buffer.alloc(65537,65),
  Buffer.from("[]\n"),
  Buffer.from('{"currentContext":null}\n'),
  Buffer.from(JSON.stringify(cleanConfig())+"\n\n")
 ];
 for(const configRaw of unsafeConfig)
  assert.throws(()=>validateSignedDockerConfigContents({
   configRaw,metaRaw:raw,context:C,endpoint:ENDPOINT
  }));
});
test("changing even an allowed context byte changes the independently pinned manifest",()=>{
 const a=parsed(),b=parsed({...cleanConfig(),currentContext:C+"2"},
  {...cleanMeta(),Name:C+"2"});
 // Use the alternate name as the approved *local test* context so both pass.
 // The production pin still must be updated out of band.
 assert.notEqual(a.manifestSha256,b.manifestSha256);
});
test("exact signed-agent grammar permits only authorized context inspection and lifecycle calls",()=>{
 const approved={context:C},allowed=[
  ["context","show"],
  ["context","inspect",C,"--format","{{json .Endpoints.docker.Host}}"],
  ["--context",C,"info","--format","{{json .}}"],
  ["--context",C,"container","inspect","--format","{{json .}}",TARGET],
  ["--context",C,"container","start",TARGET],
  ["--context",C,"container","stop",TARGET],
  ["--context",C,"container","restart",TARGET]
 ];
 for(const args of allowed)
  assert.equal(validatePinnedDockerCliCommand(args,approved),true,JSON.stringify(args));
});
test("malicious context, flags, targets, shells, plugins, and alternative format strings are denied",()=>{
 const approved={context:C},bad=[
  [],["--host","tcp://127.0.0.1:2375","info"],
  ["--config","/tmp/evil","context","show"],
  ["context","use",C],["context","create","evil"],
  ["context","inspect","default","--format","{{json .Endpoints.docker.Host}}"],
  ["context","inspect",C,"--format","{{json .}}"],
  ["--context","default","info","--format","{{json .}}"],
  ["--context",C,"info","--format","{{.SecurityOptions}}"],
  ["--context",C,"container","run","--privileged","alpine"],
  ["--context",C,"container","exec",TARGET,"sh"],
  ["--context",C,"container","inspect","--format","{{json .}}","abcd"],
  ["--context",C,"container","start","-it",TARGET],
  ["--context",C,"container","start","f".repeat(63)],
  ["--context",C,"container","stop",TARGET,"--time","0"],
  ["--context",C,"container","stop","b".repeat(64),"; rm -rf /"],
  ["--context",C,"plugin","install","evil"],
  ["--context",C,"image","pull","latest"],
  ["compose","up"],["--debug","version"],
  ["context","show","extra"]
 ];
 for(const args of bad)
  assert.throws(()=>validatePinnedDockerCliCommand(args,approved),/outside signed-agent allowlist/,
   JSON.stringify(args));
 for(const args of [null,[],{},["context",null],["context","\n"],["context",1]])
  assert.throws(()=>validatePinnedDockerCliCommand(args,approved));
});
test("ordinary user-owned ~/.docker-style tree cannot be accepted even if contents and manifest match",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-client-config-denied-"));
 try{
  const meta=join(dir,"contexts","meta",metaId);
  mkdirSync(meta,{recursive:true});
  writeFileSync(join(dir,"config.json"),json(cleanConfig()),{mode:0o600});
  writeFileSync(join(meta,"meta.json"),json(cleanMeta()),{mode:0o600});
  assert.throws(()=>verifyPinnedDockerClientConfig(pins(dir)),/root-owned/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("root-owned read-only CI fixture exercises actual full double-pass filesystem admission",()=>{
 // The dedicated workflow provisions exactly two inert root-owned JSON files
 // under /etc; ordinary npm test runs (without privileged fixture) remain safe.
 const path=process.env.ETERNYX_PHASE37_ROOT_FIXTURE;
 if(!path)return;
 const approved=verifyPinnedDockerClientConfig(pins(path));
 assert.equal(approved.dir,path);
 assert.equal(approved.sha256,parsed().manifestSha256);
 assert.equal(approved.completeTreeVerified,true);
 assert.equal(approved.rootOwned,true);
 assert.equal(approved.immutableToUnprivilegedUser,true);
 const st=lstatSync(join(path,"config.json"));
 assert.equal(st.uid,0);
 assert.equal((st.mode&0o022),0);
 assert.equal(readFileSync(join(path,"config.json"),"utf8"),
   JSON.stringify(cleanConfig())+"\n");
});
test("real agent uses independently pinned --config for EVERY verified ELF command",()=>{
 const agent=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const start=agent.indexOf("function docker(args,ms=8000){");
 const end=agent.indexOf("function localContext(){",start);
 const body=agent.slice(start,end);
 assert.ok(start>=0&&end>start);
 const check=body.indexOf("verifyPinnedDockerClientConfig(process.env)");
 const grammar=body.indexOf("validatePinnedDockerCliCommand(args,clientConfig)");
 const child=body.indexOf("withPinnedDockerCliFile(process.env,cli=>spawnSync(");
 const flag=body.indexOf('cli.execPath,["--config",clientConfig.dir,...args]');
 assert.ok(check>=0&&check<grammar&&grammar<child&&child<flag);
 assert.match(body,/stdio:\["ignore","pipe","pipe",cli\.fd\]/);
 assert.match(body,/shell:false/);
 assert.match(body,/env:childEnv/);
 assert.doesNotMatch(body,/spawnSync\("docker"/);
 assert.doesNotMatch(body,/spawnSync\(cli\.path/);
 const ctx=agent.indexOf("function localContext(){");
 assert.ok(agent.indexOf("verifyPinnedDockerClientConfig(process.env)",ctx)<
  agent.indexOf('const name=docker(["context","show"])',ctx));
 const receiptStart=agent.indexOf("if(retryReceipt){");
 const firstClaim=agent.indexOf('const polled=await send("claim")',receiptStart);
 assert.ok(ctx<receiptStart&&receiptStart<firstClaim);
 assert.match(agent,/const context=executeLab\?localContext\(\):null/);
 assert.match(agent,/if\(!disposition\.outcome\)\{/);
});
