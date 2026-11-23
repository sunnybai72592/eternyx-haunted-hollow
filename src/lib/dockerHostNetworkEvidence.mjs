// Real operator-host network evidence gate. This is an on-host OS observation,
// not physical isolation proof or authorization to dispatch any Docker job.
import {createHash} from "node:crypto";

const SHA=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const digest=s=>createHash("sha256").update(s).digest("hex");
const forbiddenDestination=d=>["default","0.0.0.0/0","::/0"].includes(d);
function routes(raw,family){
 if(typeof raw!=="string"||raw.length>65536)throw Error("Unbounded host route inspection.");
 let r;
 try{r=JSON.parse(raw);}catch{throw Error("Host routes are not valid JSON.");}
 if(!Array.isArray(r)||r.length>256||r.some(x=>!x||typeof x!=="object"||Array.isArray(x)))
  throw Error("Incomplete or invalid host routing table.");
 for(const entry of r){
  if(typeof entry.dst!=="string"||entry.dst.length===0)
   throw Error("Uninterpretable host route.");
  if(forbiddenDestination(entry.dst))
   throw Error("Default gateway exists on the isolated host.");
  if(entry.type==="blackhole"||entry.type==="unreachable"||entry.type==="prohibit")continue;
  if(entry.gateway!==undefined && typeof entry.gateway!=="string")
   throw Error("Uninterpretable route gateway.");
 }
 return {family,raw:r};
}
export function validateHostRouteEvidence(v4,v6){
 const r4=routes(v4,"ipv4"),r6=routes(v6,"ipv6");
 return {
  routeTablesReadable:true,
  noDefaultRoutesObserved:true,
  routeSnapshotSha256:digest("ETERNYX_DOCKER_HOST_ROUTE_TABLES_V1\n"+JSON.stringify([r4,r6])),
  routeCount:r4.raw.length+r6.raw.length
 };
}
export function buildDockerHostNetworkEvidence({
 observation,firstRoutes,secondRoutes,
 forwardingV4,forwardingV6,commitSha,expectedCommitSha,gitDirty,
 now=new Date().toISOString()
}){
 if(!observation||observation.schema!=="eternyx-docker-host-readonly-observation-v1"||
  observation.scope!=="operator_initiated_local_unix_socket_read_only"||
  observation.realDockerEngineReadOnlyContacted!==true||
  observation.daemonRootlessObserved!==true||
  observation.swarmInactiveObserved!==true||
  observation.managedTargetChecksPassed!==true||
  observation.networkNoneObserved!==true||
  observation.pinnedImageMatchesObserved!==true||
  observation.stableTwoInspections!==true||
  observation.unresolvedClaimsObserved!==false||
  observation.remoteLabExecutionEnabled!==false||
  observation.labContainerMutationPerformed!==false||
  observation.actualRemoteSignedDispatchTested!==false||
  observation.independentHostAttestation!==false||
  observation.externalNetworkIsolationProved!==false||
  observation.stagingDockerExecutionAuthorized!==false||
  observation.productionDeploymentAuthorized!==false||
  !HASH.test(observation.managedContainerPolicySha256||"")||
  !HASH.test(observation.daemonIdentitySha256||"")||
  !HASH.test(observation.socketEndpointSha256||"")||
  !HASH.test(observation.imageSha256||"")||
  !HASH.test(observation.containerId||"")||
  !Number.isSafeInteger(observation.journalClaimsChecked)||
  observation.journalClaimsChecked<0)
  throw Error("Docker rootless read-only host inspection did not pass.");
 if(!SHA.test(expectedCommitSha||"")||commitSha!==expectedCommitSha||gitDirty!==false)
  throw Error("Unapproved or modified on-host source tree.");
 const observationTime=Date.parse(observation.observedAt);
 const nowTime=Date.parse(now);
 if(!Number.isFinite(observationTime)||!Number.isFinite(nowTime)||
    Math.abs(nowTime-observationTime)>120000)
  throw Error("Stale or untrusted host observation timestamp.");
 if(forwardingV4.trim()!=="0"||forwardingV6.trim()!=="0")
  throw Error("Linux host IPv4/IPv6 forwarding must be disabled.");
 const first=validateHostRouteEvidence(firstRoutes.v4,firstRoutes.v6);
 const second=validateHostRouteEvidence(secondRoutes.v4,secondRoutes.v6);
 if(first.routeSnapshotSha256!==second.routeSnapshotSha256)
  throw Error("Host network routes changed during verification.");
 return {
  schema:"eternyx-docker-real-host-network-evidence-v1",
  scope:"operator_initiated_read_only_real_host",
  capturedAt:now,approvedSourceCommitSha:commitSha,
  daemonIdentitySha256:observation.daemonIdentitySha256,
  socketEndpointSha256:observation.socketEndpointSha256,
  containerId:observation.containerId,
  imageSha256:observation.imageSha256,
  managedContainerPolicySha256:observation.managedContainerPolicySha256,
  routeSnapshotSha256:first.routeSnapshotSha256,
  routeCount:first.routeCount,journalClaimsChecked:observation.journalClaimsChecked,
  rootlessEngineObserved:true,noDefaultRoutesObserved:true,
  kernelForwardingDisabledObserved:true,stableRouteSnapshots:true,
  containerPolicyStableObserved:true,realDockerEngineReadOnlyContacted:true,
  hostNetworkReachabilityActivelyTested:false,
  externalNetworkIsolationProved:false,independentHostAttestation:false,
  independentOperatorSiteReviewRequired:true,
  controlledCrashRecoveryTestPerformed:false,
  remoteSignedDispatchTested:false,labContainerMutationPerformed:false,
  stagingDockerExecutionAuthorized:false,productionDeploymentAuthorized:false
 };
}
