// Offline handoff of actual operator-collected Docker host reports.
// Signed bytes prove custody and review, never physical host authenticity.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";

const HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const sha=x=>createHash("sha256").update(x).digest("hex");
const exact=(v,k)=>v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===k.slice().sort().join(",");
const requireFalse=(v,fields)=>fields.every(k=>v[k]===false);
function bytes(v){
 if(!Buffer.isBuffer(v)&&!(v instanceof Uint8Array))throw Error("Evidence must be real file bytes.");
 if(v.length<10||v.length>32768)throw Error("Missing or oversized host evidence.");
 return Buffer.from(v);
}
function parse(v){let o;try{o=JSON.parse(bytes(v).toString("utf8"));}catch{throw Error("Invalid host evidence JSON.");}
 if(!o||typeof o!=="object"||Array.isArray(o))throw Error("Invalid host evidence object.");return o;
}
function timestamp(value,now){
 if(typeof value!=="string")throw Error("Missing canonical host observation time.");
 const t=Date.parse(value);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==value||t>now+300000||t<now-86400000)
  throw Error("Host observation outside one-day review window.");
 return t;
}
const PIN_KEYS=["approvedSourceCommitSha","daemonIdentitySha256","socketEndpointSha256",
 "containerId","imageSha256","managedContainerPolicySha256","routeSnapshotSha256"];
export function validateHostHandoffPins(pins){
 if(!exact(pins,PIN_KEYS)||!SHA.test(pins.approvedSourceCommitSha||"")||
   PIN_KEYS.slice(1).some(k=>!HEX.test(pins[k]||"")))
  throw Error("Independent exact host identity, route and source pins required.");
 return pins;
}
function checkBaseline(r,pins,now){
 if(r.schema!=="eternyx-docker-real-host-network-evidence-v1"||
    r.scope!=="operator_initiated_read_only_real_host"||
    r.approvedSourceCommitSha!==pins.approvedSourceCommitSha||
    r.daemonIdentitySha256!==pins.daemonIdentitySha256||
    r.socketEndpointSha256!==pins.socketEndpointSha256||
    r.containerId!==pins.containerId||
    r.imageSha256!==pins.imageSha256||
    r.managedContainerPolicySha256!==pins.managedContainerPolicySha256||
    r.routeSnapshotSha256!==pins.routeSnapshotSha256||
    !Number.isSafeInteger(r.journalClaimsChecked)||r.journalClaimsChecked<0||
    r.rootlessEngineObserved!==true||
    r.noDefaultRoutesObserved!==true||r.kernelForwardingDisabledObserved!==true||
    r.stableRouteSnapshots!==true||r.containerPolicyStableObserved!==true||
    r.realDockerEngineReadOnlyContacted!==true||
    r.independentOperatorSiteReviewRequired!==true||
    !requireFalse(r,["hostNetworkReachabilityActivelyTested","externalNetworkIsolationProved",
      "independentHostAttestation","controlledCrashRecoveryTestPerformed","remoteSignedDispatchTested",
      "labContainerMutationPerformed","stagingDockerExecutionAuthorized",
      "productionDeploymentAuthorized"]))
  throw Error("Host baseline failed strict read-only / approved-pins policy.");
 return timestamp(r.capturedAt,now);
}
function checkTriage(r,pins,now){
 if(r.schema!=="eternyx-docker-host-crash-triage-v1"||
    r.scope!=="operator_initiated_local_unix_socket_read_only_crash_triage"||
    r.approvedSourceCommitSha!==pins.approvedSourceCommitSha||
    r.daemonIdentitySha256!==pins.daemonIdentitySha256||
    r.socketEndpointSha256!==pins.socketEndpointSha256||
    r.containerId!==pins.containerId||r.imageSha256!==pins.imageSha256||
    r.managedContainerPolicySha256!==pins.managedContainerPolicySha256||
    r.stableHostRouteSnapshotSha256!==pins.routeSnapshotSha256||
    !Number.isSafeInteger(r.journalClaimsChecked)||r.journalClaimsChecked<1||
    !UUID.test(r.claimId||"")||!UUID.test(r.agentId||"")||
    !["start","stop","restart"].includes(r.claimOperation)||
    !["reserved_only","attempted_outcome_unknown","terminal_unacknowledged"].includes(r.claimJournalStage)||
    r.attemptedRecorded!==(r.claimJournalStage!=="reserved_only"&&
      !(r.claimJournalStage==="terminal_unacknowledged"&&r.recordedOutcome==="guard_denied"))||
    (r.claimJournalStage==="reserved_only"&&r.recordedOutcome!==null)||
    (r.claimJournalStage==="attempted_outcome_unknown"&&r.recordedOutcome!==null)||
    (r.claimJournalStage==="terminal_unacknowledged"&&
      !["completed","failed","guard_denied"].includes(r.recordedOutcome))||
    r.unresolvedClaimsObserved!==true||r.pinnedRootlessEngineObserved!==true||
    r.networkNoneObserved!==true||r.stableDoubleInspectObserved!==true||
    r.realDockerEngineReadOnlyContacted!==true||r.kernelForwardingDisabledObserved!==true||
    r.externalOperatorReviewRequired!==true||r.independentOperatorReviewRequired!==true||
    !requireFalse(r,["localMutationReexecuted","mutationOutcomeIndependentlyVerified",
      "automaticRetryAuthorized","receiptOnlyReplayAuthorized",
      "controlledCrashRecoveryTestPerformed","independentHostAttestation",
      "externalNetworkIsolationProved","productionDeploymentAuthorized",
      "stagingDockerExecutionAuthorized","actualCrashInjectedByThisCommand",
      "operatorProcessClearanceIndependentlyVerified"]))
  throw Error("Recovery triage failed the separate real-host read-only boundary.");
 return timestamp(r.observedAt,now);
}
export function prepareDockerHostCrashHandoff({baselineBytes,triageBytes,pins,now=Date.now()}){
 if(!Number.isFinite(now))throw Error("Invalid review clock.");
 validateHostHandoffPins(pins);
 const baseline=parse(baselineBytes),triage=parse(triageBytes);
 const a=checkBaseline(baseline,pins,now),b=checkTriage(triage,pins,now);
 if(b<a||b-a>86400000||b>now+300000||
    triage.journalClaimsChecked!==baseline.journalClaimsChecked+1)
  throw Error("Recovery evidence is not a consistent later single-claim observation.");
 const candidate={
  schema:"eternyx-docker-host-crash-evidence-candidate-v1",
  sourceCommitSha:pins.approvedSourceCommitSha,
  daemonIdentitySha256:pins.daemonIdentitySha256,
  socketEndpointSha256:pins.socketEndpointSha256,
  containerId:pins.containerId,imageSha256:pins.imageSha256,
  managedContainerPolicySha256:pins.managedContainerPolicySha256,
  routeSnapshotSha256:pins.routeSnapshotSha256,
  baselineObservedAt:baseline.capturedAt,triageObservedAt:triage.observedAt,
  claimId:triage.claimId,agentId:triage.agentId,
  claimOperation:triage.claimOperation,claimStage:triage.claimJournalStage,
  recordedOutcome:triage.recordedOutcome,
  baselineFileSha256:sha(bytes(baselineBytes)),triageFileSha256:sha(bytes(triageBytes)),
  localDockerMutationPerformedByReview:false,actualCrashWitnessedByReview:false,
  physicalHostIsolationIndependentlyVerified:false,
  claimResultIndependentlyVerified:false,remoteSignedReceiptVerified:false,
  automaticRetryAuthorized:false,stagingDockerExecutionAuthorized:false,
  productionDeploymentAuthorized:false,independentHumanSiteReviewRequired:true
 };
 return candidate;
}
const candidateDigest=c=>sha("ETERNYX_DOCKER_HOST_CRASH_HANDOFF_V1\n"+JSON.stringify(c));
const authorPayload=d=>Buffer.from("ETERNYX_DOCKER_HOST_CRASH_AUTHOR_V1\n"+d);
const reviewerPayload=(d,s)=>Buffer.from("ETERNYX_DOCKER_HOST_CRASH_REVIEWER_V1\n"+d+"\n"+s);
const key=(value,kind)=>{
 const k=value?.type===kind?value:
  kind==="private"?createPrivateKey(value):createPublicKey(value);
 if(k.asymmetricKeyType!=="ed25519")throw Error("Separate Ed25519 signing keys required.");
 return k;
};
const fp=k=>sha((k.type==="private"?createPublicKey(k):k).export({format:"der",type:"spki"}));
const decodedSignature=v=>{
 if(!SIG.test(v||""))throw Error("Noncanonical reviewer signature.");
 const sig=Buffer.from(v,"base64url");
 if(sig.length!==64||sig.toString("base64url")!==v)throw Error("Invalid Ed25519 signature.");
 return sig;
};
export function authorHostCrashEvidence(candidate,privateKey){
 if(!exact(candidate,["schema","sourceCommitSha","daemonIdentitySha256",
  "socketEndpointSha256","containerId","imageSha256","managedContainerPolicySha256",
  "routeSnapshotSha256","baselineObservedAt","triageObservedAt","claimId",
  "agentId","claimOperation","claimStage","recordedOutcome","baselineFileSha256",
  "triageFileSha256","localDockerMutationPerformedByReview",
  "actualCrashWitnessedByReview","physicalHostIsolationIndependentlyVerified",
  "claimResultIndependentlyVerified","remoteSignedReceiptVerified",
  "automaticRetryAuthorized","stagingDockerExecutionAuthorized",
  "productionDeploymentAuthorized","independentHumanSiteReviewRequired"])||
  candidate.schema!=="eternyx-docker-host-crash-evidence-candidate-v1"||
  !SHA.test(candidate.sourceCommitSha||"")||
  !HEX.test(candidate.baselineFileSha256||"")||
  !HEX.test(candidate.triageFileSha256||"")||
  candidate.independentHumanSiteReviewRequired!==true||
  !requireFalse(candidate,["localDockerMutationPerformedByReview",
   "actualCrashWitnessedByReview","physicalHostIsolationIndependentlyVerified",
   "claimResultIndependentlyVerified","remoteSignedReceiptVerified","automaticRetryAuthorized",
   "stagingDockerExecutionAuthorized","productionDeploymentAuthorized"]))
  throw Error("Host evidence candidate is incomplete or escalates authorization.");
 const d=candidateDigest(candidate);
 return {schema:"eternyx-docker-host-crash-authored-v1",candidate,candidateSha256:d,
  authorSignature:sign(null,authorPayload(d),key(privateKey,"private")).toString("base64url")};
}
export function countersignHostCrashEvidence(authored,reviewerPrivateKey,authorPublicKey){
 if(!exact(authored,["schema","candidate","candidateSha256","authorSignature"])||
    authored.schema!=="eternyx-docker-host-crash-authored-v1"||
    authored.candidateSha256!==candidateDigest(authored.candidate))
  throw Error("Invalid authored host evidence.");
 const author=key(authorPublicKey,"public");
 if(!verify(null,authorPayload(authored.candidateSha256),author,
   decodedSignature(authored.authorSignature)))throw Error("Host evidence author signature invalid.");
 const reviewer=key(reviewerPrivateKey,"private");
 if(fp(author)===fp(reviewer))throw Error("Host evidence reviewer cannot reuse author key.");
 return {...authored,schema:"eternyx-docker-host-crash-dual-review-v1",
  reviewerSignature:sign(null,reviewerPayload(authored.candidateSha256,authored.authorSignature),
   reviewer).toString("base64url")};
}
export function verifyHostCrashEvidence({packageBytes,baselineBytes,triageBytes,pins,
 authorPublicKey,reviewerPublicKey,now=Date.now()}){
 const p=parse(packageBytes);
 if(!exact(p,["schema","candidate","candidateSha256","authorSignature","reviewerSignature"])||
   p.schema!=="eternyx-docker-host-crash-dual-review-v1")
  throw Error("Invalid dual-review evidence envelope.");
 const recomputed=prepareDockerHostCrashHandoff({baselineBytes,triageBytes,pins,now});
 const d=candidateDigest(recomputed);
 if(p.candidateSha256!==d||JSON.stringify(p.candidate)!==JSON.stringify(recomputed))
  throw Error("Evidence changed since signing.");
 const a=key(authorPublicKey,"public"),r=key(reviewerPublicKey,"public");
 if(fp(a)===fp(r)||!verify(null,authorPayload(d),a,
   decodedSignature(p.authorSignature))||
   !verify(null,reviewerPayload(d,p.authorSignature),r,
   decodedSignature(p.reviewerSignature)))
  throw Error("Host evidence requires independent valid signing keys.");
 return {
  schema:"eternyx-docker-host-crash-handoff-review-v1",
  evidenceDigestsMatched:true,twoDistinctKeySignaturesVerified:true,
  sourceCommitSha:recomputed.sourceCommitSha,claimId:recomputed.claimId,
  candidateSha256:d,physicalIsolationIndependentlyEstablished:false,
  realCrashInjectionIndependentlyWitnessed:false,
  remoteReceiptVerified:false,automaticRetryAuthorized:false,
  stagingDockerExecutionAuthorized:false,productionDeploymentAuthorized:false,
  independentSiteReviewRequired:true
 };
}
