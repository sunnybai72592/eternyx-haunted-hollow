// Phase 35: independently pin the *actual* Docker CLI selected by the signed
// agent. Verifying a remote rootless daemon is not enough if PATH can choose
// an arbitrary local executable. Read-only local checks; NEVER call Docker.
import {createHash} from "node:crypto";
import {lstatSync,openSync,closeSync,fstatSync,readFileSync,constants} from "node:fs";
import {isAbsolute,dirname,parse} from "node:path";

const HASH=/^[a-f0-9]{64}$/;
const MAX_CLI_BYTES=256*1024*1024;
const FILE_FLAGS=constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0);

function normalizedAbsolute(path){
 if(typeof path!=="string"||!isAbsolute(path)||path.length>512||
    !path.startsWith("/")||path.includes("//")||path.includes("%")||
    path.split("/").some(s=>s==="."||s==="..")||
    /[\u0000-\u001f\u007f]/.test(path)||
    path!==path.trim()||path.endsWith("/")||path==="/")
  throw Error("Signed Docker CLI needs an absolute canonical non-symlink executable path.");
 return path;
}

export function validateSignedDockerCliPins(env={}){
 if(!env||typeof env!=="object"||Array.isArray(env))
  throw Error("Missing operator Docker CLI executable pins.");
 const path=normalizedAbsolute(env.ETERNYX_DOCKER_AGENT_CLI_PATH);
 const sha256=env.ETERNYX_DOCKER_AGENT_CLI_SHA256;
 if(!HASH.test(sha256||""))
  throw Error("Signed Docker CLI needs an independently approved SHA-256 pin.");
 return Object.freeze({path,sha256});
}

function trustedRootOwned(st,{directory=false}={}){
 if(!st||st.isSymbolicLink()||
    (directory?!st.isDirectory():!st.isFile())||
    st.uid!==0||(st.mode&0o022)!==0)
  throw Error("Signed Docker CLI or its parent is not root-owned and non-writable.");
 if(!directory&&
   ((st.mode&0o111)===0||st.size<=0||st.size>MAX_CLI_BYTES))
  throw Error("Signed Docker CLI must be executable, nonempty and bounded.");
 return st;
}

function parentsTrusted(path){
 let p=dirname(path);
 const top=parse(path).root;
 while(true){
  trustedRootOwned(lstatSync(p),{directory:true});
  if(p===top)break;
  const next=dirname(p);
  if(next===p)throw Error("Unsafe Docker CLI parent directory traversal.");
  p=next;
 }
}

/**
 * Hold the exact O_NOFOLLOW-opened, root-owned ELF executable descriptor
 * throughout one synchronous caller operation. The verified inode, not a
 * second lookup by pathname, is what Linux will execute through fd 3.
 *
 * This is not fexecve(2) or hardware attestation: it still trusts a
 * separately reviewed Linux host, /proc, the ELF interpreter and root.
 */
export function withPinnedDockerCliFile(env,useVerifiedFd){
 if(process.platform!=="linux")
  throw Error("Signed Docker CLI descriptor execution requires Linux.");
 if(typeof useVerifiedFd!=="function")
  throw Error("Pinned Docker CLI operation must be synchronous.");
 const pins=validateSignedDockerCliPins(env);
 parentsTrusted(pins.path);
 const before=trustedRootOwned(lstatSync(pins.path));
 const fd=openSync(pins.path,FILE_FLAGS);
 try{
  const opened=trustedRootOwned(fstatSync(fd));
  if(before.dev!==opened.dev||before.ino!==opened.ino||
     before.size!==opened.size||before.mtimeMs!==opened.mtimeMs||
     before.ctimeMs!==opened.ctimeMs)
   throw Error("Signed Docker CLI executable changed before verification.");
  const raw=readFileSync(fd);
  const after=trustedRootOwned(fstatSync(fd));
  const byPath=trustedRootOwned(lstatSync(pins.path));
  if(raw.length!==before.size||
     [after,byPath].some(s=>
       s.dev!==before.dev||s.ino!==before.ino||
       s.size!==before.size||s.mtimeMs!==before.mtimeMs||
       s.ctimeMs!==before.ctimeMs))
   throw Error("Signed Docker CLI executable changed during verification.");
  if(raw.length<4||raw[0]!==0x7f||raw[1]!==0x45||
     raw[2]!==0x4c||raw[3]!==0x46)
   throw Error("Signed Docker CLI requires a verified ELF binary, not a shell script.");
  if(createHash("sha256").update(raw).digest("hex")!==pins.sha256)
   throw Error("Signed Docker CLI executable SHA-256 differs from independent pin.");
  parentsTrusted(pins.path);
  const verified=Object.freeze({
   path:pins.path,sha256:pins.sha256,
   fd,execPath:"/proc/self/fd/3",
   rootOwned:true,symlinkFree:true,hashVerified:true,
   independentlyApprovedHost:false
  });
  // Passing fd3 via spawnSync stdio pins execve to the inode we hashed.
  // No asynchronous action is allowed to outlive the held descriptor.
  const result=useVerifiedFd(verified);
  if(result!==null&&typeof result==="object"&&typeof result.then==="function")
   throw Error("Pinned Docker CLI descriptor cannot escape a synchronous call.");
  return result;
 }finally{closeSync(fd);}
}

/** Compatibility/read-only check for independently managed preflight calls.
 * Actual command execution must use withPinnedDockerCliFile() instead. */
export function verifyPinnedDockerCliExecutable(env={}){
 return withPinnedDockerCliFile(env,verified=>Object.freeze({
  path:verified.path,sha256:verified.sha256,
  rootOwned:verified.rootOwned,symlinkFree:verified.symlinkFree,
  hashVerified:verified.hashVerified,
  independentlyApprovedHost:false
 }));
}

/**
 * Explicit environment allowlist: never forward PATH/LD_PRELOAD, dynamic
 * loader options, DOCKER_HOST, proxies, plugins or arbitrary user variables
 * into the pinned CLI. Its operator home holds the independently managed
 * Docker context. No child can inherit secrets or runtime overrides here.
 */
export function signedDockerCliEnvironment(home){
 if(typeof home!=="string"||!isAbsolute(home)||!home.startsWith("/")||
    home.includes("//")||home.split("/").some(x=>x==="."||x==="..")||
    /[\u0000-\u001f\u007f]/.test(home))
  throw Error("Signed Docker CLI requires an absolute operator home.");
 const st=lstatSync(home);
 if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=="win32"&&
      (st.uid!==process.getuid()||(st.mode&0o022)!==0)))
  throw Error("Signed Docker CLI home must be a real non-writable operator directory.");
 return Object.freeze({HOME:home,PATH:"/usr/bin:/bin",LANG:"C",LC_ALL:"C"});
}
