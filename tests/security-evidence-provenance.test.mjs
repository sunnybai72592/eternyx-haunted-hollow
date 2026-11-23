import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import {
  validatePrivateEvidenceMetadata, normalizeExpectedSha256,
  calculateSha256, comparisonStatus, hashOwnedEvidenceBytes,
  verifyInvestigationReferences, createProvenanceManifest,
  MAX_PROVENANCE_BYTES, PROVENANCE_SCHEMA,
} from "../src/lib/securityEvidenceProvenance.mjs";
import { INVESTIGATION_MARKER, createInvestigation } from "../src/lib/securityInvestigationUtils.mjs";
const owner="11111111-1111-4111-8111-111111111111";
const engagement={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner_id:owner,
 status:"authorized",authorization_attested:true,authorization_attested_at:"2026-11-23T10:00:00Z",
 scope_targets:["scope.example.test"],excluded_targets:[],
};
const evidenceId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const investigationId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const bytes=new TextEncoder().encode("hello");
const record={
 id:evidenceId,owner_id:owner,engagement_id:engagement.id,
 storage_path:owner+"/"+engagement.id+"/private-evidence.txt",
 file_size:bytes.byteLength,mime_type:"text/plain",
 file_name:"private-evidence.txt",created_at:"2026-11-23T10:00:00Z",
 description:"Private synthetic fixture",
};
const snapshot=createInvestigation({
 target:"scope.example.test",title:"Private investigation",
 priority:"high",status:"investigating",summary:"Human observation",
 investigator:"Analyst",timeline:[],actions:[],evidenceIds:[evidenceId],
 closureNote:"",createdAt:"2026-11-23T10:00:00Z",
},engagement,owner,[evidenceId]);
const investigationRecord={
 ...record,id:investigationId,description:INVESTIGATION_MARKER,
 mime_type:"application/json",
 file_size:new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
 storage_path:owner+"/"+engagement.id+"/investigation.json",
};
test("SHA-256 hashes the exact private bytes using cryptographic Web Crypto",async()=>{
 const actual=await calculateSha256(bytes,webcrypto.subtle);
 assert.equal(actual,"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
 assert.notEqual(await calculateSha256(new TextEncoder().encode("hellO"),webcrypto.subtle),actual);
 await assert.rejects(()=>calculateSha256(new Uint8Array(0),webcrypto.subtle),/empty/);
 await assert.rejects(()=>calculateSha256(new Uint8Array(MAX_PROVENANCE_BYTES+1),webcrypto.subtle),/limit/);
});
test("owner- and path-bound evidence requires matching mime, size and registered time",()=>{
 assert.equal(validatePrivateEvidenceMetadata(record,engagement,owner).size,5);
 assert.throws(()=>validatePrivateEvidenceMetadata({...record,owner_id:"22222222-2222-4222-8222-222222222222"},engagement,owner),/not owned/);
 assert.throws(()=>validatePrivateEvidenceMetadata({...record,storage_path:"other/path"},engagement,owner),/boundary/);
 assert.throws(()=>validatePrivateEvidenceMetadata({...record,storage_path:owner+"/"+engagement.id+"/../bad"},engagement,owner),/unsafe path/);
 assert.throws(()=>validatePrivateEvidenceMetadata({...record,file_size:MAX_PROVENANCE_BYTES+1},engagement,owner),/boundary/);
 assert.throws(()=>validatePrivateEvidenceMetadata({...record,mime_type:"application/octet-stream"},engagement,owner),/boundary/);
});
test("download byte count and user-supplied checksum must match actual SHA-256",async()=>{
 const expected="2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
 const first=await hashOwnedEvidenceBytes(bytes,record,engagement,owner,{subtle:webcrypto.subtle,observedAt:"2026-11-23T11:00:00Z"});
 assert.equal(first.sha256,expected);
 assert.equal(first.comparison.baseline,"first-observation");
 const repeat=await hashOwnedEvidenceBytes(bytes,record,engagement,owner,{subtle:webcrypto.subtle,baseline:first.sha256,expected});
 assert.equal(repeat.comparison.baseline,"match");assert.equal(repeat.comparison.expected,"match");
 assert.equal(comparisonStatus(expected,"f".repeat(64)).baseline,"mismatch");
 assert.equal(comparisonStatus(expected,null,"a".repeat(64)).expected,"mismatch");
 assert.throws(()=>normalizeExpectedSha256("not-a-hex"),/64 hexadecimal/);
 await assert.rejects(()=>hashOwnedEvidenceBytes(new Uint8Array([1]),record,engagement,owner,{subtle:webcrypto.subtle}),/byte count/);
});
test("private investigation references must be complete owned metadata, not same-target inference",()=>{
 const result=verifyInvestigationReferences(JSON.stringify(snapshot),investigationRecord,engagement,owner,[record]);
 assert.deepEqual(result.referencedIds,[evidenceId]);
 assert.match(result.statement,/not thereby authenticated/);
 assert.throws(()=>verifyInvestigationReferences(JSON.stringify(snapshot),investigationRecord,engagement,owner,[]),/missing/);
 assert.throws(()=>verifyInvestigationReferences(JSON.stringify(snapshot),investigationRecord,engagement,owner,
  [{...record,owner_id:"22222222-2222-4222-8222-222222222222"}]),/not owned/);
 assert.throws(()=>verifyInvestigationReferences(JSON.stringify(snapshot),record,engagement,owner,[record]),/investigation snapshot/);
});
test("deterministic manifest stores observations and checked references, never paths or evidence bodies",async()=>{
 const observation=await hashOwnedEvidenceBytes(bytes,record,engagement,owner,{subtle:webcrypto.subtle,observedAt:"2026-11-23T11:00:00Z"});
 const verified=verifyInvestigationReferences(JSON.stringify(snapshot),investigationRecord,engagement,owner,[record]);
 const manifest=createProvenanceManifest(engagement,owner,[observation],[verified],"2026-11-23T12:00:00Z");
 assert.equal(manifest.schema,PROVENANCE_SCHEMA);
 assert.equal(manifest.observations[0].sha256,observation.sha256);
 assert.equal(manifest.investigationReferences[0].referencedByteDigestsInThisExport,1);
 assert.match(manifest.limitations.join(" "),/not digitally signed/);
 assert.doesNotMatch(JSON.stringify(manifest),/private-evidence\.txt|storage_path|hello|objectPath/);
 assert.throws(()=>createProvenanceManifest(engagement,owner,[observation,observation]),/unique/);
 assert.throws(()=>createProvenanceManifest(engagement,owner,[{...observation,ownerId:"22222222-2222-4222-8222-222222222222"}]),/invalid owner/);
});
test("protected provenance page uses real private Supabase storage and account RLS",async()=>{
 const read=async path=>readFile(new URL("../"+path,import.meta.url),"utf8");
 const [page,hub,app]=await Promise.all([read("src/pages/SecurityEvidenceProvenance.tsx"),read("src/pages/CybersecurityHub.tsx"),read("src/App.tsx")]);
 assert.match(app,/path="\/cybersecurity\/evidence-provenance" element={<RequireAuth><SecurityEvidenceProvenance \/><\/RequireAuth>}/);
 assert.match(hub,/href: "\/cybersecurity\/evidence-provenance"/);
 assert.match(page,/from\("pentest_engagements"\)/);
 assert.match(page,/from\("pentest_evidence"\)/);
 assert.match(page,/from\("pentest_audit_events"\)/);
 assert.match(page,/from\("pentest-evidence"\)\.download/);
 assert.match(page,/hashOwnedEvidenceBytes/);
 assert.match(page,/verifyInvestigationReferences/);
 assert.match(page,/in\("id", parsed\.snapshot\.evidenceIds\)/);
 assert.match(page,/reviewToken\.current/);
 assert.match(page,/loadToken\.current/);
 assert.match(page,/createProvenanceManifest/);
 assert.match(page,/\\.range\(start, start \+ PAGE_SIZE - 1\)/);
 assert.doesNotMatch(page,/service_role|SERVICE_ROLE_KEY|VITE_SUPABASE_SECRET/);
});
