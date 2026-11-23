// Operator-run real Docker HOST read-only acceptance. Not a remote Docker
// proxy or host attestation. No docker create/start/stop/restart/build/exec.
// An injected CLI and socket stat allow deterministic offline CI without Docker.
import {createHash} from "node:crypto";
import {verifyManagedTarget,isLocalEndpoint} from "./dockerOperatorUtils.mjs";
import {fingerprintLabContainer} from "./dockerLabPolicyDrift.mjs";

const ID=/^[a-f0-9]{64}$/;
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/;
const HEX=/^[a-f0-9]{64}$/;
const hash=v=>createHash("sha256").update(v).digest("hex");
const valid=(v)=>typeof v==="string"&&v.length>0&&v.length<=200;

export function validateDockerHostReadOnlyPins(pins,env={}){
 if(!pins||typeof pins!=="object"||Array.isArray(pins)||
    Object.keys(pins).sort().join(",")!==
      ["containerId","expectedContext","expectedDaemonIdSha256",
       "expectedEndpoint","expectedImageSha256"].sort().join(","))
  throw Error("Five operator-pinned host identity fields are required.");
 if(!ID.test(pins.containerId||"")||!NAME.test(pins.expectedContext||"")||
    !HEX.test(pins.expectedDaemonIdSha256||"")||
    !HEX.test(pins.expectedImageSha256||"")||
    !valid(pins.expectedEndpoint)||!isLocalEndpoint(pins.expectedEndpoint)||
    !pins.expectedEndpoint.startsWith("unix:///"))
  throw Error("An independently pinned Linux Unix-socket Docker context, daemon, image and container are required.");
 const socketPath=pins.expectedEndpoint.slice("unix://".length);
 if(!socketPath.startsWith("/")||socketPath.includes("//")||
    socketPath.split("/").includes("..")||socketPath.includes("%")||
    /[\r\n\t ]/.test(socketPath))
  throw Error("Noncanonical pinned Docker Unix socket.");
 for(const key of [
  "DOCKER_HOST","DOCKER_CONTEXT","DOCKER_CONFIG",
  "DOCKER_TLS_VERIFY","DOCKER_CERT_PATH","DOCKER_API_VERSION",
  "DOCKER_TLS","DOCKER_TLS_CERTDIR"
 ]){
  if(env[key]!==undefined&&env[key]!=="")
   throw Error("Unsafe Docker CLI environment override.");
 }
 if(env.ETERNYX_REMOTE_LAB_ENABLED==="true"||
    env.DOCKER_REMOTE_LAB_ENABLED==="true")
  throw Error("Remote lab execution must remain disabled during host inspection.");
 return {...pins,socketPath};
}
export function validateDockerHostJournal(entries){
 if(!Array.isArray(entries)||entries.length>100)
  throw Error("Docker host journal is unbounded or incomplete.");
 if(entries.some(e=>!e||e.attentionRequired!==false||
  e.acknowledged!==true||e.error))
  throw Error("Unresolved or corrupt Docker claim journal: investigate manually.");
 return entries.length;
}
function parseBounded(output,max=524288){
 if(typeof output!=="string"||output.length<2||output.length>max)
  throw Error("Missing or excessive Docker host metadata.");
 let value;
 try{value=JSON.parse(output);}catch{throw Error("Invalid Docker JSON metadata.");}
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw Error("Malformed Docker host object.");
 return value;
}
function unsafeNetwork(obj){
 const networks=obj?.NetworkSettings?.Networks;
 if(networks!==undefined&&networks!==null&&
   (typeof networks!=="object"||Array.isArray(networks)||
    Object.keys(networks).some(n=>n!=="none")))
  return true;
 const ports=obj?.NetworkSettings?.Ports;
 return ports!==undefined&&ports!==null&&(
  typeof ports!=="object"||Array.isArray(ports)||
  Object.values(ports).some(x=>x!==null&&!(Array.isArray(x)&&x.length===0))
 );
}
function verifySocket(stat,uid){
 if(!stat||typeof stat.isSocket!=="function"||!stat.isSocket()||
    typeof stat.isSymbolicLink!=="function"&&stat.isSymbolicLink!==undefined)
  throw Error("Pinned Docker endpoint is not a real local Unix socket.");
 if(stat.isSymbolicLink?.())throw Error("Symlinked Docker socket refused.");
 if(typeof uid!=="number"||stat.uid!==uid||(stat.mode&0o002)!==0)
  throw Error("Docker socket must be owned by this operator and not world-writable.");
}
export async function inspectDockerHostReadOnly(pins,{
 env={},execDocker,socketStat,journalEntries=()=>[],uid=0,
 observedAt=()=>new Date().toISOString()
}={}){
 const cfg=validateDockerHostReadOnlyPins(pins,env);
 if(typeof execDocker!=="function"||typeof socketStat!=="function"||
    typeof journalEntries!=="function")
  throw Error("Missing local-only Docker inspection transports.");
 // No Docker command runs before this admission gate.
 verifySocket(socketStat(cfg.socketPath),uid);
 const journalCount=validateDockerHostJournal(await journalEntries());
 const run=async args=>{
  if(!Array.isArray(args)||args.some(s=>typeof s!=="string"))
   throw Error("Docker CLI arguments malformed.");
  return await execDocker(args);
 };
 const context=String(await run(["context","show"])).trim();
 if(context!==cfg.expectedContext||!NAME.test(context))
  throw Error("Selected Docker context differs from the operator pin.");
 const rawEndpoint=String(await run(["context","inspect",context,
  "--format","{{json .Endpoints.docker.Host}}"])).trim();
 let endpoint;
 try{endpoint=JSON.parse(rawEndpoint);}catch{throw Error("Docker context endpoint cannot be decoded.");}
 if(endpoint!==cfg.expectedEndpoint||!isLocalEndpoint(endpoint))
  throw Error("Docker Engine endpoint differs from the pinned Unix socket.");
 const info=parseBounded(await run(["--context",context,"info",
  "--format","{{json .}}"]));
 if(typeof info.ID!=="string"||info.ID.length<8||info.ID.length>256||
    hash("ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n"+info.ID)!==cfg.expectedDaemonIdSha256)
  throw Error("Docker daemon identity does not match independently pinned metadata.");
 if(!Array.isArray(info.SecurityOptions)||
    !info.SecurityOptions.some(x=>x==="name=rootless")||
    info.SecurityOptions.some(x=>typeof x!=="string")||
    info.Swarm?.LocalNodeState!=="inactive")
  throw Error("Docker host is not an isolated rootless non-Swarm lab.");
 const inspectArgs=["--context",context,"container","inspect","--format",
  "{{json .}}",cfg.containerId];
 const first=parseBounded(await run(inspectArgs));
 verifyManagedTarget(first,cfg.containerId);
 if(unsafeNetwork(first))throw Error("Docker network or published-port connection detected.");
 if(first.Image!=="sha256:"+cfg.expectedImageSha256)
  throw Error("Running local image differs from independently pinned image ID.");
 const firstPolicy=fingerprintLabContainer(first,cfg.containerId);
 const second=parseBounded(await run(inspectArgs));
 verifyManagedTarget(second,cfg.containerId);
 if(unsafeNetwork(second)||second.Image!==first.Image)
  throw Error("Docker target changed or became network-connected during inspection.");
 const secondPolicy=fingerprintLabContainer(second,cfg.containerId);
 if(firstPolicy.policySha256!==secondPolicy.policySha256||
    first.State?.Running!==second.State?.Running||
    first.State?.Status!==second.State?.Status||
    first.State?.StartedAt!==second.State?.StartedAt)
  throw Error("Docker target state/policy changed during read-only inspection.");
 const time=observedAt();
 if(typeof time!=="string"||!Number.isFinite(Date.parse(time))||
    new Date(time).toISOString()!==time)throw Error("Untrusted observation clock.");
 return {
  schema:"eternyx-docker-host-readonly-observation-v1",
  scope:"operator_initiated_local_unix_socket_read_only",
  observedAt:time,contextName:context,
  socketEndpointSha256:hash("ETERNYX_DOCKER_HOST_SOCKET_V1\n"+endpoint),
  daemonIdentitySha256:cfg.expectedDaemonIdSha256,
  containerId:cfg.containerId,imageSha256:cfg.expectedImageSha256,
  managedContainerPolicySha256:firstPolicy.policySha256,
  daemonRootlessObserved:true,swarmInactiveObserved:true,
  managedTargetChecksPassed:true,networkNoneObserved:true,
  pinnedImageMatchesObserved:true,stableTwoInspections:true,
  journalClaimsChecked:journalCount,unresolvedClaimsObserved:false,
  realDockerEngineReadOnlyContacted:true,
  actualRemoteSignedDispatchTested:false,crashRecoveryDrillOnRealHostPerformed:false,
  independentHostAttestation:false,externalNetworkIsolationProved:false,
  labContainerMutationPerformed:false,remoteLabExecutionEnabled:false,
  productionDeploymentAuthorized:false,stagingDockerExecutionAuthorized:false,
  independentOperatorApprovalRequired:true
 };
}
