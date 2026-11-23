import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createProvenanceManifest } from "../src/lib/securityEvidenceProvenance.mjs";
import {
  HANDOFF_SCHEMA,HANDOFF_MAX_BYTES,parseHandoffManifest,validateHandoffManifest,
  canonicalHandoffBody,createEvidenceHandoff,verifyEvidenceHandoff,verifyLocalEvidenceAgainstHandoff,
} from "../src/lib/securityEvidenceHandoff.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const engagement={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner_id:owner};
const evidenceId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const content=new TextEncoder().encode("hello");
const observation={
 evidenceId,engagementId:engagement.id,ownerId:owner,
 sha256:"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
 mime:"text/plain",size:5,registeredAt:"2026-11-23T09:00:00Z",
 observedAt:"2026-11-23T10:00:00Z",
 comparison:{baseline:"first-observation",expected:"not-provided"},
};
const manifest=createProvenanceManifest(engagement,owner,[observation],[],"2026-11-23T10:10:00Z");
const details={
 handoffId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
 senderLabel:"Internal team",recipientLabel:"Review group",
 purpose:"Reconcile evidence metadata in the synthetic staging review.",
 expiresAt:"2026-11-28T10:00:00Z",
};
const now="2026-11-23T11:00:00Z";
const packet=()=>createEvidenceHandoff(manifest,details,{now,subtle:webcrypto.subtle});
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Wave 8 private SHA-256 manifest imports only exact supported metadata fields",()=>{
 assert.equal(parseHandoffManifest(JSON.stringify(manifest)).totalHashed,1);
 assert.throws(()=>validateHandoffManifest({...manifest,storage_path:"private/path"}),/unsupported/);
 assert.throws(()=>validateHandoffManifest({...manifest,totalHashed:5}),/actual observed hashes/);
 assert.throws(()=>validateHandoffManifest({...manifest,
   totalHashed:2,observations:[manifest.observations[0],manifest.observations[0]]}),/unique/);
 assert.throws(()=>validateHandoffManifest({...manifest,observations:[
  {...manifest.observations[0],bucket_path:"credential"}]}),/unsupported/);
 assert.throws(()=>parseHandoffManifest("x".repeat(HANDOFF_MAX_BYTES+1)),/128 KiB/);
});
test("packet checksum covers canonical body and remains consistent after top-level reordering",async()=>{
 const p=await packet();
 assert.equal(p.core.schema,HANDOFF_SCHEMA);
 assert.equal(p.checksum.hex.length,64);
 const reordered={checksum:p.checksum,core:p.core};
 const verified=await verifyEvidenceHandoff(JSON.stringify(reordered),{now,subtle:webcrypto.subtle});
 assert.equal(verified.observations,1);
 assert.equal(verified.externalChecksumMatched,null);
 assert.match(verified.warning,/not sender identity/);
 assert.equal(canonicalHandoffBody({b:2,a:1}),canonicalHandoffBody({a:1,b:2}));
 const withExpected=await verifyEvidenceHandoff(JSON.stringify(p),{now,subtle:webcrypto.subtle,
  expectedChecksum:p.checksum.hex});
 assert.equal(withExpected.externalChecksumMatched,true);
});
test("modified content cannot silently retain a valid packet checksum",async()=>{
 const p=await packet();
 await assert.rejects(()=>verifyEvidenceHandoff(JSON.stringify({...p,core:{...p.core,purpose:"Altered purpose for a separate unauthorized review."} }),{
  now,subtle:webcrypto.subtle}),/checksum mismatch/);
 await assert.rejects(()=>verifyEvidenceHandoff(JSON.stringify({...p,extra:"private_key"}),{
  now,subtle:webcrypto.subtle}),/unsupported/);
 await assert.rejects(()=>verifyEvidenceHandoff(JSON.stringify(p),{
  now:"2026-12-01T00:00:00Z",subtle:webcrypto.subtle}),/expired/);
 await assert.rejects(()=>createEvidenceHandoff(manifest,{...details,expiresAt:"2027-01-01T10:00:00Z"},
  {now,subtle:webcrypto.subtle}),/within 30 days/);
 const mismatched=await verifyEvidenceHandoff(JSON.stringify(p),{
  now,subtle:webcrypto.subtle,expectedChecksum:"f".repeat(64)});
 assert.equal(mismatched.externalChecksumMatched,false);
});
test("offline file bytes compare to recorded digest and reject missing or altered objects",async()=>{
 const verified=await verifyEvidenceHandoff(JSON.stringify(await packet()),{now,subtle:webcrypto.subtle});
 const matched=await verifyLocalEvidenceAgainstHandoff(verified,evidenceId,content,{subtle:webcrypto.subtle});
 assert.equal(matched.match,true);
 assert.match(matched.reason,/not proven/);
 const altered=await verifyLocalEvidenceAgainstHandoff(verified,evidenceId,
  new TextEncoder().encode("hallo"),{subtle:webcrypto.subtle});
 assert.equal(altered.match,false);
 const wrongSize=await verifyLocalEvidenceAgainstHandoff(verified,evidenceId,
  new Uint8Array(3),{subtle:webcrypto.subtle});
 assert.equal(wrongSize.match,false);
 await assert.rejects(()=>verifyLocalEvidenceAgainstHandoff(verified,
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",content,{subtle:webcrypto.subtle}),/not in this handoff/);
});
test("handoff package never contains private storage object names or raw file contents",async()=>{
 const p=await packet(),raw=JSON.stringify(p);
 assert.doesNotMatch(raw,/storage_path|objectPath|private-file\.txt|access_token|hello/);
 assert.match(raw,/Unsigned local checksum/);
});
test("protected handoff UI integrates local import, packet creation, verification, and byte matching without network calls",async()=>{
 const [page,app,hub,provenance]=await Promise.all([
  read("src/pages/SecurityEvidenceHandoff.tsx"),read("src/App.tsx"),
  read("src/pages/CybersecurityHub.tsx"),read("src/pages/SecurityEvidenceProvenance.tsx")]);
 assert.match(app,/path="\/cybersecurity\/evidence-handoff" element={<RequireAuth><SecurityEvidenceHandoff \/><\/RequireAuth>}/);
 assert.match(hub,/href: "\/cybersecurity\/evidence-handoff"/);
 assert.match(provenance,/Prepare evidence handoff/);
 for(const keyword of ["parseHandoffManifest","createEvidenceHandoff","verifyEvidenceHandoff",
   "verifyLocalEvidenceAgainstHandoff","file.arrayBuffer()","packet.checksum.hex","Download packet JSON"])
  assert.ok(page.includes(keyword),"Missing page boundary: "+keyword);
 assert.doesNotMatch(page,/supabase\.|storage\.from|service_role|fetch\(/);
});
test("two-account staging acceptance is explicit opt-in, GET-only, and blocks production identity",async()=>{
 const source=await read("scripts/security-evidence-staging-readonly.mjs");
 for(const term of ["ETERNYX_STAGING_ONLY","ETERNYX_PRODUCTION_PROJECT_REF",
  "auth/v1/user","rest/v1/pentest_evidence","storage/v1/object/authenticated/pentest-evidence"])
  assert.ok(source.includes(term));
 assert.doesNotMatch(source,/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
 assert.match(source,/method:"GET"/);
 const script=new URL("../scripts/security-evidence-staging-readonly.mjs",import.meta.url).pathname;
 const env={...process.env,ETERNYX_STAGING_ONLY:""};
 const check=spawnSync(process.execPath,[script,"--check-config"],{encoding:"utf8",env});
 assert.equal(check.status,2);
 const run=spawnSync(process.execPath,[script,"--run"],{encoding:"utf8",env});
 assert.equal(run.status,2);
 assert.match(run.stderr,/STAGING READ-ONLY BLOCKED/);
});
