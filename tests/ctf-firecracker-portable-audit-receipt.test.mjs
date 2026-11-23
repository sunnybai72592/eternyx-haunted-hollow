import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  ARCHIVE_RECEIPT_CLASS,createPortableOfflineAuditReceipt,
  portableArchiveBytes,verifyPortableOfflineAuditReceipt,
} from "../infrastructure/cyber-range/provider/firecracker-portable-audit-receipt.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const a="a".repeat(64),b="b".repeat(64),
  c="c".repeat(64),d="d".repeat(64);
const sha=x=>createHash("sha256").update(x).digest("hex");
const copy=x=>structuredClone(x);
const checks=[
  "originalOperatorSignature","secondReviewerSignature",
  "signedReviewerDisposition","exactSourceFileDigests",
  "structuredMetadataConsistency","externallyPinnedCaseCheckpoint",
  "operatorRuntimeConsistency","signedSupplementalRuntimeAddendum",
  "externallyPinnedSupplementalAddendum","wholeCaseSecondPassStable",
];
const proof=[
  "physical-kvm-host-source-authenticity",
  "cryptographic-guest-identity",
  "independent-image-provenance",
  "independent-host-log-semantics",
  "provider-enforced-public-lab-tenant-and-billing-controls",
];
const modes=["guest-vsock","watchdog-900","guest-and-watchdog"];
const decisions=["reviewed-for-archival","follow-up-required","evidence-rejected"];
function fixture(mode="guest-and-watchdog",
  decision="reviewed-for-archival",committed=true){
  const reasons=decision==="reviewed-for-archival"?[]:
    ["independent-host-source-not-established"];
  return {
    schemaVersion:1,
    classification:"verified-offline-file-review-only-not-hardware-attestation",
    sessionId,mode,decision,
    dispositionClassification:decision==="reviewed-for-archival"?
      "archival-file-review-only":decision,
    reasons,integrityChecks:Object.fromEntries(checks.map(k=>[k,true])),
    provenance:{
      importedWithCommittedJournal:committed,legacyManualStaging:!committed,
      signedSourceFilesVerified:committed?19:17,
      signedRuntimeSidecars:2+(mode.includes("guest")?1:0)+
        (mode.includes("watchdog")?1:0),
      operatorFingerprint:a,reviewerFingerprint:b,
      checkpointSha256:c,addendumSha256:d,
    },
    unresolvedIndependentProof:[...proof],
    privateSigningKeyRead:false,
    independentHostEvidenceVerified:false,
    physicalHostAttested:false,productionReady:false,
    publicLabsEnabled:false,
  };
}
const verify=(x,saved,external)=>verifyPortableOfflineAuditReceipt({
  savedBytes:saved,verifiedAudit:x,externallyPinnedReceiptSha256:external,
});

test("all three modes and all three decisions export deterministic metadata receipts",()=>{
  for(const mode of modes)for(const decision of decisions){
    const input=fixture(mode,decision);
    const out=createPortableOfflineAuditReceipt(input);
    assert.equal(out.receipt.classification,ARCHIVE_RECEIPT_CLASS);
    assert.equal(out.receipt.decision,decision);
    assert.equal(out.receipt.mode,mode);
    assert.equal(out.receiptSha256,sha(out.bytes));
    assert.ok(out.bytes.length<4096);
    assert.ok(out.bytes.equals(portableArchiveBytes(out.receipt)));
    const r=verify(input,out.bytes,out.receiptSha256);
    assert.equal(r.freshlyReverifiedCaseMatched,true);
    assert.equal(r.independentPinnedDigestMatched,true);
    assert.equal(r.originalEvidenceFilesCopied,false);
    assert.equal(r.physicalHostAttested,false);
    assert.equal(r.productionReady,false);
    assert.equal(r.publicLabsEnabled,false);
  }
});

test("legacy imported provenance is never silently changed to committed",()=>{
  const manual=fixture("guest-vsock","follow-up-required",false);
  const exported=createPortableOfflineAuditReceipt(manual);
  assert.equal(exported.receipt.importProvenance.legacyManualStaging,true);
  assert.equal(exported.receipt.importProvenance.committedImportJournal,false);
  const changed=fixture("guest-vsock","follow-up-required",true);
  assert.throws(()=>verify(changed,exported.bytes,exported.receiptSha256),
    /changed or external pin/);
});

test("property insertion ordering does not change archive bytes or SHA digest",()=>{
  const original=fixture();
  const altered=copy(original);
  altered.integrityChecks=Object.fromEntries(
    Object.entries(altered.integrityChecks).reverse());
  altered.provenance=Object.fromEntries(
    Object.entries(altered.provenance).reverse());
  const x=createPortableOfflineAuditReceipt(original);
  const y=createPortableOfflineAuditReceipt(altered);
  assert.deepEqual(x.bytes,y.bytes);
  assert.equal(x.receiptSha256,y.receiptSha256);
});

test("saved byte tampering, changed decision and alternate external pins fail",()=>{
  const original=fixture(),out=createPortableOfflineAuditReceipt(original);
  for(const bad of [
    "e".repeat(64),undefined,"not-hash",
  ]){
    assert.throws(()=>verify(original,out.bytes,bad));
  }
  for(const value of [
    Buffer.concat([out.bytes,Buffer.from("\n")]),
    Buffer.from(out.bytes.toString().trim()),
    Buffer.from(out.bytes.toString().replace(c,"e".repeat(64))),
    Buffer.from(out.bytes.toString().replace("reviewed-for-archival",
      "follow-up-required")),
    Buffer.alloc(4097,0x41),
    Buffer.alloc(0),
  ]){
    assert.throws(()=>verify(original,value,out.receiptSha256));
  }
  const newCase=fixture("watchdog-900");
  assert.throws(()=>verify(newCase,out.bytes,out.receiptSha256));
  const newer=fixture("guest-and-watchdog","evidence-rejected");
  assert.throws(()=>verify(newer,out.bytes,out.receiptSha256));
});

test("unknown top-level or nested fields and exaggerated readiness cannot leak",()=>{
  for(const mutate of [
    x=>x.extra="-----BEGIN PRIVATE KEY-----",
    x=>x.classification="hardware-certified",
    x=>x.productionReady=true,
    x=>x.publicLabsEnabled=true,
    x=>x.physicalHostAttested=true,
    x=>x.independentHostEvidenceVerified=true,
    x=>x.privateSigningKeyRead=true,
    x=>x.integrityChecks.unknown=true,
    x=>x.integrityChecks.originalOperatorSignature=false,
    x=>x.provenance.privateLog="/etc/eternyx-reviewer/secret",
    x=>x.provenance.operatorFingerprint="f".repeat(63),
    x=>x.provenance.reviewerFingerprint=x.provenance.operatorFingerprint,
    x=>x.provenance.legacyManualStaging=
      x.provenance.importedWithCommittedJournal,
    x=>x.unresolvedIndependentProof=[],
    x=>x.unresolvedIndependentProof.push("publicLabsEnabled"),
    x=>x.reasons=["-----BEGIN PRIVATE KEY-----"],
    x=>x.reasons=["other-documented-in-private-case"],
    x=>x.provenance.signedRuntimeSidecars=5,
    x=>x.provenance.signedSourceFilesVerified=500,
  ]){
    const input=fixture();
    mutate(input);
    assert.throws(()=>createPortableOfflineAuditReceipt(input));
  }
});

test("canonical archive schema refuses added keys, invalid claims and data types",()=>{
  const original=fixture("guest-and-watchdog","follow-up-required");
  const out=createPortableOfflineAuditReceipt(original);
  for(const modify of [
    x=>x.extra="untrusted",
    x=>x.signerPins.newKey="unapproved",
    x=>x.signerPins.reviewerSpkiSha256="x".repeat(64),
    x=>x.evidencePins.caseCheckpointSha256="e".repeat(63),
    x=>x.evidencePins.addendum="private",
    x=>x.reviewClassification="hardware-attested",
    x=>x.evidenceCounts.signedRuntimeSidecars=2,
    x=>x.importProvenance.legacyManualStaging=true,
    x=>x.verificationCoverage.originalOperatorSignature=false,
    x=>x.unresolvedIndependentProof=[],
    x=>x.trustBoundary.productionReady=true,
    x=>x.reasons=["not-a-controlled-reason"],
    x=>x.schemaVersion=4,
  ]){
    const altered=copy(out.receipt);
    modify(altered);
    assert.throws(()=>portableArchiveBytes(altered));
  }
});

test("receipt redacts raw host evidence, signing keys and private paths",()=>{
  const out=createPortableOfflineAuditReceipt(fixture());
  const raw=out.bytes.toString("utf8");
  for(const sensitive of [
    "BEGIN PRIVATE KEY","BEGIN PUBLIC KEY","/etc/",
    "/var/","supervisor-journal.txt","guest-challenge.txt",
    "operator-report.json","host-preflight.json",
    "rootfs contents","guest memory",
  ]){
    assert.ok(!raw.includes(sensitive),sensitive);
  }
  assert.match(raw,/not-hardware-attestation/);
  assert.match(raw,/"physicalHostAttested":false/);
  assert.match(raw,/"publicLabsEnabled":false/);
});

test("CLI uses stdin only for independently saved receipts and refuses invalid input",async()=>{
  const path=fileURLToPath(new URL(
    "../scripts/cyber-range-portable-audit.mjs",import.meta.url));
  const base=[
    "--session",sessionId,
    "--operator-sha",a,
    "--reviewer-sha",b,
    "--checkpoint-sha",c,
    "--addendum-sha",d,
  ];
  for(const x of [
    {args:["--emit",...base.slice(0,-2)]},
    {args:["--emit",...base,"--session",sessionId]},
    {args:["--verify",...base]},
    {args:["--verify",...base,"--archive-sha","not-hash"],input:"{}\n"},
    {args:["--verify",...base,"--archive-sha","e".repeat(64)],
      input:"{}\n"},
    {args:["--wrong",...base]},
  ]){
    const run=spawnSync(process.execPath,[path,...x.args],{
      input:x.input??"",encoding:"utf8",timeout:3000,
      env:{PATH:process.env.PATH},
    });
    assert.equal(run.status,1);
    assert.match(run.stderr,/Portable offline audit refused/);
    assert.doesNotMatch(run.stderr,/(BEGIN PRIVATE KEY|\/etc\/|\/var\/)/);
  }
  const [cli,workflow]=await Promise.all([
    readFile(path,"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(cli,/readBoundedStdin/);
  assert.match(cli,/auditCompleteIndependentReviewCase/);
  assert.match(cli,/externallyPinnedReceiptSha256/);
  assert.doesNotMatch(cli,/createServer|https?:\/\/|fetch\(|startInstance/);
  assert.match(workflow,/ctf-firecracker-portable-audit-receipt.test.mjs/);
});
