// Signed operator assertions about an isolated STAGING deployment.
// A signature authenticates a report, not the truth of its contents or a
// production deployment approval. This module has no deployment actions.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
export const DOCKER_STAGING_EVIDENCE_CHECKS=Object.freeze([
 "real_owner_jwt_authenticated","anonymous_owner_rejected","cross_owner_access_denied",
 "agent_signature_and_revocation","nonce_replay_denied",
 "server_permit_and_expiry","receipt_replay_and_conflicts",
 "incident_hold_no_auto_resume","host_network_and_socket_isolation",
 "production_execution_flags_off"
]);
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const B64SIG=/^[A-Za-z0-9_-]{86}$/;
const exact=(v,keys)=>!!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
export function validateDockerStagingStatement(value){
 if(!exact(value,["schema","environment","commitSha","observedAt","checks"])||
  value.schema!=="eternyx-docker-staging-operator-v1"||
  value.environment!=="isolated_staging"||!HEX40.test(value.commitSha||"")||
  typeof value.observedAt!=="string"||!Number.isFinite(Date.parse(value.observedAt))||
  new Date(value.observedAt).toISOString()!==value.observedAt||
  !Array.isArray(value.checks)||value.checks.length!==DOCKER_STAGING_EVIDENCE_CHECKS.length||
  !value.checks.every((check,i)=>exact(check,["id","status","evidenceSha256"])&&
    check.id===DOCKER_STAGING_EVIDENCE_CHECKS[i]&&
    ["passed","failed","not_run"].includes(check.status)&&
    (check.status==="passed"?HEX64.test(check.evidenceSha256||""):
     check.evidenceSha256===null)))
   throw Error("Invalid or incomplete staging operator statement.");
 return value;
}
const digest=statement=>createHash("sha256").update(
 "ETERNYX_DOCKER_STAGING_OPERATOR_V1\n"+
 JSON.stringify(validateDockerStagingStatement(statement))).digest("hex");
const message=hash=>Buffer.from("ETERNYX_DOCKER_STAGING_OPERATOR_SIGNATURE_V1\n"+hash);
export function signDockerStagingStatement(statement,privatePem){
 const privateKey=privatePem?.type==="private"?privatePem:createPrivateKey(privatePem);
 if(privateKey.asymmetricKeyType!=="ed25519")throw Error("Ed25519 signing key required.");
 const hash=digest(statement);
 return {version:1,statement,sha256:hash,
   signature:sign(null,message(hash),privateKey).toString("base64url")};
}
export function verifyDockerStagingEnvelope(envelope,pinnedPublicKey,now=Date.now()){
 if(!exact(envelope,["version","statement","sha256","signature"])||
   envelope.version!==1||!HEX64.test(envelope.sha256||"")||
   !B64SIG.test(envelope.signature||"")||!Number.isFinite(now))
   throw Error("Invalid signed staging report envelope.");
 const hash=digest(envelope.statement);
 if(hash!==envelope.sha256)throw Error("Signed staging evidence digest mismatch.");
 const key=pinnedPublicKey?.type==="public"?pinnedPublicKey:createPublicKey(pinnedPublicKey);
 if(key.asymmetricKeyType!=="ed25519")throw Error("Pinned Ed25519 public key required.");
 const bytes=Buffer.from(envelope.signature,"base64url");
 if(bytes.length!==64||bytes.toString("base64url")!==envelope.signature||
    !verify(null,message(hash),key,bytes))throw Error("Pinned operator signature was rejected.");
 const signedAt=Date.parse(envelope.statement.observedAt);
 const fresh=signedAt<=now+300000&&signedAt>=now-86400000;
 const missing=envelope.statement.checks.filter(x=>x.status!=="passed").map(x=>x.id);
 return {schema:"eternyx-docker-staging-review-v1",signatureVerified:true,
  signedByPinnedOperatorKey:true,stagingAssertionsComplete:missing.length===0,
  evidenceFresh:fresh,missingChecks:missing,commitSha:envelope.statement.commitSha,
  classification:fresh&&missing.length===0?"operator_attested_review_candidate":"incomplete_or_stale",
  actualStagingTestsIndependentlyVerified:false,manualSecurityReviewRequired:true,
  productionDeploymentAuthorized:false,stagingDockerExecutionAuthorized:false,
  note:"Operator-signed assertions only: evidence digests must be independently checked against actual staging artifacts."};
}
