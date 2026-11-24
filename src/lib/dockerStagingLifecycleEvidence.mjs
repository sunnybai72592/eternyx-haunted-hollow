// Phase 41 — only READ-ONLY lifecycle observations before and after a separately
// authorized isolated-host staging action. NEVER execute Docker commands,
// create claims/receipts, sign permits or infer that a real action was caused
// by an unsigned local observation. This is evidence *readiness*, not release.
import {createHash} from "node:crypto";
import {validateSignedAgentEngineObserved,validateSignedAgentTarget}
 from "./dockerSignedAgentEngineGate.mjs";
import {validateSignedAgentLifecycleEvidence}
 from "./dockerSignedAgentLastMomentGate.mjs";
import {assertReadOnlyHostRecoveryInventoryStable}
 from "./dockerSignedHostReadOnlyPreflight.mjs";
import {fingerprintLabContainer} from "./dockerLabPolicyDrift.mjs";
const HASH=/^[a-f0-9]{64}$/;
const OPS=["start","stop","restart"];
const SHA=x=>createHash("sha256").update(x).digest("hex");
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&
 new Date(x).toISOString()===x;
const exact=(obj,keys)=>obj!==null&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).join("|")===keys.join("|");
const PINS=["operatorTargetSha256","approvedContextSha256","approvedDaemonIdSha256",
 "approvedImageSha256","approvedPolicySha256","approvedClientSha256",
 "approvedConfigManifestSha256","operation"];
const STATE=["running","status","startedEpochSha256","finishedEpochSha256",
 "pidSha256","exitCode","restartCount","paused","restarting","dead"];
const FIELDS=[
 "schema","phase","operation",...PINS.slice(0,-1),"localHistorySha256",
 "observedState","observedNetworkSha256","observedStateSha256","inspectedAt",
 "doubleReadOnlyObservationVerified","originalPrivateRecoveryVerified",
 "rootlessNoNetworkTargetVerified","independentHostIdentityProven",
 "physicalIsolationIndependentlyProven","signedPermitVerified",
 "stagingMutationAuthorized","productionDeploymentAuthorized",
 "dockerMutationExecutedByObserver","receiptIssuedByObserver",
 "evidenceSha256"
];
const STATE_KEYS=["Running","Status","StartedAt","FinishedAt","Pid",
 "ExitCode","Paused","Restarting","Dead"];
function state(o){
 const s=o?.State;
 if(!s||typeof s!=="object"||Array.isArray(s)||
    typeof s.Running!=="boolean"||typeof s.Status!=="string"||
    typeof s.StartedAt!=="string"||typeof s.FinishedAt!=="string"||
    !Number.isInteger(s.Pid)||!Number.isInteger(s.ExitCode)||
    !Number.isSafeInteger(o.RestartCount)||o.RestartCount<0||
    ![s.Paused,s.Restarting,s.Dead].every(x=>typeof x==="boolean"))
  throw Error("Staging lifecycle capture lacks complete Docker state.");
 return {
  running:s.Running,status:s.Status,
  startedEpochSha256:SHA("ETERNYX_DOCKER_STAGE_START_EPOCH_V1\n"+s.StartedAt),
  finishedEpochSha256:SHA("ETERNYX_DOCKER_STAGE_FINISH_EPOCH_V1\n"+s.FinishedAt),
  pidSha256:SHA("ETERNYX_DOCKER_STAGE_PID_V1\n"+s.Pid),
  exitCode:s.ExitCode,restartCount:o.RestartCount,
  paused:s.Paused,restarting:s.Restarting,dead:s.Dead
 };
}
function network(o){
 const n=o?.NetworkSettings;
 if(!n||!n.Networks||typeof n.Networks!=="object"||
    Array.isArray(n.Networks)||!Object.hasOwn(n,"Ports"))
  throw Error("Staging lifecycle capture lacks complete network state.");
 return SHA("ETERNYX_DOCKER_STAGE_NETWORK_V1\n"+
  JSON.stringify({networks:n.Networks,ports:n.Ports}));
}
function checkObserved({pins,contextBefore,contextAfter,endpointBefore,
 endpointAfter,infoBefore,infoAfter,targetBefore,targetAfter,containerId,
 operation,phase,inventoryBefore,inventoryAfter,cli,config}){
 if(!pins||!HASH.test(containerId||"")||!OPS.includes(operation)||
    !["before","after"].includes(phase))
  throw Error("Staging capture requires exact operation, target and phase.");
 if(cli?.hashVerified!==true||cli?.rootOwned!==true||
    cli?.symlinkFree!==true||!HASH.test(cli.sha256||"")||
    config?.completeTreeVerified!==true||config?.rootOwned!==true||
    config?.onlyOneLocalContext!==true||!HASH.test(config.sha256||"")||
    config.context!==pins.context||config.endpoint!==pins.host)
  throw Error("Staging capture needs pinned CLI and single sealed local context.");
 const recovery=assertReadOnlyHostRecoveryInventoryStable(inventoryBefore,inventoryAfter);
 for(const [c,e,info] of [
  [contextBefore,endpointBefore,infoBefore],
  [contextAfter,endpointAfter,infoAfter]
 ])validateSignedAgentEngineObserved({pins,context:c,endpoint:e,info});
 if(JSON.stringify({id:infoBefore.ID,security:infoBefore.SecurityOptions,
   swarm:infoBefore.Swarm})!==
   JSON.stringify({id:infoAfter.ID,security:infoAfter.SecurityOptions,
   swarm:infoAfter.Swarm}))
  throw Error("Rootless daemon changed during staging read-only capture.");
 validateSignedAgentTarget(targetBefore,containerId,operation,pins,{stage:phase});
 validateSignedAgentTarget(targetAfter,containerId,operation,pins,{stage:phase});
 const a=state(targetBefore),b=state(targetAfter);
 if(JSON.stringify(a)!==JSON.stringify(b)||
    network(targetBefore)!==network(targetAfter))
  throw Error("Staging target lifecycle or network drifted during read-only capture.");
 if(phase==="after"&&
    (operation==="stop"?(b.running!==false||b.status!=="exited"):
     (b.running!==true||b.status!=="running")))
  throw Error("Post-staging observation does not match intended lifecycle outcome.");
 const policy=fingerprintLabContainer(targetAfter,containerId);
 if(policy.policySha256!==pins.policySha256)
  throw Error("Staging capture security policy does not match original approval.");
 return {recovery,state:b,networkSha256:network(targetAfter)};
}
/** Runtime capture of two already-collected *read-only* observation passes. */
export function evaluateDockerStagingLifecycleCapture(input,now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid staging capture clock.");
 const {recovery,state:observed,networkSha256}=checkObserved(input);
 const {pins,containerId,operation,phase,cli,config}=input;
 const payload={
  schema:"eternyx-docker-staging-lifecycle-capture-v1",
  phase,operation,
  operatorTargetSha256:SHA("ETERNYX_DOCKER_HOST_TARGET_V1\n"+containerId),
  approvedContextSha256:SHA("ETERNYX_DOCKER_HOST_CONTEXT_V1\n"+pins.context),
  approvedDaemonIdSha256:pins.daemonIdSha256,
  approvedImageSha256:pins.imageSha256,
  approvedPolicySha256:pins.policySha256,
  approvedClientSha256:cli.sha256,
  approvedConfigManifestSha256:config.sha256,
  localHistorySha256:recovery.inventorySha256,
  observedState:observed,
  observedNetworkSha256:networkSha256,
  observedStateSha256:SHA("ETERNYX_DOCKER_STAGE_STATE_V1\n"+JSON.stringify(observed)),
  inspectedAt:new Date(ms).toISOString(),
  doubleReadOnlyObservationVerified:true,
  originalPrivateRecoveryVerified:true,
  rootlessNoNetworkTargetVerified:true,
  independentHostIdentityProven:false,
  physicalIsolationIndependentlyProven:false,
  signedPermitVerified:false,stagingMutationAuthorized:false,
  productionDeploymentAuthorized:false,
  dockerMutationExecutedByObserver:false,
  receiptIssuedByObserver:false
 };
 return Object.freeze({
  ...payload,
  evidenceSha256:SHA("ETERNYX_DOCKER_STAGE_CAPTURE_V1\n"+JSON.stringify(payload))
 });
}
function validateCapture(p,stage,nowMs){
 if(!exact(p,FIELDS)||p.schema!=="eternyx-docker-staging-lifecycle-capture-v1"||
    p.phase!==stage||!OPS.includes(p.operation)||
    !PINS.slice(0,-1).every(k=>HASH.test(p[k]||""))||
    !HASH.test(p.localHistorySha256||"")||
    !HASH.test(p.observedNetworkSha256||"")||
    !HASH.test(p.observedStateSha256||"")||
    !HASH.test(p.evidenceSha256||"")||
    !exact(p.observedState,STATE)||!iso(p.inspectedAt)||
    Date.parse(p.inspectedAt)>nowMs+120000||
    nowMs-Date.parse(p.inspectedAt)>60*60000)
  throw Error("Invalid, stale or incomplete staging lifecycle evidence capture.");
 const s=p.observedState;
 if(typeof s.running!=="boolean"||!["running","exited","created"].includes(s.status)||
    ![s.startedEpochSha256,s.finishedEpochSha256,s.pidSha256]
      .every(k=>HASH.test(k||""))||
    !Number.isSafeInteger(s.restartCount)||s.restartCount<0||
    !Number.isInteger(s.exitCode)||
    ![s.paused,s.restarting,s.dead].every(k=>k===false)||
    !p.doubleReadOnlyObservationVerified||
    !p.originalPrivateRecoveryVerified||
    !p.rootlessNoNetworkTargetVerified||
    !["independentHostIdentityProven","physicalIsolationIndependentlyProven",
      "signedPermitVerified","stagingMutationAuthorized",
      "productionDeploymentAuthorized","dockerMutationExecutedByObserver",
      "receiptIssuedByObserver"].every(k=>p[k]===false))
  throw Error("Untrusted staging snapshot claims a forbidden state or authorization.");
 if(stage==="before"?(p.operation==="start"?
    (s.running||!["created","exited"].includes(s.status)):
    (!s.running||s.status!=="running")):
    (p.operation==="stop"?(s.running||s.status!=="exited"):
    (!s.running||s.status!=="running")))
  throw Error("Staging snapshot lifecycle does not match its declared phase.");
 if(SHA("ETERNYX_DOCKER_STAGE_STATE_V1\n"+JSON.stringify(s))!==p.observedStateSha256)
  throw Error("Staging snapshot state checksum mismatch.");
 const body={};
 for(const key of FIELDS.slice(0,-1))body[key]=p[key];
 if(SHA("ETERNYX_DOCKER_STAGE_CAPTURE_V1\n"+JSON.stringify(body))!==p.evidenceSha256)
  throw Error("Staging snapshot original digest does not match exact canonical evidence.");
 return p;
}
function asLegacyLifecycle(s){
 return {State:{
  Running:s.running,Status:s.status,StartedAt:s.startedEpochSha256,
  FinishedAt:s.finishedEpochSha256,Pid:s.pidSha256,
  ExitCode:s.exitCode,Paused:s.paused,Restarting:s.restarting,Dead:s.dead
 },RestartCount:s.restartCount};
}
/** Independent *consistency* review of two captures; unsigned local
 * observations cannot prove causal attribution, host provenance or permits. */
export function verifyDockerStagingLifecyclePair(before,after,expected,now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid independent staging review clock.");
 validateCapture(before,"before",ms);
 validateCapture(after,"after",ms);
 if(!exact(expected,PINS)||!PINS.slice(0,-1).every(k=>HASH.test(expected[k]||""))||
    !OPS.includes(expected.operation))
  throw Error("Staging reviewer requires independently approved exact pins.");
 for(const k of PINS){
  if(before[k]!==expected[k]||after[k]!==expected[k])
   throw Error("Staging captures do not match independently approved pin: "+k);
 }
 if(before.observedNetworkSha256!==after.observedNetworkSha256)
  throw Error("Hardened network-none state changed between staging captures.");
 const t1=Date.parse(before.inspectedAt),t2=Date.parse(after.inspectedAt);
 if(t2<=t1||t2-t1>15*60000||ms-t2>15*60000)
  throw Error("Staging transition captures are reversed, too old or not contemporaneous.");
 if(before.observedStateSha256===after.observedStateSha256)
  throw Error("Staging captures do not contain a distinct lifecycle state change.");
 const a=before.observedState,b=after.observedState;
 validateSignedAgentLifecycleEvidence(asLegacyLifecycle(a),
  asLegacyLifecycle(b),expected.operation);
 if(expected.operation==="stop"&&a.startedEpochSha256!==b.startedEpochSha256)
  throw Error("Container start epoch drifted unexpectedly during stop.");
 const evidence={
  schema:"eternyx-docker-staging-lifecycle-comparison-v1",
  operation:expected.operation,
  originalBeforeSha256:before.evidenceSha256,
  originalAfterSha256:after.evidenceSha256,
  independentlyMatchedPins:true,
  originalSnapshotsSelfConsistent:true,
  reportedLifecycleTransitionConsistent:true,
  hardenedNetworkObservationUnchanged:true,
  readOnlyObserverDidNotExecuteDocker:true,
  independentlyVerifiedHostIdentity:false,
  physicalIsolationProven:false,
  executedActionAttributionProven:false,
  signedPermitAndRevocationVerified:false,
  crashRecoveryDrillProven:false,
  receiptReconciliationProven:false,
  reviewerWitnessSignatureVerified:false,
  stagingExecutionAuthorized:false,productionDeploymentAuthorized:false
 };
 return Object.freeze({...evidence,
  comparisonSha256:SHA("ETERNYX_DOCKER_STAGE_COMPARE_V1\n"+JSON.stringify(evidence))
 });
}
export const STAGING_LIFECYCLE_EXPECTED_KEYS=Object.freeze(PINS.slice());
