// Phase 37: seal the rootless Docker CLI's *configuration inputs* as well as
// its executable. Unlike ~/.docker, this dedicated --config tree is owned by
// root, contains only one independently pinned Unix-socket context, and has
// an independently approved complete two-file SHA-256 manifest.
// Pure read-only checks; never run Docker, write config, or clear recovery.
import {createHash} from "node:crypto";
import {lstatSync,openSync,closeSync,fstatSync,readFileSync,readdirSync,constants} from "node:fs";
import {isAbsolute,join,dirname,parse} from "node:path";
import {validateSignedAgentEnginePins} from "./dockerSignedAgentEngineGate.mjs";

const FULL=/^[a-f0-9]{64}$/;
const MAX_FILE=65536;
const FLAGS=constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0);
const digest=b=>createHash("sha256").update(b).digest("hex");
const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o);
const exactly=(obj,names)=>plain(obj)&&
 Object.keys(obj).sort().join("|")===names.slice().sort().join("|");

function safeAbsolute(path){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path==="/"||path.length>512||path.includes("//")||path.includes("%")||
    path.endsWith("/")||path!==path.trim()||
    path.split("/").some(x=>x==="."||x==="..")||
    /[\u0000-\u001f\u007f]/.test(path))
  throw Error("Signed Docker --config requires a canonical absolute path.");
 return path;
}
function rootOwned(stat,directory){
 if(!stat||stat.isSymbolicLink()||
    (directory?!stat.isDirectory():!stat.isFile())||
    stat.uid!==0||(stat.mode&0o022)!==0)
  throw Error("Signed Docker client config must be root-owned, real and non-writable.");
 if(!directory&&(stat.size<1||stat.size>MAX_FILE||stat.nlink!==1))
  throw Error("Signed Docker client config file must be bounded and not hard-linked.");
 return stat;
}
function same(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&
  a.mode===b.mode&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&
  a.ctimeMs===b.ctimeMs;
}
function trustedDir(path){
 const st=rootOwned(lstatSync(path),true);
 return {dev:st.dev,ino:st.ino,mode:st.mode,uid:st.uid,
  mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs};
}
function allTrustedParents(path){
 let current=path;
 const root=parse(path).root;
 while(true){
  trustedDir(current);
  if(current===root)return;
  const upper=dirname(current);
  if(upper===current)throw Error("Docker client configuration has unsafe parent traversal.");
  current=upper;
 }
}
function readTreeDirectory(path,expected){
 const before=trustedDir(path);
 const entries=readdirSync(path).sort();
 if(entries.join("\n")!==expected.slice().sort().join("\n"))
  throw Error("Unexpected Docker CLI config file, plugin, TLS material or directory.");
 const after=trustedDir(path);
 if(!Object.keys(before).every(k=>before[k]===after[k]))
  throw Error("Docker client config directory changed during inspection.");
 return before;
}
function readTrustedFile(path){
 const before=rootOwned(lstatSync(path),false);
 const fd=openSync(path,FLAGS);
 try{
  const opened=rootOwned(fstatSync(fd),false);
  if(!same(before,opened))throw Error("Docker client config file changed before read.");
  const raw=readFileSync(fd);
  if(raw.length!==before.size||!same(before,rootOwned(fstatSync(fd),false))||
     !same(before,rootOwned(lstatSync(path),false)))
   throw Error("Docker client config file changed during read.");
  return raw;
 }finally{closeSync(fd);}
}
function canonicalJson(buffer,name){
 if(buffer.length===0||buffer.length>MAX_FILE||buffer.at(-1)!==10)
  throw Error("Incomplete signed Docker CLI "+name+" JSON.");
 let parsed;
 try{parsed=JSON.parse(buffer.toString("utf8"));}
 catch{throw Error("Invalid signed Docker CLI "+name+" JSON.");}
 // Canonical byte representation excludes duplicate keys, ambiguous metadata,
 // comments, BOMs and alternative JSON spellings. No secrets are logged.
 if(!plain(parsed)||buffer.toString("utf8")!==JSON.stringify(parsed)+"\n")
  throw Error("Noncanonical signed Docker CLI "+name+" JSON.");
 return parsed;
}
/** Pure parser for a deliberately minimal, local-only Docker context.
 * The on-disk meta.json is a *context store* record, not context-inspect
 * output (which adds TLSMaterial/Storage in its presentation). */
export function validateSignedDockerConfigContents({
 configRaw,metaRaw,context,endpoint
}){
 if(typeof context!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(context)||
    typeof endpoint!=="string"||!endpoint.startsWith("unix:///"))
  throw Error("Exact pinned local rootless Docker context required.");
 const config=canonicalJson(Buffer.from(configRaw), "config");
 const meta=canonicalJson(Buffer.from(metaRaw),"context metadata");
 if(!exactly(config,["currentContext"])||config.currentContext!==context)
  throw Error("Docker CLI configuration has wrong context or forbidden credential/plugin settings.");
 if(!exactly(meta,["Name","Metadata","Endpoints"])||
    meta.Name!==context||!exactly(meta.Metadata,[])||
    !exactly(meta.Endpoints,["docker"])||
    !exactly(meta.Endpoints.docker,["Host","SkipTLSVerify"])||
    meta.Endpoints.docker.Host!==endpoint||
    meta.Endpoints.docker.SkipTLSVerify!==false)
  throw Error("Pinned Docker context contains a different endpoint, TLS, or unexpected metadata.");
 const metaRelative="contexts/meta/"+digest(context)+"/meta.json";
 const files=[
  {path:"config.json",sha256:digest(configRaw)},
  {path:metaRelative,sha256:digest(metaRaw)}
 ];
 return Object.freeze({
  manifestSha256:digest("ETERNYX_DOCKER_CLI_CONFIG_TREE_V1\n"+JSON.stringify(files)),
  context,endpoint,metaRelative,
  onlyOneLocalContext:true,credentialHelpersAbsent:true,
  pluginConfigAbsent:true,tlsMaterialAbsent:true
 });
}

export function validateSignedDockerClientConfigPins(env={}){
 const engine=validateSignedAgentEnginePins(env);
 const dir=safeAbsolute(env?.ETERNYX_DOCKER_AGENT_CONFIG_DIR);
 const sha256=env?.ETERNYX_DOCKER_AGENT_CONFIG_SHA256;
 if(!FULL.test(sha256||""))
  throw Error("Independent Docker CLI configuration manifest SHA-256 pin required.");
 return Object.freeze({dir,sha256,context:engine.context,endpoint:engine.host});
}
function inspectTree(pins){
 allTrustedParents(pins.dir);
 const metaFolder=digest(pins.context);
 const contexts=join(pins.dir,"contexts");
 const metaRoot=join(contexts,"meta");
 const metaDir=join(metaRoot,metaFolder);
 const identities=[
  readTreeDirectory(pins.dir,["config.json","contexts"]),
  readTreeDirectory(contexts,["meta"]),
  readTreeDirectory(metaRoot,[metaFolder]),
  readTreeDirectory(metaDir,["meta.json"])
 ];
 const configRaw=readTrustedFile(join(pins.dir,"config.json"));
 const metaRaw=readTrustedFile(join(metaDir,"meta.json"));
 const result=validateSignedDockerConfigContents({
  configRaw,metaRaw,context:pins.context,endpoint:pins.endpoint
 });
 if(result.manifestSha256!==pins.sha256)
  throw Error("Docker client configuration differs from independently approved manifest.");
 // Repeat directory snapshots and roots to catch inconsistent namespace reads.
 for(const [i,path] of [pins.dir,contexts,metaRoot,metaDir].entries()){
  const later=trustedDir(path);
  if(!Object.keys(identities[i]).every(k=>identities[i][k]===later[k]))
   throw Error("Docker client config directory changed after file inspection.");
 }
 allTrustedParents(pins.dir);
 return result;
}
/** Full two-pass owner-private, root-owned manifest gate per CLI subprocess. */
export function verifyPinnedDockerClientConfig(env={}){
 if(process.platform!=="linux")
  throw Error("Pinned Docker client context requires an approved Linux host.");
 const pins=validateSignedDockerClientConfigPins(env);
 const a=inspectTree(pins),b=inspectTree(pins);
 if(JSON.stringify(a)!==JSON.stringify(b))
  throw Error("Docker CLI client config changed between forensic passes.");
 return Object.freeze({
  dir:pins.dir,sha256:pins.sha256,context:pins.context,endpoint:pins.endpoint,
  completeTreeVerified:true,rootOwned:true,
  immutableToUnprivilegedUser:true,onlyOneLocalContext:true,
  independentlyApprovedHost:false
 });
}
