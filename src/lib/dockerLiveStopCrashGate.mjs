// Pure validation for an actual, operator-authorized, one-time disposable Docker
// stop+worker SIGKILL drill. No network, filesystem writes, or Docker calls.
import {verifyManagedTarget} from "./dockerOperatorUtils.mjs";
import {fingerprintLabContainer} from "./dockerLabPolicyDrift.mjs";

const HEX=/^[a-f0-9]{64}$/;
const requiredFalse=[
 "externalNetworkIsolationProved","independentHostAttestation",
 "hostNetworkReachabilityActivelyTested","controlledCrashRecoveryTestPerformed",
 "remoteSignedDispatchTested","labContainerMutationPerformed",
 "stagingDockerExecutionAuthorized","productionDeploymentAuthorized"
];
export function validateLiveStopHostEvidence(r,pins){
 if(!r||r.schema!=="eternyx-docker-real-host-network-evidence-v1"||
    r.scope!=="operator_initiated_read_only_real_host"||
    r.approvedSourceCommitSha!==pins.approvedSourceCommitSha||
    r.containerId!==pins.containerId||
    r.daemonIdentitySha256!==pins.daemonIdentitySha256||
    r.imageSha256!==pins.imageSha256||
    r.managedContainerPolicySha256!==pins.managedContainerPolicySha256||
    r.socketEndpointSha256!==pins.socketEndpointSha256||
    r.routeSnapshotSha256!==pins.routeSnapshotSha256||
    r.rootlessEngineObserved!==true||r.stableRouteSnapshots!==true||
    r.noDefaultRoutesObserved!==true||r.kernelForwardingDisabledObserved!==true||
    r.containerPolicyStableObserved!==true||r.realDockerEngineReadOnlyContacted!==true||
    r.independentOperatorSiteReviewRequired!==true||
    requiredFalse.some(k=>r[k]!==false)||
    !HEX.test(r.managedContainerPolicySha256||"")||
    !HEX.test(r.socketEndpointSha256||"")||
    !HEX.test(r.routeSnapshotSha256||"")||
    !Number.isSafeInteger(r.journalClaimsChecked)||r.journalClaimsChecked<0)
  throw Error("Real-host read-only acceptance evidence is insufficient for disposable stop.");
 const age=Date.now()-Date.parse(r.capturedAt);
 if(!Number.isFinite(age)||age<0||age>120000)
  throw Error("Live Docker evidence is stale.");
 return r;
}
export function validateLiveStopContainer(inspect,pins,expectedState){
 if(!["running","stopped"].includes(expectedState)||
    !pins||!HEX.test(pins.containerId||"")||
    !HEX.test(pins.imageSha256||"")||
    !HEX.test(pins.managedContainerPolicySha256||""))
  throw Error("Exact pinned container and expected stage required.");
 verifyManagedTarget(inspect,pins.containerId);
 if(inspect.Image!=="sha256:"+pins.imageSha256)
  throw Error("Actual Docker image does not match independently pinned image.");
 const policy=fingerprintLabContainer(inspect,pins.containerId);
 if(policy.policySha256!==pins.managedContainerPolicySha256)
  throw Error("Actual disposable target policy differs from approved baseline.");
 const nets=inspect?.NetworkSettings?.Networks;
 if(!nets||typeof nets!=="object"||Array.isArray(nets)||
    Object.keys(nets).some(n=>n!=="none"))
  throw Error("Container network metadata is unsafe.");
 const ports=inspect?.NetworkSettings?.Ports;
 if(ports!==undefined&&ports!==null&&(
  typeof ports!=="object"||Array.isArray(ports)||
  Object.values(ports).some(v=>v!==null&&!(Array.isArray(v)&&v.length===0))))
  throw Error("Published ports observed.");
 const running=inspect?.State?.Running,status=inspect?.State?.Status;
 if(expectedState==="running"){
  if(running!==true||status!=="running")
   throw Error("The disposable target must already be running for one-time stop.");
 }else if(running!==false||status!=="exited")
  throw Error("The disposable target did not reach the expected exited state.");
 return {containerId:pins.containerId,running,status,policySha256:policy.policySha256};
}
export function validateLiveStopNoDrift(before,after){
 if(!before||!after||[
  "approvedSourceCommitSha","containerId","daemonIdentitySha256","imageSha256",
  "managedContainerPolicySha256","socketEndpointSha256","routeSnapshotSha256",
  "journalClaimsChecked"
 ].some(k=>before[k]!==after[k]))
  throw Error("Live host identity, security policy or local journal inventory drifted.");
 if(after.realDockerEngineReadOnlyContacted!==true)throw Error("No second real Docker inspection.");
 return true;
}
