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
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPS=new Set(["start","stop","restart"]);
export function validateDockerCrashTriageJournal(entries,claim,pinnedContainerId){
 if(!Array.isArray(entries)||entries.length>100||!claim||
    typeof claim!=="object"||Array.isArray(claim)||
    Object.keys(claim).sort().join(",")!==
    ["agentId","claimId","operation","containerId","events","outcome",
     "attempted","acknowledged","attentionRequired"].sort().join(","))
  throw Error("Invalid or unbounded crash-triage journal inventory.");
 if(!UUID.test(claim.claimId||"")||!UUID.test(claim.agentId||"")||
    !OPS.has(claim.operation)||claim.containerId!==pinnedContainerId||
    claim.acknowledged!==false||claim.attentionRequired!==true)
  throw Error("Crash triage requires an exact unresolved operator-owned claim.");
 const sequences=[
  ["reserved"],["reserved","attempted"],["reserved","guard_denied"],
  ["reserved","attempted","completed"],["reserved","attempted","failed"]
 ];
 if(!Array.isArray(claim.events)||
    !sequences.some(a=>JSON.stringify(a)===JSON.stringify(claim.events))||
    claim.attempted!==claim.events.includes("attempted")||
    claim.outcome!==(claim.events.includes("guard_denied")?"guard_denied":
      claim.events.includes("completed")?"completed":
      claim.events.includes("failed")?"failed":null))
  throw Error("Claim transition and recorded terminal outcome disagree.");
 const match=entries.filter(e=>e&&e.claimId===claim.claimId);
 if(match.length!==1||entries.some(e=>!e||e.error||
   (e.claimId===claim.claimId?
     e.agentId!==claim.agentId||e.operation!==claim.operation||
     e.acknowledged!==false||e.attentionRequired!==true||
     e.outcome!==claim.outcome||e.attempted!==claim.attempted:
     e.attentionRequired!==false||e.acknowledged!==true)))
  throw Error("Unrelated unresolved or mismatched journal blocks crash triage.");
 return {
  journalCount:entries.length,
  stage:claim.outcome!==null?"terminal_unacknowledged":
    claim.attempted?"attempted_outcome_unknown":"reserved_only",
  claimId:claim.claimId,
  agentId:claim.agentId,
  operation:claim.operation,
  attempted:claim.attempted,
  outcome:claim.outcome
 };
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
 observedAt=()=>new Date().toISOString(),recoveryTriage=null
}={}){
 const cfg=validateDockerHostReadOnlyPins(pins,env);
 if(typeof execDocker!=="function"||typeof socketStat!=="function"||
    typeof journalEntries!=="function")
  throw Error("Missing local-only Docker inspection transports.");
 // No Docker command runs before this admission gate.
 verifySocket(socketStat(cfg.socketPath),uid);
 const allJournals=await journalEntries();
 const triage=recoveryTriage===null?null:
  validateDockerCrashTriageJournal(allJournals,recoveryTriage,cfg.containerId);
 const journalCount=triage?triage.journalCount:validateDockerHostJournal(allJournals);
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
 if(triage){
  const running=first.State?.Running,status=first.State?.Status;
  if(typeof running!=="boolean"||
     !["running","exited","created","paused","restarting","dead"].includes(status))
   throw Error("Crash triage requires an interpretable stable live container state.");
  return {
   schema:"eternyx-docker-host-crash-triage-v1",
   scope:"operator_initiated_local_unix_socket_read_only_crash_triage",
   observedAt:time,daemonIdentitySha256:cfg.expectedDaemonIdSha256,
   socketEndpointSha256:hash("ETERNYX_DOCKER_HOST_SOCKET_V1\n"+endpoint),
   imageSha256:cfg.expectedImageSha256,containerId:cfg.containerId,
   managedContainerPolicySha256:firstPolicy.policySha256,
   claimId:triage.claimId,agentId:triage.agentId,
   claimOperation:triage.operation,claimJournalStage:triage.stage,
   recordedOutcome:triage.outcome,attemptedRecorded:triage.attempted,
   observedContainerStatus:status,observedContainerRunning:running,
   journalClaimsChecked:journalCount,unresolvedClaimsObserved:true,
   pinnedRootlessEngineObserved:true,networkNoneObserved:true,
   stableDoubleInspectObserved:true,realDockerEngineReadOnlyContacted:true,
   localMutationReexecuted:false,mutationOutcomeIndependentlyVerified:false,
   automaticRetryAuthorized:false,receiptOnlyReplayAuthorized:false,
   controlledCrashRecoveryTestPerformed:false,
   independentHostAttestation:false,externalNetworkIsolationProved:false,
   productionDeploymentAuthorized:false,stagingDockerExecutionAuthorized:false,
   independentOperatorReviewRequired:true
  };
 }
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
