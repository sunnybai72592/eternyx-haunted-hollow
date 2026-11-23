// Signed remote-lab agent: independently pinned, rootless LOCAL Unix-socket
// Docker admission. Pure checks: no process invocation, network or file writes.
import {createHash} from "node:crypto";
import {verifyManagedTarget} from "./dockerOperatorUtils.mjs";
import {fingerprintLabContainer} from "./dockerLabPolicyDrift.mjs";

const SHA=/^[a-f0-9]{64}$/;
const CONTEXT=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/;
const DENIED_ENV=[
 "DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG","DOCKER_TLS_VERIFY",
 "DOCKER_CERT_PATH","DOCKER_API_VERSION","DOCKER_TLS","DOCKER_TLS_CERTDIR"
];
const digest=s=>createHash("sha256").update(s).digest("hex");
function endpoint(path){
 if(typeof path!=="string"||path.length>200||!path.startsWith("unix:///"))
  throw Error("Independent pinned Unix-socket endpoint required.");
 const socket=path.slice("unix://".length);
 if(!socket.startsWith("/")||socket.includes("//")||socket.includes("%")||
    socket.split("/").includes("..")||/[\s\u0000-\u001f]/.test(socket))
  throw Error("Unsafe or noncanonical signed-agent socket endpoint.");
 return socket;
}
export function validateSignedAgentEnginePins(env={}){
 if(env===null||typeof env!=="object"||Array.isArray(env))throw Error("Missing operator pin environment.");
 const context=env.ETERNYX_DOCKER_AGENT_CONTEXT;
 const host=env.ETERNYX_DOCKER_AGENT_ENDPOINT;
 const daemonIdSha256=env.ETERNYX_DOCKER_AGENT_DAEMON_SHA256;
 const imageSha256=env.ETERNYX_DOCKER_AGENT_IMAGE_SHA256;
 const policySha256=env.ETERNYX_DOCKER_AGENT_POLICY_SHA256;
 if(!CONTEXT.test(context||"")||![daemonIdSha256,imageSha256,policySha256].every(x=>SHA.test(x||"")))
  throw Error("Signed agent needs independent context, daemon, image and policy SHA-256 pins.");
 if(DENIED_ENV.some(k=>typeof env[k]==="string"&&env[k]!==""))
  throw Error("Docker CLI environment override rejected by signed agent.");
 return {context,host,daemonIdSha256,imageSha256,policySha256,socketPath:endpoint(host)};
}
export function validateSignedAgentSocket(stat,uid){
 if(!stat||typeof stat.isSocket!=="function"||!stat.isSocket()||
    typeof stat.isSymbolicLink!=="function"||stat.isSymbolicLink()||
    !Number.isSafeInteger(uid)||stat.uid!==uid||(stat.mode&0o002)!==0)
  throw Error("Signed agent requires a real operator-owned non-public Unix socket.");
 return true;
}
export function validateSignedAgentEngineObserved({pins,context,endpoint:found,info}){
 if(!pins||context!==pins.context||found!==pins.host||
    !info||typeof info!=="object"||Array.isArray(info)||
    typeof info.ID!=="string"||info.ID.length<8||info.ID.length>256||
    digest("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+info.ID)!==pins.daemonIdSha256||
    !Array.isArray(info.SecurityOptions)||
    !info.SecurityOptions.includes("name=rootless")||
    info.SecurityOptions.some(x=>typeof x!=="string")||
    info.Swarm?.LocalNodeState!=="inactive")
  throw Error("Signed-agent Docker rootless Engine or pinned context identity drifted.");
 return true;
}
function networkAbsent(inspect){
 const nets=inspect?.NetworkSettings?.Networks;
 if(nets!==undefined&&nets!==null&&
    (typeof nets!=="object"||Array.isArray(nets)||
      Object.keys(nets).some(name=>name!=="none")))
  throw Error("Signed-agent container network metadata is unsafe.");
 const ports=inspect?.NetworkSettings?.Ports;
 if(ports!==undefined&&ports!==null&&
    (typeof ports!=="object"||Array.isArray(ports)||
      Object.values(ports).some(v=>v!==null&&!(Array.isArray(v)&&v.length===0))))
  throw Error("Signed-agent container published ports are forbidden.");
}
export function validateSignedAgentTarget(inspect,containerId,operation,pins,{stage="before"}={}){
 if(!pins||!["start","stop","restart"].includes(operation)||
    !["before","after"].includes(stage)||!SHA.test(containerId||""))
  throw Error("Exact signed operation and pinned target required.");
 verifyManagedTarget(inspect,containerId);
 if(inspect.Image!=="sha256:"+pins.imageSha256)
  throw Error("Signed-agent target is not the independently approved image.");
 const fingerprint=fingerprintLabContainer(inspect,containerId);
 if(fingerprint.policySha256!==pins.policySha256)
  throw Error("Signed-agent target security policy differs from approved fingerprint.");
 networkAbsent(inspect);
 const status=inspect?.State?.Status, running=inspect?.State?.Running;
 if(stage==="before"){
  if(operation==="start"&&!(running===false&&["created","exited"].includes(status)))
   throw Error("Start requires an already stopped, pinned target.");
  if(["stop","restart"].includes(operation)&&!(running===true&&status==="running"))
   throw Error("Stop or restart requires a running, pinned target.");
 }else if(typeof running!=="boolean"||!["running","exited","created"].includes(status)){
  throw Error("Uninterpretable signed-agent post-mutation Docker state.");
 }
 return {containerId,policySha256:fingerprint.policySha256,status,running};
}
