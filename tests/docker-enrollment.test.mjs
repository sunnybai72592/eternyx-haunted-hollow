import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseDockerEnrollmentRequest, makeEnrollmentMessage, decodeBase64url } from "../supabase/functions/_shared/docker-enrollment-contract.mjs";
const u="11111111-1111-4111-8111-111111111111",w="22222222-2222-4222-8222-222222222222",a="33333333-3333-4333-8333-333333333333";
const nonce=Buffer.alloc(32,7).toString("base64url");
const message=()=>makeEnrollmentMessage({userId:u,workspaceId:w,agentId:a,nonce,expiresAt:"2026-11-22T12:00:00.000Z"});
test("enrollment contract strictly rejects account spoofing and unknown operations",()=>{
  assert.deepEqual(parseDockerEnrollmentRequest({action:"list"}),{action:"list"});
  assert.equal(parseDockerEnrollmentRequest({action:"list",userId:u}),null);
  assert.equal(parseDockerEnrollmentRequest({action:"create_workspace",name:"  My Docker  "}).name,"My Docker");
  assert.equal(parseDockerEnrollmentRequest({action:"begin",workspaceId:w,name:"lab",publicKey:"a".repeat(43),ownerId:u}),null);
  assert.equal(parseDockerEnrollmentRequest({action:"verify",agentId:a,nonce,signature:"x".repeat(86),workspaceId:w}),null);
  assert.equal(parseDockerEnrollmentRequest({action:"remove",agentId:a}),null);
});
test("Ed25519 challenge binds owner workspace agent nonce expiry and refuses replay substitution",()=>{
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const proof=sign(null,Buffer.from(message()),privateKey);
  assert.equal(proof.length,64);
  assert.equal(verify(null,Buffer.from(message()),publicKey,proof),true);
  for(const changed of [
    {userId:"44444444-4444-4444-8444-444444444444"},
    {workspaceId:"55555555-5555-4555-8555-555555555555"},
    {agentId:"66666666-6666-4666-8666-666666666666"},
    {nonce:Buffer.alloc(32,8).toString("base64url")},
    {expiresAt:"2026-11-22T12:01:00.000Z"},
  ]){
    const altered=makeEnrollmentMessage({userId:u,workspaceId:w,agentId:a,nonce,expiresAt:"2026-11-22T12:00:00.000Z",...changed});
    assert.equal(verify(null,Buffer.from(altered),publicKey,proof),false);
  }
});
test("base64url inputs are canonical and exact length",()=>{
  assert.equal(decodeBase64url(nonce,32).length,32);
  for(const x of ["a".repeat(43)+"=","@".repeat(43),"a".repeat(41)])assert.throws(()=>decodeBase64url(x,32));
  assert.throws(()=>decodeBase64url(nonce,64));
});
test("migration enforces ownership and denies browser writes",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261123030000_docker_workspace_enrollment.sql",import.meta.url),"utf8");
  for(const table of ["docker_identity_workspaces","docker_agent_registrations","docker_agent_enrollment_events"]) {
    assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
    assert.match(sql,new RegExp("REVOKE ALL ON public\\."+table+" FROM PUBLIC, anon, authenticated"));
  }
  assert.match(sql,/REFERENCES public\.docker_identity_workspaces\(id, owner_id\)/);
  assert.match(sql,/GRANT SELECT ON public\.docker_agent_registrations TO authenticated/);
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.docker_agent_registrations TO authenticated/);
  assert.match(sql,/status='pending' AND nonce_sha256=p_nonce_hash/);
  assert.match(sql,/challenge_expires_at > pg_catalog.statement_timestamp\(\)/);
});
