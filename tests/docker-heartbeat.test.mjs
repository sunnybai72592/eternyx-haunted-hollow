import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseDockerHeartbeat, dockerHeartbeatMessage, canonicalBase64url }
  from "../supabase/functions/_shared/docker-heartbeat-contract.mjs";

const agentId="33333333-3333-4333-8333-333333333333";
const nonce=randomBytes(32).toString("base64url");
const fixture=()=>({
  agentId,signedAt:"2026-11-22T20:00:00.000Z",nonce,
  engineAvailable:true,engineVersion:"28.4.0",containerCount:3,
  signature:"A".repeat(86),
});
test("heartbeat schema rejects extra fields and contradictory observations",()=>{
  assert.ok(parseDockerHeartbeat(fixture()));
  assert.equal(parseDockerHeartbeat({...fixture(),privateKey:"never"}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),agentId:"wrong"}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),signedAt:"tomorrow"}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),engineAvailable:false}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),engineAvailable:false,engineVersion:"",containerCount:null})?.engineAvailable,false);
  assert.equal(parseDockerHeartbeat({...fixture(),containerCount:-1}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),containerCount:5001}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),signature:"x"}),null);
  assert.equal(parseDockerHeartbeat({...fixture(),nonce:"short"}),null);
});
test("Ed25519 signature binds agent ID, nonce, time, engine result, version and count",()=>{
  const keys=generateKeyPairSync("ed25519");
  const message=dockerHeartbeatMessage(fixture());
  const signature=sign(null,Buffer.from(message),keys.privateKey);
  const accepted={...fixture(),signature:signature.toString("base64url")};
  assert.equal(signature.length,64);
  assert.equal(parseDockerHeartbeat(accepted)?.agentId,agentId);
  assert.equal(verify(null,Buffer.from(dockerHeartbeatMessage(accepted)),keys.publicKey,signature),true);
  const mutations=[
    {agentId:"44444444-4444-4444-8444-444444444444"},
    {nonce:randomBytes(32).toString("base64url")},
    {signedAt:"2026-11-22T20:00:10.000Z"},
    {engineAvailable:false,engineVersion:"",containerCount:null},
    {engineVersion:"28.4.1"},
    {containerCount:4},
  ];
  for(const change of mutations){
    assert.equal(verify(null,Buffer.from(dockerHeartbeatMessage({...accepted,...change})),keys.publicKey,signature),false);
  }
});
test("canonical decoding rejects padding and inappropriate key sizes",()=>{
  assert.equal(canonicalBase64url(nonce,32).length,32);
  assert.throws(()=>canonicalBase64url(nonce+"=",32));
  assert.throws(()=>canonicalBase64url(nonce,64));
  assert.throws(()=>canonicalBase64url("*".repeat(43),32));
});
test("SQL enforces owner grants, revocation, replay ordering, freshness and audit retention",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261123040000_docker_agent_signed_reports.sql",import.meta.url),"utf8");
  for(const table of ["docker_agent_reports","docker_agent_report_events"]){
    assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
    assert.match(sql,new RegExp("REVOKE ALL ON public\\."+table+" FROM PUBLIC, anon, authenticated"));
    assert.match(sql,new RegExp('USING \\(\\(SELECT auth\\.uid\\(\\)\\)=owner_id\\)'));
  }
  assert.match(sql,/FOREIGN KEY \(agent_id, owner_id\)/);
  assert.match(sql,/v_identity\.status<>'key_verified'/);
  assert.match(sql,/v_identity\.revoked_at IS NOT NULL/);
  assert.match(sql,/p_signed_at<=v_previous\.last_signed_at/);
  assert.match(sql,/last_received_at > v_now-interval '15 seconds'/);
  assert.match(sql,/LIMIT 24/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_accept_signed_report/);
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.docker_agent_reports TO authenticated/);
});
test("Edge function verifies signature before the protected SQL mutation",()=>{
  const source=readFileSync(new URL("../supabase/functions/docker-heartbeat/index.ts",import.meta.url),"utf8");
  const verify=source.indexOf("crypto.subtle.verify(");
  const rpc=source.indexOf('db.rpc("docker_accept_signed_report"');
  assert.ok(verify>=0 && rpc>verify);
  assert.match(source,/status!=="key_verified"/);
  assert.match(source,/identity\.revoked_at!==null/);
  assert.match(source,/req\.headers\.get\("Origin"\)/);
  assert.doesNotMatch(source,/docker\.sock|container start|container stop|container restart/);
});
