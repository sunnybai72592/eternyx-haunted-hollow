import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  RUNTIME_ADDENDUM_ACK,canonicalRuntimeAddendumBytes,
  createSignedRuntimeAddendum,verifySignedRuntimeAddendum,
} from "../infrastructure/cyber-range/provider/firecracker-runtime-addendum.mjs";
import {requiredRuntimeObservationFiles} from
  "../infrastructure/cyber-range/provider/firecracker-runtime-observations.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const hash=x=>createHash("sha256").update(x).digest("hex");
const clone=x=>JSON.parse(JSON.stringify(x));
function keys(){
  const pair=generateKeyPairSync("ed25519");
  return {
    privatePem:pair.privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    publicPem:pair.publicKey.export({format:"pem",type:"spki"}).toString(),
    fingerprint:hash(pair.publicKey.export({format:"der",type:"spki"})),
  };
}
function fixture(mode="guest-and-watchdog",decision="follow-up-required"){
  const reviewer=keys(),operator=keys();
  const sidecars=Object.fromEntries(requiredRuntimeObservationFiles(mode)
    .map(({sidecar},i)=>[sidecar,Buffer.from(JSON.stringify({
      schemaVersion:1,kind:sidecar,fixtureOnly:true,index:i,
    })+"\n")]));
  const checkpoint={
    sessionId,mode,decision,checkpointSha256:"a".repeat(64),
    sourceHashesMatchSealedCheckpoint:true,
    externalChecksumMatched:true,privateKeyUsed:false,
    physicalHostAttested:false,publicLabsEnabled:false,
    productionReady:false,
  };
  const audit={
    sessionId,mode,
    checkedObservationKinds:requiredRuntimeObservationFiles(mode)
      .map(x=>x.kind),
    referencedTranscriptDigestsMatched:true,
    observationFlagsInternallyConsistent:true,
    sessionAndSystemdUnitMatched:true,captureWindowMatched:true,
    sidecarsIncludedInEarlierSignedReview:false,
    rawHostLogsSemanticallyVerified:false,
    independentSourceAuthenticityVerified:false,
    physicalHostAttested:false,productionReady:false,
  };
  return {
    checkpoint,audit,sidecars,
    operatorFingerprint:operator.fingerprint,
    reviewerFingerprint:reviewer.fingerprint,
    reviewerPublicPem:reviewer.publicPem,
    reviewerPrivatePem:reviewer.privatePem,
  };
}
function create(f,options={}){
  return createSignedRuntimeAddendum({...f,
    acknowledgment:RUNTIME_ADDENDUM_ACK,
    signedAt:"2026-11-23T15:00:00.000Z",...options});
}
function verify(f,created,options={}){
  const {reviewerPrivatePem,...safe}=f;
  return verifySignedRuntimeAddendum({...safe,report:created.report,
    externallyPinnedAddendumSha256:created.addendumSha256,...options});
}
test("three offline modes and three dispositions produce signed, fully pinned addenda",()=>{
  for(const mode of ["guest-vsock","watchdog-900","guest-and-watchdog"]){
    for(const decision of [
      "reviewed-for-archival","follow-up-required","evidence-rejected",
    ]){
      const f=fixture(mode,decision),created=create(f);
      assert.ok(created.bytes.equals(canonicalRuntimeAddendumBytes(created.report)));
      assert.equal(created.addendumSha256,hash(created.bytes));
      assert.equal(created.report.statement.decision,decision);
      assert.deepEqual(created.report.statement.sidecarDigests.map(x=>x.name),
        requiredRuntimeObservationFiles(mode).map(x=>x.sidecar));
      const result=verify(f,created);
      assert.equal(result.sessionId,sessionId);
      assert.equal(result.mode,mode);
      assert.equal(result.reviewerSignatureVerified,true);
      assert.equal(result.externallyPinnedCaseAndAddendumDigestsVerified,true);
      assert.equal(result.operatorSidecarsCryptographicallyBound,true);
      assert.equal(result.sidecarsIndependentlyAuthenticated,false);
      assert.equal(result.physicalHostAttested,false);
      assert.equal(result.productionReady,false);
      assert.equal(result.publicLabsEnabled,false);
    }
  }
});
test("separate manual approval and pinned Ed25519 reviewer private key required",()=>{
  const f=fixture();
  assert.throws(()=>createSignedRuntimeAddendum(f),/human approval/);
  assert.throws(()=>create(f,{acknowledgment:"I_AM_ADMIN"}),/human approval/);
  assert.throws(()=>create(f,{
    reviewerPrivatePem:keys().privatePem,
  }),/Wrong or substituted reviewer/);
  assert.throws(()=>create(f,{
    reviewerPublicPem:keys().publicPem,
  }),/not externally pinned/);
});
test("missing, modified, additional and oversized operator sidecars are rejected",()=>{
  const f=fixture(),created=create(f);
  for(const change of [
    x=>x["runtime-supervisor.json"]=Buffer.from("substituted\n"),
    x=>delete x["runtime-cgroup.json"],
    x=>x["runtime-guest.json"]=Buffer.alloc(0),
    x=>x["runtime-timeout.json"]=Buffer.alloc(4097,"a"),
    x=>x["unrelated-private-key.json"]=Buffer.from("forbidden\n"),
  ]){
    const sidecars={...f.sidecars};
    change(sidecars);
    assert.throws(()=>verify(f,created,{sidecars}));
  }
});
test("wrong checkpoint hash, changed review decision and foreign identity are refused",()=>{
  const f=fixture(),created=create(f);
  for(const checkpoint of [
    {...f.checkpoint,checkpointSha256:"b".repeat(64)},
    {...f.checkpoint,decision:"evidence-rejected"},
    {...f.checkpoint,sessionId:"c726a7dc-4e18-4113-bf51-d7147c581002"},
    {...f.checkpoint,mode:"guest-vsock"},
    {...f.checkpoint,externalChecksumMatched:false},
    {...f.checkpoint,sourceHashesMatchSealedCheckpoint:false},
  ]){
    assert.throws(()=>verify(f,created,{checkpoint}));
  }
  for(const modified of [
    {operatorFingerprint:"b".repeat(64)},
    {reviewerFingerprint:"b".repeat(64)},
    {reviewerPublicPem:keys().publicPem},
    {externallyPinnedAddendumSha256:"b".repeat(64)},
    {externallyPinnedAddendumSha256:undefined},
  ]){
    assert.throws(()=>verify(f,created,modified));
  }
});
test("all tampered claims and payload fields fail verification",()=>{
  const f=fixture(),created=create(f);
  for(const action of [
    r=>r.statement.classification="host-tpm-certified",
    r=>r.statement.schemaVersion=2,
    r=>r.statement.claims.physicalHostAttested=true,
    r=>r.statement.claims.publicLabsEnabled=true,
    r=>r.statement.claims.productionReady=true,
    r=>r.statement.claims.independentSourceAuthenticityVerified=true,
    r=>r.statement.claims.rawHostLogsSemanticallyVerified=true,
    r=>r.statement.claims.unexpected=true,
    r=>r.statement.sidecarDigests[0].sha256="f".repeat(64),
    r=>r.statement.sidecarDigests[0].name="not-approved.json",
    r=>r.statement.sidecarDigests[0].bytes=0,
    r=>r.statement.sidecarDigests.push({
      name:"extra",sha256:"a".repeat(64),bytes:100,
    }),
    r=>r.statement.signedAt="not-a-date",
    r=>r.statement.signedAt="2026-02-30T00:00:00.000Z",
    r=>r.statement.extra="claim",
    r=>r.signature="A".repeat(86),
    r=>r.extra="claim",
  ]){
    const changed=clone(created.report);
    action(changed);
    assert.throws(()=>verify(f,{...created,report:changed}));
  }
});
test("invalid and overstated earlier audit flags cannot create or verify an addendum",()=>{
  const f=fixture(),created=create(f);
  for(const changed of [
    {sidecarsIncludedInEarlierSignedReview:true},
    {rawHostLogsSemanticallyVerified:true},
    {independentSourceAuthenticityVerified:true},
    {physicalHostAttested:true},
    {productionReady:true},
    {referencedTranscriptDigestsMatched:false},
    {observationFlagsInternallyConsistent:false},
    {checkedObservationKinds:["supervisor"]},
    {sessionId:"c726a7dc-4e18-4113-bf51-d7147c581002"},
  ]){
    const audit={...f.audit,...changed};
    assert.throws(()=>create(f,{audit}));
    assert.throws(()=>verify(f,created,{audit}));
  }
});
test("the file-backed path verifies case checkpoint and uses exclusive local writes",async()=>{
  const [review,cli,wf]=await Promise.all([
    readFile(new URL(
      "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
      import.meta.url),"utf8"),
    readFile(new URL("../scripts/cyber-range-runtime-addendum.mjs",
      import.meta.url),"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(review,/verifyIndependentCaseCheckpoint/);
  assert.match(review,/auditOfflineRuntimeObservations/);
  assert.match(review,/verifySignedReviewDisposition/);
  assert.match(review,/O_EXCL/);
  assert.match(review,/RUNTIME_ADDENDUM_FILE/);
  assert.match(cli,/--sign/);
  assert.match(cli,/--verify/);
  assert.match(cli,/--addendum-sha/);
  assert.match(cli,/--checkpoint-sha/);
  assert.match(cli,/ETERNYX_RUNTIME_ADDENDUM_ACK/);
  assert.match(wf,/ctf-firecracker-runtime-addendum.test.mjs/);
  assert.doesNotMatch(cli,/fetch\(|createServer|child_process|startInstance|https?:\/\//);
  for(const args of [
    ["--sign","--confirm-offline-runtime-addendum","--session",sessionId,
      "--operator-sha","a".repeat(64),"--reviewer-sha","b".repeat(64),
      "--checkpoint-sha","c".repeat(64)],
    ["--verify","--session",sessionId,"--operator-sha","a".repeat(64),
      "--reviewer-sha","b".repeat(64),"--checkpoint-sha","c".repeat(64)],
  ]){
    const run=spawnSync(process.execPath,[
      fileURLToPath(new URL("../scripts/cyber-range-runtime-addendum.mjs",
        import.meta.url)),...args,
    ],{encoding:"utf8",env:{PATH:process.env.PATH}});
    assert.equal(run.status,1);
    assert.match(run.stderr,/Offline reviewer runtime addendum refused/);
  }
});
