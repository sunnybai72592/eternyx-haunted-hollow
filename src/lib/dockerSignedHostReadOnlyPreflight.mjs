// Docker Phase 38: pure, conservative verification of a read-only signed
// isolated-host preflight. Never runs Docker, contacts servers, writes journals
// or grants execution. Only observations from separately controlled Linux
// operator hosts may be assessed as real, not synthetic unit-test fixtures.
import {createHash} from "node:crypto";
import {validateSignedAgentEngineObserved,validateSignedAgentTarget}
 from "./dockerSignedAgentEngineGate.mjs";
import {assertSignedAgentPreMutationUnchanged}
 from "./dockerSignedAgentLastMomentGate.mjs";
import {fingerprintLabContainer} from "./dockerLabPolicyDrift.mjs";

const FULL=/^[a-f0-9]{64}$/;
const OP=new Set(["start","stop","restart"]);
const digest=x=>createHash("sha256").update(x).digest("hex");

function safeInventory(i){
 if(!i||i.schema!=="eternyx-docker-signed-agent-strict-recovery-inventory-v1"||
    i.completeInventoryVerified!==true||i.stableDoubleReadVerified!==true||
    !FULL.test(i.inventorySha256||"")||
    !Number.isSafeInteger(i.fileCount)||i.fileCount<0||i.fileCount>100||
    !Array.isArray(i.claims)||!Array.isArray(i.locks)||
    !Array.isArray(i.containerLocks)||!Array.isArray(i.blocked)||
    i.claimCount!==i.claims.length||i.lockCount!==i.locks.length||
    i.containerLockCount!==i.containerLocks.length||
    i.totalLockCount!==i.lockCount+i.containerLockCount||
    i.fileCount!==i.claimCount+i.totalLockCount||
    i.safeToRetryClaimAutomatically!==false||
    i.lockSafeToClearAutomatically!==false||
    i.productionDeploymentAuthorized!==false)
  throw Error("Host preflight denied: missing complete owner-private recovery inventory.");
 if(i.blocked.length||i.locks.length||i.containerLocks.length||
    i.claims.some(c=>c.outcome==="failed"||c.outcome===null||
      c.acknowledged!==true||c.attentionRequired!==false))
  throw Error("Host preflight denied: unresolved or legacy ambiguous local recovery evidence.");
 return i;
}
export function evaluateSignedDockerHostReadOnly({
 pins,contextBefore,contextAfter,endpointBefore,endpointAfter,
 infoBefore,infoAfter,targetBefore,targetAfter,containerId,operation,
 inventoryBefore,inventoryAfter,cli,config
}){
 if(!pins||!FULL.test(containerId||"")||!OP.has(operation))
  throw Error("Host preflight needs a single exact target and allowed lifecycle operation.");
 if(cli?.hashVerified!==true||cli?.rootOwned!==true||
    cli?.symlinkFree!==true||!FULL.test(cli.sha256||"")||
    config?.completeTreeVerified!==true||config?.rootOwned!==true||
    config?.onlyOneLocalContext!==true||!FULL.test(config.sha256||"")||
    config.context!==pins.context||config.endpoint!==pins.host)
  throw Error("Host preflight needs approved, rechecked executable and sealed client configuration.");
 const a=safeInventory(inventoryBefore),b=safeInventory(inventoryAfter);
 if(a.inventorySha256!==b.inventorySha256||
    a.fileCount!==b.fileCount||
    JSON.stringify(a.claims)!==JSON.stringify(b.claims)||
    JSON.stringify(a.locks)!==JSON.stringify(b.locks)||
    JSON.stringify(a.containerLocks)!==JSON.stringify(b.containerLocks))
  throw Error("Host recovery history changed between read-only observations.");
 for(const [name,host,info] of [
  [contextBefore,endpointBefore,infoBefore],
  [contextAfter,endpointAfter,infoAfter]
 ]){
  validateSignedAgentEngineObserved({
   pins,context:name,endpoint:host,info
  });
 }
 if(infoBefore.ID!==infoAfter.ID||
    JSON.stringify(infoBefore.SecurityOptions)!==JSON.stringify(infoAfter.SecurityOptions)||
    JSON.stringify(infoBefore.Swarm)!==JSON.stringify(infoAfter.Swarm))
  throw Error("Rootless Docker daemon identity or security options changed during preflight.");
 validateSignedAgentTarget(targetBefore,containerId,operation,pins);
 validateSignedAgentTarget(targetAfter,containerId,operation,pins);
 assertSignedAgentPreMutationUnchanged(
  targetBefore,targetAfter,containerId,operation,pins
 );
 const policy=fingerprintLabContainer(targetAfter,containerId);
 if(policy.policySha256!==pins.policySha256)
  throw Error("Approved disposable target policy digest changed.");
 // Never output raw Docker info/inspect, socket addresses, commands or secrets.
 const evidence={
  schema:"eternyx-docker-readonly-host-preflight-v1",
  operatorTargetSha256:digest("ETERNYX_DOCKER_HOST_TARGET_V1\n"+containerId),
  approvedContextSha256:digest("ETERNYX_DOCKER_HOST_CONTEXT_V1\n"+pins.context),
  approvedDaemonIdSha256:pins.daemonIdSha256,
  approvedImageSha256:pins.imageSha256,
  approvedPolicySha256:pins.policySha256,
  observedPolicySha256:policy.policySha256,
  approvedClientSha256:cli.sha256,
  approvedConfigManifestSha256:config.sha256,
  localHistorySha256:b.inventorySha256,
  observationOperation:operation,
  observedTargetStatus:targetAfter.State.Status,
  fullRecoveryInventoryVerified:true,
  twoReadOnlyDaemonAndTargetObservations:true,
  pinnedLocalClientAndUnixContextVerified:true,
  sandboxNetworkNoneObserved:true
 };
 return Object.freeze({
  ...evidence,
  evidenceSha256:digest("ETERNYX_DOCKER_HOST_READONLY_REPORT_V1\n"+JSON.stringify(evidence)),
  status:"read_only_local_observations_only",
  operatorSignoffRequired:true,
  independentHostIdentityVerified:false,
  independentPhysicalIsolationVerified:false,
  signedPermitVerified:false,
  serverRevocationVerified:false,
  realCrashRecoveryDrillVerified:false,
  productionDeploymentAuthorized:false,
  stagingDockerMutationAuthorized:false,
  dockerMutationExecuted:false,
  receiptIssued:false,
  autoRetryAuthorized:false,
  recoveryLocksAutomaticallyReleased:false
 });
}
