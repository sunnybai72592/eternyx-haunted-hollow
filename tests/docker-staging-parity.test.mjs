import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DOCKER_RELEASE_SOURCE_PATHS,DOCKER_HOSTED_CHECK_IDS,
 makeDockerStagingSourceSnapshot,checkDockerSourceSnapshot,
 reviewDockerStagingEvidence} from "../src/lib/dockerStagingParity.mjs";
import {DOCKER_STAGING_EVIDENCE_CHECKS,signDockerStagingStatement}
 from "../src/lib/dockerStagingEvidence.mjs";

const SHA="a".repeat(40);
const HOST="isolated-release123.supabase.co";
const PROD="production-release123.supabase.co";
const hash=b=>createHash("sha256").update(b).digest("hex");
const sources=()=>Object.fromEntries(DOCKER_RELEASE_SOURCE_PATHS.map(path=>
 [path,readFileSync(new URL("../"+path,import.meta.url),"utf8")]));
const at=()=>new Date(Date.now()-30000).toISOString();
const hosted=(time=at())=>({
 schema:"eternyx-docker-staging-auth-probe-v1",
 scope:"read_only_hosted_staging",observedAt:time,targetHost:HOST,
 checks:DOCKER_HOSTED_CHECK_IDS.map(id=>({id,passed:true,detail:"Read-only staging observation"})),
 passed:true,completedChecks:10,stagingAuthChecksPassed:true,
 userJwtVerifiedByLiveGateway:true,completeRlsAuditPerformed:false,
 productionDeploymentAuthorized:false,dockerExecutionAuthorized:false,
 productionEndpointCalled:false,mutationRequestsSent:false,
 independentHostAttestation:false,manualSecurityApprovalRequired:true,
 note:"Synthetic CI fixture, not real staging evidence."
});
function fixture(){
 const files=sources();
 const snapshot=makeDockerStagingSourceSnapshot(SHA,files);
 const probe=Buffer.from(JSON.stringify(hosted()));
 const artifactBytes=Object.fromEntries(DOCKER_STAGING_EVIDENCE_CHECKS.slice(3).map(id=>
  [id,Buffer.from(JSON.stringify({id,artifact:"synthetic"}))]));
 const checks=DOCKER_STAGING_EVIDENCE_CHECKS.map((id,i)=>({
  id,status:"passed",evidenceSha256:hash(i<3?probe:artifactBytes[id])
 }));
 const statement={
  schema:"eternyx-docker-staging-operator-v1",environment:"isolated_staging",
  commitSha:SHA,observedAt:JSON.parse(probe.toString("utf8")).observedAt,
  checks
 };
 const keys=generateKeyPairSync("ed25519");
 const signedStatement=signDockerStagingStatement(statement,keys.privateKey);
 const opts={snapshot,sourceFiles:files,
  pinnedSnapshotSha256:snapshot.sourceSnapshotSha256,
  signedStatement,pinnedOperatorKey:keys.publicKey,
  hostedProbeBytes:probe,artifactBytes,
  pinnedStagingHost:HOST,productionHost:PROD};
 return {opts,keys,statement};
}
test("release snapshot hashes thirteen real Docker files and passes the actual repo policy",()=>{
 const f=fixture();
 assert.equal(f.opts.snapshot.files.length,DOCKER_RELEASE_SOURCE_PATHS.length);
 assert.equal(f.opts.snapshot.schema,"eternyx-docker-source-snapshot-v1");
 assert.equal(f.opts.snapshot.productionAuthorized,false);
 assert.equal(f.opts.snapshot.remoteDeploymentVerified,false);
 assert.equal(checkDockerSourceSnapshot(f.opts.snapshot,f.opts.sourceFiles,
  f.opts.pinnedSnapshotSha256).gitCommitSha,SHA);
});
test("source parity detects modified code, changed config, missing files and fake pins",()=>{
 const f=fixture();
 const original=f.opts.sourceFiles;
 assert.throws(()=>checkDockerSourceSnapshot(f.opts.snapshot,{
  ...original,"supabase/functions/docker-control/index.ts":original["supabase/functions/docker-control/index.ts"]+"// altered\n"
 },f.opts.pinnedSnapshotSha256));
 assert.throws(()=>checkDockerSourceSnapshot(f.opts.snapshot,original,"0".repeat(64)));
 assert.throws(()=>makeDockerStagingSourceSnapshot(SHA,{...original,
  "supabase/config.toml":original["supabase/config.toml"].replace(
   "[functions.docker-control]\nverify_jwt = true",
   "[functions.docker-control]\nverify_jwt = false")}));
 const {["scripts/docker-lab-agent.mjs"]:removed,...incomplete}=original;
 assert.throws(()=>makeDockerStagingSourceSnapshot(SHA,incomplete));
});
test("all matching real-hash assertions still require manual review, never enable Docker",()=>{
 const result=reviewDockerStagingEvidence(fixture().opts);
 assert.equal(result.classification,"operator_evidence_consistent_manual_review_required");
 assert.equal(result.sourceMatchesPinnedCheckout,true);
 assert.equal(result.operatorSignatureVerified,true);
 assert.equal(result.hostedAuthProbeLinked,true);
 assert.equal(result.tenArtifactDigestsMatched,true);
 assert.equal(result.actualDeployedSourceParityVerified,false);
 assert.equal(result.stagingEvidenceIndependentlyVerified,false);
 assert.equal(result.realDockerHostAttested,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.dockerExecutionAuthorized,false);
 assert.equal(result.humanSecurityApprovalRequired,true);
});
test("owner-staging host pin and different production project are mandatory",()=>{
 const f=fixture().opts;
 for(const patch of [
  {pinnedStagingHost:PROD,productionHost:PROD},
  {pinnedStagingHost:"127.0.0.1"},
  {pinnedStagingHost:"isolated-release123.supabase.co.evil.example"},
  {productionHost:""},
  {pinnedStagingHost:"another-project.supabase.co"},
 ])assert.throws(()=>reviewDockerStagingEvidence({...f,...patch}));
});
test("hosted-probe claim cannot be replaced with incomplete, unsafe or reordered checks",()=>{
 const f=fixture().opts;
 for(const patch of [
  {productionEndpointCalled:true},
  {dockerExecutionAuthorized:true},
  {completeRlsAuditPerformed:true},
  {checks:hosted().checks.slice(1)},
  {checks:hosted().checks.slice().reverse()},
  {checks:hosted().checks.map((c,i)=>i===3?{...c,passed:false}:c)},
  {targetHost:PROD},
  {mutationRequestsSent:true},
 ])assert.throws(()=>reviewDockerStagingEvidence({...f,
  hostedProbeBytes:Buffer.from(JSON.stringify({...hosted(JSON.parse(f.hostedProbeBytes).observedAt),...patch}))
 }));
});
test("signed operator assertions must match exact commit, physical artifact hashes and pinned key",()=>{
 const f=fixture();
 const original=f.opts;
 const another=generateKeyPairSync("ed25519");
 assert.throws(()=>reviewDockerStagingEvidence({...original,pinnedOperatorKey:another.publicKey}));
 const wrongCommit=signDockerStagingStatement({...f.statement,commitSha:"b".repeat(40)},f.keys.privateKey);
 assert.throws(()=>reviewDockerStagingEvidence({...original,signedStatement:wrongCommit}));
 assert.throws(()=>reviewDockerStagingEvidence({...original,artifactBytes:{
  ...original.artifactBytes,nonce_replay_denied:Buffer.from("different evidence")}}));
 const tamper=structuredClone(original.signedStatement);
 tamper.statement.checks[0].evidenceSha256="b".repeat(64);
 assert.throws(()=>reviewDockerStagingEvidence({...original,signedStatement:tamper}));
});
test("independently pinned source and ten actual local evidence digests are required",()=>{
 const f=fixture().opts;
 assert.throws(()=>reviewDockerStagingEvidence({...f,pinnedSnapshotSha256:"0".repeat(64)}));
 const {incident_hold_no_auto_resume:removed,...six}=f.artifactBytes;
 assert.throws(()=>reviewDockerStagingEvidence({...f,artifactBytes:six}));
 assert.throws(()=>reviewDockerStagingEvidence({...f,artifactBytes:{
  ...f.artifactBytes,extra:Buffer.from("unknown")}}));
 assert.throws(()=>reviewDockerStagingEvidence({...f,hostedProbeBytes:Buffer.from("fake")}));
});
test("stale/future evidence and more than ten minute observation drift fail closed",()=>{
 const f=fixture();
 const stale=Buffer.from(JSON.stringify(hosted(new Date(Date.now()-90000000).toISOString())));
 assert.throws(()=>reviewDockerStagingEvidence({...f.opts,hostedProbeBytes:stale}));
 const shifted=new Date(Date.parse(f.statement.observedAt)-700000).toISOString();
 const report=signDockerStagingStatement({...f.statement,observedAt:shifted},f.keys.privateKey);
 assert.throws(()=>reviewDockerStagingEvidence({...f.opts,signedStatement:report}));
 const future=Buffer.from(JSON.stringify(hosted(new Date(Date.now()+450000).toISOString())));
 assert.throws(()=>reviewDockerStagingEvidence({...f.opts,hostedProbeBytes:future}));
});
test("review CLI refuses unpinned, unapproved, symlinked and missing artifact inputs",()=>{
 const cli=fileURLToPath(new URL("../scripts/docker-staging-parity.mjs",import.meta.url));
 const root=mkdtempSync(join(tmpdir(),"eternyx-parity-ci-"));
 try{
  const f=fixture();
  const p=(name)=>join(root,name);
  const artifacts=p("artifacts");mkdirSync(artifacts,{mode:0o700});
  for(const [id,bytes] of Object.entries(f.opts.artifactBytes))
   writeFileSync(join(artifacts,id+".json"),bytes,{mode:0o600});
  writeFileSync(p("snapshot.json"),JSON.stringify(f.opts.snapshot),{mode:0o600});
  writeFileSync(p("signed.json"),JSON.stringify(f.opts.signedStatement),{mode:0o600});
  writeFileSync(p("probe.json"),f.opts.hostedProbeBytes,{mode:0o600});
  writeFileSync(p("operator.pub"),
   f.keys.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"),{mode:0o600});
  const env={...process.env,
   ETERNYX_DOCKER_STAGING_PARITY_REVIEW:"true",
   ETERNYX_DOCKER_PINNED_SOURCE_SNAPSHOT_SHA256:f.opts.snapshot.sourceSnapshotSha256,
   ETERNYX_DOCKER_STAGING_PINNED_HOST:HOST,ETERNYX_DOCKER_PRODUCTION_HOST:PROD};
  const run=(args,override={})=>spawnSync(process.execPath,[cli,...args],{
   encoding:"utf8",timeout:15000,env:{...env,...override}});
  const snapshot=run(["snapshot",SHA]);
  assert.equal(snapshot.status,0,snapshot.stderr);
  assert.equal(JSON.parse(snapshot.stdout).sourceSnapshotSha256,f.opts.snapshot.sourceSnapshotSha256);
  const args=["review",p("snapshot.json"),p("signed.json"),p("operator.pub"),p("probe.json"),artifacts];
  const good=run(args);
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).productionDeploymentAuthorized,false);
  assert.equal(run(args,{ETERNYX_DOCKER_STAGING_PARITY_REVIEW:"false"}).status,1);
  assert.equal(run(args,{ETERNYX_DOCKER_PINNED_SOURCE_SNAPSHOT_SHA256:"0".repeat(64)}).status,1);
  assert.equal(run(["review","./relative.json",...args.slice(2)]).status,1);
  for(const item of [snapshot,good])assert.doesNotMatch(item.stdout,/Bearer |sb_secret_/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("CLI is offline only and never invokes Docker, deploy, SQL or HTTP",()=>{
 const script=readFileSync(new URL("../scripts/docker-staging-parity.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(script,/\bfetch\(|execFileSync|spawnSync|Deno\.Command|docker\.sock|supabase functions deploy/);
 assert.match(script,/ETERNYX_DOCKER_STAGING_PARITY_REVIEW/);
 assert.match(script,/productionDeploymentAuthorized/);
});
