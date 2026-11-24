import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,copyFileSync,readFileSync,writeFileSync,
  lstatSync,fstatSync,openSync,closeSync,renameSync,constants} from "node:fs";
import {tmpdir,homedir} from "node:os";
import {join} from "node:path";
import {
 withPinnedDockerCliFile,verifyPinnedDockerCliExecutable,
 signedDockerCliEnvironment
} from "../src/lib/dockerSignedCliExecutableGate.mjs";

const CLI=["/usr/bin/git","/usr/bin/bash","/bin/bash","/usr/bin/env"].find(path=>{
 try{
  const st=lstatSync(path);
  return st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&
    (st.mode&0o022)===0&&(st.mode&0o111)!==0&&
    readFileSync(path).subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46]));
 }catch{return false;}
});
if(!CLI)throw Error("A root-owned, real ELF fixture is required in the offline Linux runner.");
const pin=()=>({
 ETERNYX_DOCKER_AGENT_CLI_PATH:CLI,
 ETERNYX_DOCKER_AGENT_CLI_SHA256:createHash("sha256").update(readFileSync(CLI)).digest("hex")
});
function byFd(args=["--version"]){
 return withPinnedDockerCliFile(pin(),cli=>{
  const actual=fstatSync(cli.fd),named=lstatSync(CLI);
  assert.equal(actual.dev,named.dev);
  assert.equal(actual.ino,named.ino);
  assert.equal(cli.execPath,"/proc/self/fd/3");
  assert.equal(cli.rootOwned,true);
  assert.equal(cli.hashVerified,true);
  assert.equal(cli.independentlyApprovedHost,false);
  const r=spawnSync(cli.execPath,args,{
   shell:false,encoding:"utf8",timeout:5000,maxBuffer:200000,
   env:signedDockerCliEnvironment(homedir()),
   stdio:["ignore","pipe","pipe",cli.fd]
  });
  assert.equal(r.error,undefined,r.stderr||r.error?.message);
  return r;
 });
}
test("root-owned ELF executes from the EXACT hash-verified open descriptor on Linux",()=>{
 assert.equal(process.platform,"linux");
 const r=byFd();
 assert.equal(r.status,0,r.stderr);
 assert.ok(r.stdout.length>1);
});
test("invalid independent hash prevents even entering the executable callback",()=>{
 let invoked=0;
 const bad={...pin(),ETERNYX_DOCKER_AGENT_CLI_SHA256:"0".repeat(64)};
 assert.throws(()=>withPinnedDockerCliFile(bad,()=>{
  invoked++;return null;
 }),/SHA-256 differs/);
 assert.equal(invoked,0);
});
test("unpinned executable path cannot be used as fallback if file is missing",()=>{
 let invoked=false;
 const missing={...pin(),ETERNYX_DOCKER_AGENT_CLI_PATH:"/usr/bin/eternyx-absent-cli-"+process.pid};
 assert.throws(()=>withPinnedDockerCliFile(missing,()=>{
  invoked=true;return null;
 }));
 assert.equal(invoked,false);
});
test("a successfully verified ELF returns an opaque read-only summary without a live fd",()=>{
 const v=verifyPinnedDockerCliExecutable(pin());
 assert.equal(Object.hasOwn(v,"fd"),false);
 assert.equal(Object.hasOwn(v,"execPath"),false);
 assert.equal(v.path,CLI);
 assert.equal(v.hashVerified,true);
 assert.equal(Object.isFrozen(v),true);
});
test("descriptor remains valid inside callback and is closed after successful operation",()=>{
 let fd=-1;
 const value=withPinnedDockerCliFile(pin(),cli=>{
  fd=cli.fd;assert.equal(fstatSync(fd).isFile(),true);
  assert.equal(Object.isFrozen(cli),true);
  return "verified";
 });
 assert.equal(value,"verified");
 assert.throws(()=>fstatSync(fd),{code:"EBADF"});
});
test("descriptor is closed even if subprocess handling throws",()=>{
 let fd=-1;
 assert.throws(()=>withPinnedDockerCliFile(pin(),cli=>{
  fd=cli.fd;
  throw Error("synthetic subprocess refusal");
 }),/synthetic subprocess refusal/);
 assert.throws(()=>fstatSync(fd),{code:"EBADF"});
});
test("async descriptor escape is rejected and original fd is immediately closed",()=>{
 let fd=-1;
 assert.throws(()=>withPinnedDockerCliFile(pin(),cli=>{
  fd=cli.fd;return Promise.resolve("untrusted");
 }),/synchronous call/);
 assert.throws(()=>fstatSync(fd),{code:"EBADF"});
});
test("non-function callback fails closed before touching the binary",()=>{
 for(const callback of [undefined,null,"execute",{},23])
  assert.throws(()=>withPinnedDockerCliFile(pin(),callback),/synchronous/);
});
test("a renamed and replaced pathname cannot change an inherited inode's executed ELF",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-fd-pinning-"));
 let fd=-1;
 try{
  const original=join(dir,"original");
  const retained=join(dir,"retained");
  copyFileSync(CLI,original);
  fd=openSync(original,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  const old=fstatSync(fd);
  renameSync(original,retained);
  writeFileSync(original,"not an ELF binary",{mode:0o700});
  assert.notEqual(lstatSync(original).ino,old.ino);
  const r=spawnSync("/proc/self/fd/3",["--version"],{
   shell:false,encoding:"utf8",timeout:5000,maxBuffer:200000,
   env:signedDockerCliEnvironment(homedir()),
   stdio:["ignore","pipe","pipe",fd]
  });
  assert.equal(r.status,0,r.stderr||r.error?.message);
  assert.ok(r.stdout.length>1);
  assert.equal(fstatSync(fd).ino,old.ino);
 }finally{
  if(fd>=0)closeSync(fd);
  rmSync(dir,{recursive:true,force:true});
 }
});
test("the verified ELF cannot inherit parent secrets, arbitrary loader overrides or pipes",()=>{
 const env=signedDockerCliEnvironment(homedir());
 assert.deepEqual(Object.keys(env).sort(),["HOME","LANG","LC_ALL","PATH"]);
 for(const key of ["LD_PRELOAD","LD_LIBRARY_PATH","LD_AUDIT","DOCKER_HOST",
  "DOCKER_CONTEXT","DOCKER_CONFIG","XDG_CONFIG_HOME","HTTP_PROXY",
  "HTTPS_PROXY","ALL_PROXY","NODE_OPTIONS","GITHUB_TOKEN","SUPABASE_SERVICE_ROLE_KEY"])
  assert.equal(Object.hasOwn(env,key),false,key);
});
test("the live agent always executes /proc fd3 under a bounded synchronous call",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 const start=s.indexOf("function docker(args,ms=8000){");
 const end=s.indexOf("function localContext(){",start);
 const fn=s.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(fn,/withPinnedDockerCliFile\(process\.env,cli=>spawnSync\(/);
 assert.match(fn,/cli\.execPath,\["--config",clientConfig\.dir,\.\.\.args\]/);
 assert.match(fn,/verifyPinnedDockerClientConfig\(process\.env\)/);
 assert.match(fn,/validatePinnedDockerCliCommand\(args,clientConfig\)/);
 assert.match(fn,/stdio:\["ignore","pipe","pipe",cli\.fd\]/);
 assert.match(fn,/const childEnv=signedDockerCliEnvironment\(homedir\(\)\)/);
 assert.match(fn,/shell:false/);
 assert.match(fn,/maxBuffer:524288/);
 assert.match(fn,/timeout:ms/);
 assert.match(fn,/env:childEnv/);
 assert.doesNotMatch(fn,/spawnSync\("docker"/);
 assert.doesNotMatch(fn,/spawnSync\(cli\.path/);
 assert.match(s,/const context=executeLab\?localContext\(\):null/);
 assert.match(s,/if\(!disposition\.outcome\)\{/);
});
test("the guard cannot fall back from Linux proc-fd exec to the original CLI path",()=>{
 const src=readFileSync(new URL("../src/lib/dockerSignedCliExecutableGate.mjs",import.meta.url),"utf8");
 assert.match(src,/execPath:"\/proc\/self\/fd\/3"/);
 assert.match(src,/if\(process\.platform!=="linux"\)/);
 assert.match(src,/raw\[0\]!==0x7f/);
 assert.match(src,/finally\{closeSync\(fd\);\}/);
 assert.doesNotMatch(src,/execPath:pins\.path/);
});
