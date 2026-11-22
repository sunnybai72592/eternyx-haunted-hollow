import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
import { parseAgentAction,agentActionMessage,parseLabPermit,labPermitMessage,bytesFromBase64url }
  from "../supabase/functions/_shared/docker-command-contract.mjs";
const id="33333333-3333-4333-8333-333333333333";
const claimId="22222222-2222-4222-8222-222222222222";
const requestId="44444444-4444-4444-8444-444444444444";
const nonce=randomBytes(32).toString("base64url");
function action(kind="claim"){
  return {kind,agentId:id,signedAt:"2026-11-22T20:00:00.000Z",nonce,
    claimId:kind==="claim"?null:claimId,outcome:kind==="receipt"?"completed":null,
    signature:"A".repeat(86)};
}
function permit(){return {agentId:id,claimId,requestId,operation:"stop",
  containerId:"a".repeat(64),issuedAt:"2026-11-22T20:00:00.000Z",
  expiresAt:"2026-11-22T20:00:15.000Z"};}
test("protocol rejects unlisted agent commands, malformed IDs and extra fields",()=>{
  assert.equal(parseAgentAction(action())?.kind,"claim");
  assert.equal(parseAgentAction(action("authorize"))?.kind,"authorize");
  assert.equal(parseAgentAction(action("receipt"))?.kind,"receipt");
  for(const bad of [
    {...action(),kind:"shell"},
    {...action(),claimId},
    {...action("authorize"),outcome:"completed"},
    {...action("receipt"),outcome:"executed"},
    {...action(),token:"secrets"},
    {...action(),agentId:"x"},
    {...action(),nonce:"bad"},
    {...action(),signedAt:"yesterday"},
  ])assert.equal(parseAgentAction(bad),null);
});
test("Ed25519 signatures bind agent actions and reject substitutions",()=>{
  const pair=generateKeyPairSync("ed25519");
  const valid=action("receipt");
  const signed=sign(null,Buffer.from(agentActionMessage(valid)),pair.privateKey);
  valid.signature=signed.toString("base64url");
  assert.equal(verify(null,Buffer.from(agentActionMessage(valid)),pair.publicKey,signed),true);
  for(const changes of [
    {kind:"authorize",outcome:null},{claimId:requestId},{nonce:randomBytes(32).toString("base64url")},
    {outcome:"failed"},{signedAt:"2026-11-22T20:00:01.000Z"},
  ]){
    assert.equal(verify(null,Buffer.from(agentActionMessage({...valid,...changes})),pair.publicKey,signed),false);
  }
});
test("server permit signature binds exact target, operation, agent and expiry",()=>{
  const pair=generateKeyPairSync("ed25519");
  const p=permit(),signature=sign(null,Buffer.from(labPermitMessage(p)),pair.privateKey);
  assert.equal(verify(null,Buffer.from(labPermitMessage(p)),pair.publicKey,signature),true);
  for(const change of [{agentId:requestId},{claimId:requestId},{requestId:claimId},
    {containerId:"b".repeat(64)},{operation:"restart"},{expiresAt:"2026-11-22T20:00:16.000Z"}]){
    assert.equal(verify(null,Buffer.from(labPermitMessage({...p,...change})),pair.publicKey,signature),false);
  }
  assert.equal(parseLabPermit({...p,operation:"exec"}),null);
  assert.equal(parseLabPermit({...p,expiresAt:"2026-11-22T20:01:00.000Z"}),null);
  assert.throws(()=>bytesFromBase64url(nonce+"=",32));
  assert.equal(bytesFromBase64url(nonce,32).length,32);
});
test("SQL claims are one-time, account bound, owner read only, fail closed",()=>{
  const file=readFileSync(new URL("../supabase/migrations/20261123070000_docker_signed_command_dispatch.sql",import.meta.url),"utf8");
  for(const table of ["docker_command_nonces","docker_command_claims"]){
    assert.match(file,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
    assert.match(file,new RegExp("REVOKE ALL ON public\\."+table+" FROM PUBLIC,anon,authenticated"));
  }
  assert.match(file,/request_id uuid NOT NULL UNIQUE/);
  assert.match(file,/REFERENCES public\.docker_control_requests\(id,owner_id\)/);
  assert.match(file,/REFERENCES public\.docker_agent_registrations\(id,owner_id\)/);
  assert.match(file,/state='approved'/);
  assert.match(file,/authorized_at IS NOT NULL/);
  assert.match(file,/NOT EXISTS\(SELECT 1 FROM public\.docker_command_claims/);
  assert.match(file,/FOR UPDATE OF r SKIP LOCKED/);
  assert.match(file,/DELETE FROM public\.docker_command_nonces/);
  assert.match(file,/status='key_verified'/);
  assert.match(file,/interval '15 seconds'/);
  assert.match(file,/GRANT EXECUTE ON FUNCTION public\.docker_command_finish/);
  assert.doesNotMatch(file,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.docker_command_claims TO authenticated/);
});
test("dispatch Edge has disabled gate, verifies signature before nonce and SQL, no Docker command access",()=>{
  const file=readFileSync(new URL("../supabase/functions/docker-command-dispatch/index.ts",import.meta.url),"utf8");
  assert.match(file,/DOCKER_REMOTE_LAB_ENABLED/);
  assert.ok(file.indexOf("crypto.subtle.verify(")<file.indexOf('db.rpc("docker_command_consume_nonce"'));
  assert.match(file,/serverSigningKey/);
  assert.match(file,/bytesFromBase64url/);
  assert.doesNotMatch(file,/docker\.sock|spawnSync|Deno\.Command|ssh:\/\/|fetch\(.+container/);
});
test("agent requires explicit execution flag, pinned signed permit, isolation guard and local audit",()=>{
  const file=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
  assert.match(file,/--execute-lab/);
  assert.match(file,/ETERNYX_REMOTE_LAB_ENABLED/);
  assert.match(file,/verify\(null,Buffer\.from\(labPermitMessage\(permit\)\)/);
  // The recovery-aware agent inspects before/after state with a stable target ID.
  assert.match(file,/verifyManagedTarget\(before,permit\.containerId\)/);
  assert.match(file,/labPostcondition\(permit\.operation,before,after\)/);
  assert.match(file,/reserveLabClaim/);
  assert.match(file,/result:"attempted"/);
  assert.match(file,/Docker command failed|Local Docker command failed/);
  assert.doesNotMatch(file,/shell:true/);
});
