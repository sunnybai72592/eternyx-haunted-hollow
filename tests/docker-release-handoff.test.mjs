import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DOCKER_FUNCTIONS,createDockerDeploymentManifestPin}
 from "../src/lib/dockerStagingDeploymentInventory.mjs";
import {prepareDockerReleaseCandidate,authorSignDockerCandidate,
 reviewerCountersignDockerCandidate,verifyDockerReleaseHandoff}
 from "../src/lib/dockerReleaseHandoff.mjs";
const REF="s".repeat(20),PROD="p".repeat(20),COMMIT="a".repeat(40);
const sha=value=>createHash("sha256").update(value).digest("hex");
function fixture(){
 const manifest={
  schema:"eternyx-docker-deployment-expectations-v1",
  stagingProjectRef:REF,productionProjectRef:PROD,
  releaseCommitSha:COMMIT,pinnedSourceSnapshotSha256:"b".repeat(64),
  expected:DOCKER_FUNCTIONS.map((route,i)=>({
   slug:route.slug,version:15+i,verifyJwt:route.verifyJwt,
   bundleSha256:"c".repeat(64)
  }))
 };
 const pinnedManifestSha256=createDockerDeploymentManifestPin(manifest);
 const parity={
  schema:"eternyx-docker-staging-evidence-review-v1",
  classification:"operator_evidence_consistent_manual_review_required",
  gitCommitSha:COMMIT,stagingHost:REF+".supabase.co",
  sourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  sourceMatchesPinnedCheckout:true,operatorSignatureVerified:true,
  hostedAuthProbeLinked:true,tenArtifactDigestsMatched:true,
  actualDeployedSourceParityVerified:false,stagingEvidenceIndependentlyVerified:false,
  realDockerHostAttested:false,productionDeploymentAuthorized:false,
  dockerExecutionAuthorized:false,humanSecurityApprovalRequired:true,
  note:"Synthetic local test fixture. No actual staging checks were performed."
 };
 const checks=manifest.expected.map(expected=>({
  slug:expected.slug,status:"ACTIVE",
  observedVersion:expected.version,expectedVersion:expected.version,
  versionMatches:true,verifyJwt:expected.verifyJwt,
  expectedVerifyJwt:expected.verifyJwt,jwtMatches:true,
  bundleDigestAvailable:true,bundleDigestPinned:true,
  pinnedBundleDigestMatches:true,passed:true
 }));
 const metadata={
  stagingProjectRef:REF,releaseCommitSha:COMMIT,
  pinnedSourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  checks:checks.map(c=>({
   slug:c.slug,version:c.observedVersion,verifyJwt:c.verifyJwt,
   bundleDigestAvailable:c.bundleDigestAvailable,
   bundleDigestPinned:c.bundleDigestPinned,
   pinnedBundleDigestMatches:c.pinnedBundleDigestMatches
  }))
 };
 const management={
  schema:"eternyx-docker-management-inventory-v1",
  scope:"read_only_staging_metadata",
  observedAt:new Date(Date.now()-30000).toISOString(),
  stagingProjectRef:REF,releaseCommitSha:COMMIT,
  pinnedSourceSnapshotSha256:manifest.pinnedSourceSnapshotSha256,
  pinnedManifestSha256,
  checks,metadataDigest:sha("ETERNYX_DOCKER_STAGING_DEPLOYED_METADATA_V1\n"+
   JSON.stringify(metadata)),
  passed:true,productionProjectCalled:false,mutationRequestsSent:false,
  remoteDockerCommandsIssued:false,remoteCodeBytesVerified:false,
  deployedSourceParityVerified:false,productionDeploymentAuthorized:false,
  stagingDockerExecutionAuthorized:false,independentHumanApprovalRequired:true,
  note:"Synthetic CI report, not a real staging observation."
 };
 return {
  parityBytes:Buffer.from(JSON.stringify(parity)),
  managementBytes:Buffer.from(JSON.stringify(management)),
  manifestBytes:Buffer.from(JSON.stringify(manifest)),
  pinnedManifestSha256
 };
}
const altered=(base,path,mutation)=>({
 ...base,[path]:Buffer.from(JSON.stringify(mutation(JSON.parse(base[path].toString("utf8")))))
});
function dual(f=fixture()){
 const author=generateKeyPairSync("ed25519");
 const reviewer=generateKeyPairSync("ed25519");
 const prepared=prepareDockerReleaseCandidate(f);
 const authored=authorSignDockerCandidate(prepared,author.privateKey);
 const attestation=reviewerCountersignDockerCandidate(authored,
  reviewer.privateKey,author.publicKey);
 return {f,author,reviewer,prepared,authored,attestation};
}
test("offline release candidate binds staging project, full git SHA and raw report file digests",()=>{
 const f=fixture();
 const candidate=prepareDockerReleaseCandidate(f);
 assert.equal(candidate.schema,"eternyx-docker-release-candidate-v1");
 assert.equal(candidate.gitCommitSha,COMMIT);
 assert.equal(candidate.stagingProjectRef,REF);
 assert.equal(candidate.productionProjectRef,PROD);
 assert.equal(candidate.evidence.parityReportSha256,sha(f.parityBytes));
 assert.equal(candidate.evidence.deploymentInventorySha256,sha(f.managementBytes));
 assert.equal(candidate.evidence.deploymentManifestSha256,sha(f.manifestBytes));
 assert.equal(candidate.allFunctionBundleDigestsPinned,true);
 assert.equal(candidate.productionDeploymentAuthorized,false);
 assert.equal(candidate.stagingDockerExecutionAuthorized,false);
});
test("actual two-key Ed25519 countersignature verifies same evidence without deployment authorization",()=>{
 const obj=dual();
 const verified=verifyDockerReleaseHandoff({
  attestation:obj.attestation,authorPublicKey:obj.author.publicKey,
  reviewerPublicKey:obj.reviewer.publicKey,...obj.f
 });
 assert.equal(verified.bothSignaturesVerified,true);
 assert.equal(verified.parityEvidenceDigestMatched,true);
 assert.equal(verified.deploymentMetadataDigestMatched,true);
 assert.equal(verified.manifestPinMatched,true);
 assert.equal(verified.allFourBundlesReportedPinned,true);
 assert.equal(verified.productionDeploymentAuthorized,false);
 assert.equal(verified.stagingDockerExecutionAuthorized,false);
 assert.equal(verified.deployedCodeBytesIndependentlyVerified,false);
 assert.equal(verified.signedReportsAuthenticityIndependentlyEstablished,false);
 assert.equal(verified.independentHumanSecurityApprovalRequired,true);
});
test("missing pinned function bundle digests are disallowed in high-assurance handoff",()=>{
 const f=fixture();
 const modified=altered(f,"manifestBytes",data=>{
  data.expected[0].bundleSha256=null;return data;
 });
 const withNewPin={...modified,pinnedManifestSha256:
  createDockerDeploymentManifestPin(JSON.parse(modified.manifestBytes))};
 const report=JSON.parse(withNewPin.managementBytes);
 report.pinnedManifestSha256=withNewPin.pinnedManifestSha256;
 const failed=altered(withNewPin,"managementBytes",()=>report);
 assert.throws(()=>prepareDockerReleaseCandidate(failed));
});
test("independent manifest, git commit, source snapshot and project pins prevent release swaps",()=>{
 const f=fixture();
 assert.throws(()=>prepareDockerReleaseCandidate({...f,pinnedManifestSha256:"0".repeat(64)}));
 for(const [key,transform] of [
  ["releaseCommitSha",v=>"f".repeat(40)],
  ["stagingProjectRef",v=>"q".repeat(20)],
  ["pinnedSourceSnapshotSha256",v=>"d".repeat(64)]
 ]){
  const changed=altered(f,"manifestBytes",data=>{data[key]=transform(data[key]);return data;});
  assert.throws(()=>prepareDockerReleaseCandidate(changed));
 }
 assert.throws(()=>prepareDockerReleaseCandidate(altered(f,"parityBytes",r=>({
  ...r,gitCommitSha:"d".repeat(40)
 }))));
});
test("fail closed on altered JWT route, version, inactive deployment and contradictory evidence flags",()=>{
 const f=fixture();
 for(const edit of [
  report=>{report.checks[0].verifyJwt=false;},
  report=>{report.checks[1].observedVersion+=1;},
  report=>{report.checks[2].status="DELETED";},
  report=>{report.checks[3].bundleDigestAvailable=false;},
  report=>{report.checks[0].pinnedBundleDigestMatches=false;},
  report=>{report.productionProjectCalled=true;},
  report=>{report.deployedSourceParityVerified=true;},
  report=>{report.checks.push({...report.checks[0]});}
 ]){
  const changed=altered(f,"managementBytes",m=>{edit(m);return m;});
  assert.throws(()=>prepareDockerReleaseCandidate(changed));
 }
});
test("recomputed metadata digest catches a forged green summary",()=>{
 const f=fixture();
 const malicious=altered(f,"managementBytes",m=>{
  m.metadataDigest="0".repeat(64);return m;
 });
 assert.throws(()=>prepareDockerReleaseCandidate(malicious),/digest/);
});
test("counter-signing refuses same key and invalid original author signature",()=>{
 const f=fixture(),author=generateKeyPairSync("ed25519");
 const candidate=prepareDockerReleaseCandidate(f);
 const signed=authorSignDockerCandidate(candidate,author.privateKey);
 assert.throws(()=>reviewerCountersignDockerCandidate(signed,
  author.privateKey,author.publicKey),/Same signing key/);
 const forged={...signed,authorSignature:"A".repeat(86)};
 assert.throws(()=>reviewerCountersignDockerCandidate(forged,
  generateKeyPairSync("ed25519").privateKey,author.publicKey));
});
test("verification rejects mismatched reviewer key, forged role, tampered signatures and edited report bytes",()=>{
 const d=dual();
 const opts={attestation:d.attestation,authorPublicKey:d.author.publicKey,
  reviewerPublicKey:d.reviewer.publicKey,...d.f};
 const wrong=generateKeyPairSync("ed25519");
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,reviewerPublicKey:wrong.publicKey}));
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,authorPublicKey:wrong.publicKey}));
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,
  reviewerPublicKey:d.author.publicKey}));
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,attestation:{
  ...opts.attestation,reviewerSignature:"A".repeat(86)
 }}));
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,attestation:{
  ...opts.attestation,candidate:{...opts.attestation.candidate,
   productionDeploymentAuthorized:true}
 }}));
 const changed=Buffer.concat([d.f.managementBytes,Buffer.from("\n")]);
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,managementBytes:changed}));
});
test("expired and future-dated deployment records cannot reuse old dual-signature approvals",()=>{
 const d=dual();
 const opts={attestation:d.attestation,authorPublicKey:d.author.publicKey,
  reviewerPublicKey:d.reviewer.publicKey,...d.f};
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,now:Date.now()+86400001}));
 assert.throws(()=>verifyDockerReleaseHandoff({...opts,now:Date.now()-340001}));
});
test("CLI end-to-end prepares, signs, countersigns and verifies with real owner-private files",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-release-handoff-"));
 const d=dual(); // Build actual compatible reports, but use separate signers in the CLI.
 const author=generateKeyPairSync("ed25519"),reviewer=generateKeyPairSync("ed25519");
 try{
  const path=(name)=>join(dir,name);
  const save=(name,data)=>{writeFileSync(path(name),data,{mode:0o600});chmodSync(path(name),0o600);};
  save("parity.json",d.f.parityBytes);
  save("inventory.json",d.f.managementBytes);
  save("manifest.json",d.f.manifestBytes);
  save("author.pem",author.privateKey.export({format:"pem",type:"pkcs8"}));
  save("reviewer.pem",reviewer.privateKey.export({format:"pem",type:"pkcs8"}));
  save("author.pub",author.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"));
  save("reviewer.pub",reviewer.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"));
  const cli=fileURLToPath(new URL("../scripts/docker-release-handoff.mjs",import.meta.url));
  const env={...process.env,ETERNYX_DOCKER_RELEASE_REVIEW_ENABLED:"true",
   ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256:d.f.pinnedManifestSha256,
   ETERNYX_DOCKER_STAGING_REF:REF,ETERNYX_DOCKER_PRODUCTION_REF:PROD,
   ETERNYX_DOCKER_APPROVED_COMMIT_SHA:COMMIT};
  const run=(args,envPatch={})=>spawnSync(process.execPath,[cli,...args],{
   encoding:"utf8",timeout:11000,env:{...env,...envPatch}});
  const prepared=run(["prepare",path("parity.json"),path("inventory.json"),path("manifest.json")]);
  assert.equal(prepared.status,0,prepared.stderr);save("candidate.json",prepared.stdout);
  const signed=run(["author",path("candidate.json"),path("author.pem")]);
  assert.equal(signed.status,0,signed.stderr);save("signed.json",signed.stdout);
  const approved=run(["countersign",path("signed.json"),path("reviewer.pem"),path("author.pub")]);
  assert.equal(approved.status,0,approved.stderr);save("dual.json",approved.stdout);
  const verify=run(["verify",path("dual.json"),path("author.pub"),
   path("reviewer.pub"),path("parity.json"),path("inventory.json"),path("manifest.json")]);
  assert.equal(verify.status,0,verify.stderr);
  assert.equal(JSON.parse(verify.stdout).productionDeploymentAuthorized,false);
  assert.equal(run(["verify",path("dual.json"),path("reviewer.pub"),
   path("author.pub"),path("parity.json"),path("inventory.json"),path("manifest.json")]).status,1);
  assert.equal(run(["prepare",path("parity.json"),path("inventory.json"),path("manifest.json")],
    {ETERNYX_DOCKER_RELEASE_REVIEW_ENABLED:"false"}).status,1);
  assert.equal(run(["prepare",path("parity.json"),path("inventory.json"),path("manifest.json")],
    {ETERNYX_DOCKER_APPROVED_COMMIT_SHA:"0".repeat(40)}).status,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("offline CLI has no mutation, deployment, Docker Engine or HTTP network code",()=>{
 const cli=new URL("../scripts/docker-release-handoff.mjs",import.meta.url);
 const source=(await import("node:fs")).readFileSync(cli,"utf8");
 assert.doesNotMatch(source,/fetch\(|execFileSync|spawnSync|Deno\.Command|docker\.sock|supabase functions deploy/);
 assert.match(source,/ETERNYX_DOCKER_RELEASE_REVIEW_ENABLED/);
});
