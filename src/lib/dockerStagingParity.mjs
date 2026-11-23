// Offline staging release evidence reconciler for Docker. It cannot deploy,
// authorize Docker actions or verify remote server binaries independently.
import {createHash} from "node:crypto";
import {auditDockerDeploymentConfig} from "../../supabase/functions/_shared/docker-deployment-gate.mjs";
import {DOCKER_STAGING_EVIDENCE_CHECKS,verifyDockerStagingEnvelope} from "./dockerStagingEvidence.mjs";

export const DOCKER_RELEASE_SOURCE_PATHS=Object.freeze([
 "supabase/config.toml",
 "supabase/functions/docker-control/index.ts",
 "supabase/functions/docker-enrollment/index.ts",
 "supabase/functions/docker-heartbeat/index.ts",
 "supabase/functions/docker-command-dispatch/index.ts",
 "supabase/functions/_shared/docker-dispatch-handler.mjs",
 "supabase/functions/_shared/docker-owner-guard.mjs",
 "supabase/functions/_shared/docker-action-verifier.mjs",
 "supabase/functions/_shared/user-auth.ts",
 "supabase/functions/_shared/docker-deployment-gate.mjs",
 "scripts/docker-lab-agent.mjs",
 "src/lib/dockerHostedAuthProbe.mjs",
 "src/lib/dockerStagingEvidence.mjs"
]);
export const DOCKER_HOSTED_CHECK_IDS=Object.freeze([
 "docker-control_anonymous","docker-control_invalid",
 "docker-control_ownerA","docker-control_ownerB",
 "docker-enrollment_anonymous","docker-enrollment_invalid",
 "docker-enrollment_ownerA","docker-enrollment_ownerB",
 "docker-control_two_owner_isolation","docker-enrollment_two_owner_isolation"
]);
const HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const HOST=/^[a-z0-9-]{6,63}\.supabase\.co$/;
const exact=(v,keys)=>!!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
const sha=value=>createHash("sha256").update(value).digest("hex");
function checkedBytes(value){
 if(!(Buffer.isBuffer(value)||value instanceof Uint8Array)||
   value.byteLength<2||value.byteLength>262144)
   throw Error("Missing or oversized local release evidence.");
 return Buffer.from(value);
}
function auditInputs(files){
 const path=(name)=>files[name];
 return {
  config:path("supabase/config.toml"),
  ownerControl:path("supabase/functions/docker-control/index.ts"),
  enrollment:path("supabase/functions/docker-enrollment/index.ts"),
  heartbeat:path("supabase/functions/docker-heartbeat/index.ts"),
  dispatch:path("supabase/functions/docker-command-dispatch/index.ts"),
  dispatchHandler:path("supabase/functions/_shared/docker-dispatch-handler.mjs"),
  ownerGuard:path("supabase/functions/_shared/docker-owner-guard.mjs"),
  authHelper:path("supabase/functions/_shared/user-auth.ts"),
  agent:path("scripts/docker-lab-agent.mjs")
 };
}
export function makeDockerStagingSourceSnapshot(commitSha,files){
 if(!HEX40.test(commitSha||"")||!files||typeof files!=="object"||
   Array.isArray(files)||Object.keys(files).length!==DOCKER_RELEASE_SOURCE_PATHS.length||
   !DOCKER_RELEASE_SOURCE_PATHS.every(p=>typeof files[p]==="string"&&
      files[p].length>0&&files[p].length<=250000))
   throw Error("Incomplete or unpinned Docker release source snapshot.");
 const audit=auditDockerDeploymentConfig(auditInputs(files));
 if(!audit.passed)throw Error("Docker repository release security policy failed.");
 const payload={
  schema:"eternyx-docker-source-snapshot-v1",
  gitCommitSha:commitSha,
  scope:"local_checkout_source_only",
  files:DOCKER_RELEASE_SOURCE_PATHS.map(path=>({
    path,sha256:sha(Buffer.from(files[path],"utf8"))
  })),
  productionAuthorized:false,remoteDeploymentVerified:false
 };
 const sourceSnapshotSha256=sha("ETERNYX_DOCKER_SOURCE_SNAPSHOT_V1\n"+JSON.stringify(payload));
 return {...payload,sourceSnapshotSha256};
}
export function checkDockerSourceSnapshot(snapshot,files,pinnedSha256){
 if(!HEX64.test(pinnedSha256||"")||!exact(snapshot,[
   "schema","gitCommitSha","scope","files","productionAuthorized",
   "remoteDeploymentVerified","sourceSnapshotSha256"
 ]))throw Error("Pinned Docker checkout fingerprint is missing.");
 const current=makeDockerStagingSourceSnapshot(snapshot.gitCommitSha,files);
 if(JSON.stringify(snapshot)!==JSON.stringify(current)||
   current.sourceSnapshotSha256!==pinnedSha256)
   throw Error("Checked-out Docker source differs from independently pinned release snapshot.");
 return current;
}
function validateHostedReport(raw,host,now){
 const data=JSON.parse(checkedBytes(raw).toString("utf8"));
 if(!exact(data,["schema","scope","observedAt","targetHost","checks","passed",
   "completedChecks","stagingAuthChecksPassed","userJwtVerifiedByLiveGateway",
   "completeRlsAuditPerformed","productionDeploymentAuthorized",
   "dockerExecutionAuthorized","productionEndpointCalled","mutationRequestsSent",
   "independentHostAttestation","manualSecurityApprovalRequired","note"])||
  data.schema!=="eternyx-docker-staging-auth-probe-v1"||
  data.scope!=="read_only_hosted_staging"||data.targetHost!==host||
  data.passed!==true||data.completedChecks!==10||
  data.stagingAuthChecksPassed!==true||data.userJwtVerifiedByLiveGateway!==true||
  data.completeRlsAuditPerformed!==false||data.productionDeploymentAuthorized!==false||
  data.dockerExecutionAuthorized!==false||data.productionEndpointCalled!==false||
  data.mutationRequestsSent!==false||data.independentHostAttestation!==false||
  data.manualSecurityApprovalRequired!==true||typeof data.note!=="string"||
  !Array.isArray(data.checks)||data.checks.length!==DOCKER_HOSTED_CHECK_IDS.length||
  !data.checks.every((c,i)=>exact(c,["id","passed","detail"])&&
    c.id===DOCKER_HOSTED_CHECK_IDS[i]&&c.passed===true&&
    typeof c.detail==="string"&&c.detail.length<=200&&
    !/[\u0000-\u001f\u007f]/.test(c.detail)))
    throw Error("Hosted staging authentication evidence is incomplete or untrusted.");
 const stamp=Date.parse(data.observedAt);
 if(typeof data.observedAt!=="string"||!Number.isFinite(stamp)||
   new Date(stamp).toISOString()!==data.observedAt||
   stamp>now+300000||stamp<now-86400000)
    throw Error("Hosted staging authentication evidence is expired.");
 return data;
}
export function reviewDockerStagingEvidence({
 snapshot,sourceFiles,pinnedSnapshotSha256,signedStatement,pinnedOperatorKey,
 hostedProbeBytes,artifactBytes,pinnedStagingHost,productionHost,now=Date.now()
}){
 if(!Number.isFinite(now)||typeof pinnedStagingHost!=="string"||
   !HOST.test(pinnedStagingHost)||typeof productionHost!=="string"||
   !HOST.test(productionHost)||pinnedStagingHost===productionHost)
   throw Error("Independent staging and production project host pins are required.");
 const source=checkDockerSourceSnapshot(snapshot,sourceFiles,pinnedSnapshotSha256);
 const signed=verifyDockerStagingEnvelope(signedStatement,pinnedOperatorKey,now);
 if(signed.classification!=="operator_attested_review_candidate"||
    signed.statement?.environment==="production"||
    signed.commitSha!==source.gitCommitSha)
   throw Error("Signed operator statement is stale, incomplete or bound to another commit.");
 const probe=validateHostedReport(hostedProbeBytes,pinnedStagingHost,now);
 const statementTime=Date.parse(signedStatement.statement.observedAt);
 if(Math.abs(statementTime-Date.parse(probe.observedAt))>600000)
   throw Error("Signed staging statement and hosted probe timestamps do not align.");
 if(!artifactBytes||typeof artifactBytes!=="object"||Array.isArray(artifactBytes)||
   Object.keys(artifactBytes).length!==7)
   throw Error("Seven independent non-auth staging evidence artifacts are required.");
 const checks=signedStatement.statement.checks;
 for(let i=0;i<DOCKER_STAGING_EVIDENCE_CHECKS.length;i++){
   const check=checks[i];
   const bytes=i<3?checkedBytes(hostedProbeBytes):
      checkedBytes(artifactBytes[check.id]);
   if(sha(bytes)!==check.evidenceSha256)
     throw Error("Staging evidence artifact digest does not match signed operator statement.");
 }
 if(Object.keys(artifactBytes).some(name=>
    !DOCKER_STAGING_EVIDENCE_CHECKS.slice(3).includes(name)))
   throw Error("Unexpected staging evidence artifact name.");
 return {
   schema:"eternyx-docker-staging-evidence-review-v1",
   classification:"operator_evidence_consistent_manual_review_required",
   gitCommitSha:source.gitCommitSha,stagingHost:pinnedStagingHost,
   sourceSnapshotSha256:source.sourceSnapshotSha256,
   sourceMatchesPinnedCheckout:true,
   operatorSignatureVerified:true,hostedAuthProbeLinked:true,
   tenArtifactDigestsMatched:true,
   actualDeployedSourceParityVerified:false,
   stagingEvidenceIndependentlyVerified:false,
   realDockerHostAttested:false,
   productionDeploymentAuthorized:false,
   dockerExecutionAuthorized:false,
   humanSecurityApprovalRequired:true,
   note:"A matching release package is a review candidate, not trusted deployed-code proof or authorization."
 };
}
