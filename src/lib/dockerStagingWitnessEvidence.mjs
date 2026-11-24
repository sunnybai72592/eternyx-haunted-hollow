// Docker Phase 42: separate human-witness Ed25519 attestation over the exact
// Phase39 signed host preflight + Phase41 before/after lifecycle evidence.
// Reuse the Phase40 durable challenge ledger; NEVER treat a signature as proof
// of Docker execution, physical isolation, revocation, or release authority.
import {createHash,createPublicKey,sign,verify} from "node:crypto";
import {verifyDockerReadOnlyHostEvidence} from "./dockerSignedHostEvidenceReview.mjs";
import {verifyDockerStagingLifecyclePair}
 from "./dockerStagingLifecycleEvidence.mjs";
import {consumeDockerHostChallenge} from "./dockerHostChallengeLedger.mjs";

const SHA=b=>createHash("sha256").update(b).digest("hex");
const H=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9_-]{43}$/;
const S64=/^[A-Za-z0-9_-]{86}$/;
const DOMAIN="ETERNYX_DOCKER_STAGING_INDEPENDENT_WITNESS_V1\n";
const ACK="I separately witnessed the controlled staging review; this attests my statement only and authorizes no Docker action.";
const FLAGS=["physicalIsolationIndependentlyProven","executedActionCausalityProven",
 "signedPermitRevocationTested","crashRecoveryTested","receiptReconciled",
 "stagingMutationAuthorized","productionDeploymentAuthorized"];
const FIELDS=["schema","challenge","witnessedAt","originalHostBundleSha256",
 "originalBeforeSha256","originalAfterSha256","originalComparisonSha256",
 "independentHostExpectationsSha256","independentLifecycleExpectationsSha256",
 "witnessStatement",...FLAGS];
const SIGNED=[...FIELDS,"signature"];
const exact=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).join("|")===keys.join("|");
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&
 new Date(x).toISOString()===x;
function publicKey(input){
 if(typeof input!=="string"||!B64.test(input))
  throw Error("Pinned independent witness Ed25519 public key required.");
 const bytes=Buffer.from(input,"base64url");
 if(bytes.length!==32||bytes.toString("base64url")!==input)
  throw Error("Noncanonical witness public key.");
 return bytes;
}
function link({host,before,after,hostExpected,lifecycleExpected,hostPublic},now){
 const hostReview=verifyDockerReadOnlyHostEvidence(
  host,hostPublic,hostExpected,now);
 const comparison=verifyDockerStagingLifecyclePair(
  before,after,lifecycleExpected,now);
 const report=host.report;
 const mappings=[
  ["operatorTargetSha256","operatorTargetSha256"],
  ["approvedContextSha256","approvedContextSha256"],
  ["approvedDaemonIdSha256","approvedDaemonIdSha256"],
  ["approvedImageSha256","approvedImageSha256"],
  ["approvedPolicySha256","approvedPolicySha256"],
  ["approvedClientSha256","approvedClientSha256"],
  ["approvedConfigManifestSha256","approvedConfigManifestSha256"]
 ];
 if(host.challenge!==hostExpected.challenge||
    hostExpected.observationOperation!==lifecycleExpected.operation||
    report.observationOperation!==lifecycleExpected.operation||
    report.observedTargetStatus!==before.observedState.status||
    report.localHistorySha256!==before.localHistorySha256)
  throw Error("Signed baseline host preflight does not bind to the exact staging before capture.");
 for(const [h,l] of mappings){
  if(report[h]!==before[l]||report[h]!==after[l])
   throw Error("Staging witness inputs have inconsistent independently pinned host identity.");
 }
 const baseline=Date.parse(report.inspectedAt);
 const pre=Date.parse(before.inspectedAt),post=Date.parse(after.inspectedAt);
 if(pre<baseline||pre-baseline>120000||
    Date.parse(host.issuedAt)>pre+120000||
    post-pre>15*60000)
  throw Error("Host attestation and staging observations are not a contemporaneous ordered sequence.");
 if(!hostReview.signatureValid||
    !comparison.reportedLifecycleTransitionConsistent||
    comparison.originalBeforeSha256!==before.evidenceSha256||
    comparison.originalAfterSha256!==after.evidenceSha256)
  throw Error("Incomplete original signed baseline or lifecycle comparison.");
 return {comparison};
}
function canonicalBody(host,before,after,hostExpected,lifecycleExpected,
 compared,now){
 const body={
  schema:"eternyx-docker-staging-witness-signed-v1",
  challenge:host.challenge,
  witnessedAt:now.toISOString(),
  originalHostBundleSha256:SHA(JSON.stringify(host)),
  originalBeforeSha256:before.evidenceSha256,
  originalAfterSha256:after.evidenceSha256,
  originalComparisonSha256:compared.comparisonSha256,
  independentHostExpectationsSha256:SHA(JSON.stringify(hostExpected)),
  independentLifecycleExpectationsSha256:SHA(JSON.stringify(lifecycleExpected)),
  witnessStatement:ACK
 };
 for(const key of FLAGS)body[key]=false;
 return body;
}
function bytesToSign(body){return Buffer.from(DOMAIN+JSON.stringify(body));}
export function signDockerStagingWitnessEvidence({
 host,before,after,hostExpected,lifecycleExpected,hostPublic,
 witnessPrivateKey,acknowledged
},now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms)||acknowledged!==true)
  throw Error("A human must explicitly acknowledge the independent witness statement.");
 if(witnessPrivateKey?.asymmetricKeyType!=="ed25519"||
    witnessPrivateKey?.type!=="private")
  throw Error("Dedicated private Ed25519 witness key required.");
 const key=createPublicKey(witnessPrivateKey).export({format:"der",type:"spki"}).subarray(12);
 if(key.equals(publicKey(hostPublic)))
  throw Error("Independent witness may not reuse the signed host attestor key.");
 const checked=link({host,before,after,hostExpected,lifecycleExpected,hostPublic},now);
 const post=Date.parse(after.inspectedAt);
 if(ms<post||ms-post>60000)
  throw Error("Witness signature must follow staging observation within one minute.");
 const body=canonicalBody(host,before,after,hostExpected,lifecycleExpected,
  checked.comparison,now);
 return Object.freeze({...body,
  signature:sign(null,bytesToSign(body),witnessPrivateKey).toString("base64url")});
}
export function verifyDockerStagingWitnessEvidence({
 witness,host,before,after,hostExpected,lifecycleExpected,hostPublic,
 witnessPublic,witnessPublicKeySha256
},now=new Date()){
 const ms=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(ms)||!exact(witness,SIGNED)||
    witness.schema!=="eternyx-docker-staging-witness-signed-v1"||
    !H.test(witness.challenge||"")||!iso(witness.witnessedAt)||
    !FIELDS.slice(3,9).every(k=>H.test(witness[k]||""))||
    witness.witnessStatement!==ACK||
    !FLAGS.every(k=>witness[k]===false)||
    !S64.test(witness.signature||""))
  throw Error("Unrecognized or unsafe signed staging witness evidence.");
 const t=Date.parse(witness.witnessedAt);
 if(t>ms+120000||ms-t>15*60000||
    t<Date.parse(after?.inspectedAt)||t-Date.parse(after?.inspectedAt)>60000)
  throw Error("Witness evidence is stale, future-dated or did not follow observations.");
 const wp=publicKey(witnessPublic),hp=publicKey(hostPublic);
 if(wp.equals(hp)||!H.test(witnessPublicKeySha256||"")||
    SHA(wp)!==witnessPublicKeySha256)
  throw Error("Independent witness key differs from reviewer-approved identity or reuses host key.");
 const checked=link({host,before,after,hostExpected,lifecycleExpected,hostPublic},now);
 const expectedBody=canonicalBody(host,before,after,hostExpected,
  lifecycleExpected,checked.comparison,new Date(t));
 for(const key of FIELDS){
  if(witness[key]!==expectedBody[key])
   throw Error("Independent witness signature not bound to exact originally reviewed evidence: "+key);
 }
 const signature=Buffer.from(witness.signature,"base64url");
 if(signature.length!==64||signature.toString("base64url")!==witness.signature)
  throw Error("Noncanonical witness signature.");
 const pub=createPublicKey({key:Buffer.concat([
  Buffer.from("302a300506032b6570032100","hex"),wp
 ]),format:"der",type:"spki"});
 if(!verify(null,bytesToSign(expectedBody),pub,signature))
  throw Error("Independent witness Ed25519 signature invalid.");
 return Object.freeze({
  schema:"eternyx-docker-staging-witness-review-v1",
  originalHostSignatureValid:true,originalLifecycleComparisonValid:true,
  separatelyPinnedWitnessSignatureValid:true,
  witnessDistinctFromHostAttestor:true,
  witnessStatementAuthenticated:true,
  witnessBundleSha256:SHA(JSON.stringify(witness)),
  originalComparisonSha256:checked.comparison.comparisonSha256,
  independentHostIsolationProven:false,
  actionCausalityIndependentlyProven:false,
  stagingExecutionAuthorized:false,productionDeploymentAuthorized:false,
  permitRevocationDrillProven:false,crashRecoveryDrillProven:false,
  receiptReconciliationProven:false,
  reviewerOneTimeChallengeConsumed:false,
  independentOperatorApprovalRequired:true
 });
}
/** Irreversible review only AFTER all host/lifecycle/witness checks pass.
 * Phase40 O_EXCL enforces a single local ledger winner even under concurrency. */
export function verifyAndConsumeDockerStagingWitness(dir,input,now=new Date()){
 const checked=verifyDockerStagingWitnessEvidence(input,now);
 const consumed=consumeDockerHostChallenge(
  dir,input.host,input.hostPublic,input.hostExpected,now);
 if(!consumed.challengeConsumedExactlyOnce||!consumed.reviewerOwnedLedgerVerified)
  throw Error("Host challenge was not durably consumed exactly once.");
 return Object.freeze({
  ...checked,
  reviewerOneTimeChallengeConsumed:true,
  originalHostChallengeConsumptionSha256:consumed.durableConsumptionSha256,
  originalHostChallengeIssuanceSha256:consumed.originalIssuanceSha256,
  independentHostIsolationProven:false,
  stagingExecutionAuthorized:false,productionDeploymentAuthorized:false
 });
}
export const DOCKER_STAGING_WITNESS_ACKNOWLEDGMENT=ACK;
