// Phase 39: Ed25519 proof of ORIGINAL Phase 38 read-only host observations.
// Signing authenticates the attestor key + report bytes, NOT physical host
// isolation, a Docker mutation, operator release, or provenance of the OS.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {lstatSync,openSync,fstatSync,closeSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";

const HASH=/^[a-f0-9]{64}$/;
const PUB=/^[A-Za-z0-9_-]{43}$/;
const DOMAIN="ETERNYX_DOCKER_HOST_PREFLIGHT_SIGNED_V1\n";
const hash=x=>createHash("sha256").update(x).digest("hex");
const canonicalUtc=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&
 new Date(x).toISOString()===x;
const own=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).join("|")===keys.join("|");
const EVIDENCE=[
 "schema","operatorTargetSha256","approvedContextSha256",
 "approvedDaemonIdSha256","approvedImageSha256","approvedPolicySha256",
 "observedPolicySha256","approvedClientSha256","approvedConfigManifestSha256",
 "localHistorySha256","observationOperation","observedTargetStatus",
 "fullRecoveryInventoryVerified","twoReadOnlyDaemonAndTargetObservations",
 "pinnedLocalClientAndUnixContextVerified","sandboxNetworkNoneObserved"
];
const FALSES=[
 "independentHostIdentityVerified","independentPhysicalIsolationVerified",
 "signedPermitVerified","serverRevocationVerified","realCrashRecoveryDrillVerified",
 "productionDeploymentAuthorized","stagingDockerMutationAuthorized",
 "dockerMutationExecuted","receiptIssued","autoRetryAuthorized",
 "recoveryLocksAutomaticallyReleased"
];
const REPORT=[
 ...EVIDENCE,"evidenceSha256","status","operatorSignoffRequired",
 ...FALSES,"inspectedAt","readOnlyHostEvidenceSha256"
];
const EXPECTED=[
 "operatorTargetSha256","approvedContextSha256","approvedDaemonIdSha256",
 "approvedImageSha256","approvedPolicySha256","approvedClientSha256",
 "approvedConfigManifestSha256","observationOperation",
 "challenge","publicKeySha256"
];
const BODY=["schema","challenge","issuedAt","report"];
const BUNDLE=[...BODY,"signature"];

function checkReport(report,nowMs){
 if(!own(report,REPORT))throw Error("Signed host report contains missing, extra or reordered fields.");
 if(report.schema!=="eternyx-docker-readonly-host-preflight-v1"||
    report.status!=="read_only_local_observations_only"||
    report.operatorSignoffRequired!==true||
    !EVIDENCE.slice(1,10).every(k=>HASH.test(report[k]||""))||
    !["start","stop","restart"].includes(report.observationOperation)||
    !["running","created","exited"].includes(report.observedTargetStatus)||
    (report.observationOperation==="start"
      ?report.observedTargetStatus==="running"
      :report.observedTargetStatus!=="running")||
    !EVIDENCE.slice(12).every(k=>report[k]===true)||
    !FALSES.every(k=>report[k]===false)||
    !HASH.test(report.evidenceSha256||"")||
    !HASH.test(report.readOnlyHostEvidenceSha256||""))
  throw Error("Signed host report does not prove a strictly read-only original observation.");
 const e={};
 for(const key of EVIDENCE)e[key]=report[key];
 if(hash("ETERNYX_DOCKER_HOST_READONLY_REPORT_V1\n"+JSON.stringify(e))!==report.evidenceSha256||
    hash("ETERNYX_DOCKER_HOST_READONLY_OUTPUT_V1\n"+report.evidenceSha256)!==
      report.readOnlyHostEvidenceSha256)
  throw Error("Signed host report fails original Phase 38 evidence fingerprint.");
 if(report.observedPolicySha256!==report.approvedPolicySha256)
  throw Error("Signed host report indicates sandbox hardening drift.");
 if(!canonicalUtc(report.inspectedAt)||
    Date.parse(report.inspectedAt)>nowMs+120000||
    nowMs-Date.parse(report.inspectedAt)>15*60000)
  throw Error("Signed host report observation is expired or future-dated.");
 return true;
}
function checkChallenge(challenge){
 if(!HASH.test(challenge||""))throw Error("Independent 32-byte hex host-review challenge required.");
}
function publicRaw(input){
 if(typeof input!=="string")throw Error("Pinned attestor public key required.");
 const value=input.trim();
 if(!PUB.test(value))throw Error("Pinned attestor public key must be canonical Ed25519 base64url.");
 const bytes=Buffer.from(value,"base64url");
 if(bytes.length!==32||bytes.toString("base64url")!==value)
  throw Error("Pinned attestor public key is not canonical.");
 return bytes;
}
function signedMessage(body){
 return Buffer.from(DOMAIN+JSON.stringify(body),"utf8");
}
export function signDockerReadOnlyHostReport(report,challenge,privateKey,now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid host evidence time.");
 checkReport(report,ms);
 checkChallenge(challenge);
 if(!privateKey||privateKey.asymmetricKeyType!=="ed25519"||
    privateKey.type!=="private")
  throw Error("Dedicated Ed25519 host-attestor private key required.");
 const issuedAt=new Date(ms).toISOString();
 if(ms<Date.parse(report.inspectedAt)-120000||
    ms-Date.parse(report.inspectedAt)>60000)
  throw Error("Host report must be signed immediately after read-only observation.");
 const body={schema:"eternyx-docker-host-preflight-signed-v1",
  challenge,issuedAt,report};
 const signature=sign(null,signedMessage(body),privateKey).toString("base64url");
 return Object.freeze({...body,signature});
}
export function verifyDockerReadOnlyHostEvidence(bundle,publicKeyBase64url,
 expected,now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms))throw Error("Invalid independent reviewer time.");
 if(!own(bundle,BUNDLE)||bundle.schema!=="eternyx-docker-host-preflight-signed-v1")
  throw Error("Unrecognized or noncanonical signed host evidence format.");
 checkChallenge(bundle.challenge);
 if(!canonicalUtc(bundle.issuedAt)||
    Date.parse(bundle.issuedAt)>ms+120000||
    ms-Date.parse(bundle.issuedAt)>15*60000)
  throw Error("Signed host evidence is stale or future-dated.");
 checkReport(bundle.report,ms);
 if(Date.parse(bundle.issuedAt)<Date.parse(bundle.report.inspectedAt)-120000||
    Date.parse(bundle.issuedAt)-Date.parse(bundle.report.inspectedAt)>60000)
  throw Error("Host report was not signed promptly after inspection.");
 if(!own(expected,EXPECTED))throw Error("Independently retained reviewer expectations required.");
 const keyBytes=publicRaw(publicKeyBase64url);
 if(!HASH.test(expected.publicKeySha256||"")||
    hash(keyBytes)!==expected.publicKeySha256||
    !HASH.test(expected.challenge||"")||
    bundle.challenge!==expected.challenge)
  throw Error("Host evidence signing identity or independent reviewer challenge differs.");
 for(const key of EXPECTED.slice(0,7)){
  if(!HASH.test(expected[key]||"")||bundle.report[key]!==expected[key])
   throw Error("Signed host evidence differs from independently approved pin: "+key);
 }
 if(expected.observationOperation!==bundle.report.observationOperation)
  throw Error("Signed host evidence operation differs from reviewer expectations.");
 if(typeof bundle.signature!=="string"||
    !/^[A-Za-z0-9_-]{86}$/.test(bundle.signature))
  throw Error("Canonical Ed25519 host evidence signature required.");
 const signature=Buffer.from(bundle.signature,"base64url");
 if(signature.length!==64||signature.toString("base64url")!==bundle.signature)
  throw Error("Noncanonical host signature encoding.");
 const key=createPublicKey({key:Buffer.concat([
  Buffer.from("302a300506032b6570032100","hex"),keyBytes
 ]),format:"der",type:"spki"});
 const body={schema:bundle.schema,challenge:bundle.challenge,
  issuedAt:bundle.issuedAt,report:bundle.report};
 if(!verify(null,signedMessage(body),key,signature))
  throw Error("Host evidence Ed25519 signature verification failed.");
 return Object.freeze({
  schema:"eternyx-docker-host-evidence-review-v1",
  signatureValid:true,originalEvidenceDigestValid:true,
  independentlyPinnedKeyMatched:true,independentChallengeMatched:true,
  independentlyPinnedHostPolicyMatched:true,
  observationFreshAtReview:true,
  evidenceBundleSha256:hash(JSON.stringify(bundle)),
  originalReportSha256:bundle.report.evidenceSha256,
  reviewStatus:"attestor_signature_and_local_observations_only",
  physicalHostIsolationIndependentlyProven:false,
  rootlessEngineProvenByThirdParty:false,
  stagingMutationAuthorized:false,productionDeploymentAuthorized:false,
  serverRevocationTested:false,crashRecoveryTestedOnHost:false,
  dockerOperationExecuted:false,receiptAccepted:false,
  operatorSignoffRequired:true
 });
}
export function loadHostEvidencePrivateKey(path){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.includes("//")||path.split("/").some(x=>x==="."||x===".."))
  throw Error("Dedicated host-attestor private key needs canonical absolute path.");
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.size<32||st.size>8192||
    st.uid!==process.getuid()||(st.mode&0o077)!==0||st.nlink!==1)
  throw Error("Host-attestor private key must be owner-only and a real file.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const opened=fstatSync(fd);
  if(opened.ino!==st.ino||opened.dev!==st.dev||opened.size!==st.size)
   throw Error("Attestor key identity changed before read.");
  const raw=readFileSync(fd);
  const after=fstatSync(fd);
  if(raw.length!==st.size||after.mtimeMs!==st.mtimeMs||
     after.ctimeMs!==st.ctimeMs)
   throw Error("Attestor key changed during read.");
  let key;
  try{
   key=raw.subarray(0,10).toString()==="-----BEGIN"?
    createPrivateKey(raw):createPrivateKey({key:raw,format:"der",type:"pkcs8"});
  }catch{throw Error("Host attestor Ed25519 private key could not be decoded.");}
  if(key.asymmetricKeyType!=="ed25519")
   throw Error("Host attestation requires an Ed25519 private key.");
  return key;
 }finally{closeSync(fd);}
}
export const HOST_EVIDENCE_EXPECTED_KEYS=Object.freeze(EXPECTED.slice());
