import test from "node:test";
import assert from "node:assert/strict";
import { createHash,generateKeyPairSync,sign } from "node:crypto";
import {readFile} from "node:fs/promises";
import {reserveSignedHostedQuote} from
  "../infrastructure/cyber-range/provider/hosted-quote-reservation.mjs";
import {canonicalHostedQuote,quotedMaximumMicros} from
  "../infrastructure/cyber-range/provider/hosted-readiness.mjs";

const id="123e4567-e89b-42d3-a456-426614174001";
const lease="a23e4567-e89b-42d3-a456-426614174001";
const now=new Date("2026-11-22T19:30:00Z");
const key=generateKeyPairSync("ed25519");
const pub=key.publicKey.export({type:"spki",format:"pem"}).toString();
const fingerprint=createHash("sha256").update(
  key.publicKey.export({type:"spki",format:"der"})).digest("hex");
const manifest=()=>({
  challengePack:"http-basics-v1",image:"eternyx-http-basics-v1",
  virtualization:"firecracker",kernelSha256:"a".repeat(64),
  rootfsSha256:"b".repeat(64),vcpus:1,memoryMiB:256,
  maxRuntimeSeconds:900,egressPolicy:"deny-all",
  metadataAccess:"blocked",networkIngress:"vsock-only",
  rootfsReadOnly:true,jailerEnabled:true,snapshotting:"disabled",
});
const quote=()=>({
  currency:"USD",image:"eternyx-http-basics-v1",sessionId:id,
  nonce:"d".repeat(32),issuedAt:"2026-11-22T19:29:30Z",
  expiresAt:"2026-11-22T19:32:00Z",fixedMicros:2000,
  vCpuMicrosPerHour:50000,vmMemoryMicrosPerGiBHour:20000,
  storageMicrosPerGiBHour:1000,egressMicrosPerGiB:20000,
});
const hash=q=>createHash("sha256").update(canonicalHostedQuote(q)).digest("hex");
const signature=q=>sign(null,canonicalHostedQuote(q),key.privateKey).toString("base64");
const options=rpc=>{
  const q=quote();
  return {
    rpc,ownerId:"operator-hosted-ci",leaseId:lease,sessionId:id,
    quote:q,manifest:manifest(),signatureBase64:signature(q),
    publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,now,
  };
};

test("signed price submitted to exact privileged SQL RPC with no cloud launch",async()=>{
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    return {
      ok:true,reservationRecorded:true,reserved_micro_usd:17063,
      cloudProvisioningAllowed:false,providerHardLimitVerified:false,
    };
  };
  const r=await reserveSignedHostedQuote(options(rpc));
  assert.deepEqual(r,{
    reserved:true,amountMicroUsd:17063,quoteSha256:hash(quote()),
    reservationRecorded:true,providerHardLimitVerified:false,
    cloudProvisioningAllowed:false,
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,"ctf_hosted_reserve_quote");
  assert.deepEqual(calls[0].args,{
    p_owner_id:"operator-hosted-ci",p_fence_id:lease,p_session_id:id,
    p_quote_nonce:"d".repeat(32),p_quote_sha256:hash(quote()),
    p_reserved_micro_usd:17063,p_quote_expires_at:"2026-11-22T19:32:00Z",
  });
  assert.equal(quotedMaximumMicros(quote()),17063);
});

test("unsigned, forged, expired and tampered provider quotes never reach SQL",async()=>{
  let calls=0;
  const rpc=async()=>{calls++;throw Error("must never reach SQL");};
  for(const mutate of [
    o=>o.signatureBase64="garbage",
    o=>o.publicKeyPem=generateKeyPairSync("ed25519")
      .publicKey.export({type:"spki",format:"pem"}).toString(),
    o=>o.trustedKeyFingerprintSha256="f".repeat(64),
    o=>o.sessionId="223e4567-e89b-42d3-a456-426614174001",
    o=>o.quote.fixedMicros+=1,
    o=>o.quote.nonce="e".repeat(32),
    o=>o.quote.expiresAt="2026-11-22T19:29:00Z",
    o=>o.quote.currency="EUR",
    o=>o.manifest.egressPolicy="allow-all",
    o=>o.manifest.networkIngress="host-tcp",
    o=>o.manifest.maxRuntimeSeconds=10000,
  ]){
    const o=options(rpc);mutate(o);
    await assert.rejects(reserveSignedHostedQuote(o));
  }
  assert.equal(calls,0);
});

test("invalid worker identity, expired fence or malformed session never call SQL",async()=>{
  let calls=0;
  const rpc=async()=>{calls++;throw Error("not called");};
  for(const mutate of [
    o=>o.ownerId="root;run-untrusted",
    o=>o.ownerId="",
    o=>o.leaseId="not-a-fence",
    o=>o.sessionId="not-a-uuid",
    o=>o.rpc=null,
  ]){
    const o=options(rpc);mutate(o);
    await assert.rejects(reserveSignedHostedQuote(o));
  }
  assert.equal(calls,0);
});

test("database denied reservation returns only allowlisted refusal and launch remains off",async()=>{
  for(const reason of [
    "invalid_quote","lease_lost","hosted_budget_disabled",
    "hosted_budget_exhausted","duplicate_session","quote_replayed",
    "session_not_claimed",
  ]){
    const out=await reserveSignedHostedQuote(options(async()=>({ok:false,reason})));
    assert.deepEqual(out,{reserved:false,reason,cloudProvisioningAllowed:false});
  }
});

test("untrusted DB receipts, modified amount and claims of provider hard cap are refused",async()=>{
  const wrong=[
    null,[],true,{ok:true},{ok:true,cloudProvisioningAllowed:true},
    {ok:true,reservationRecorded:true,reserved_micro_usd:1,
      cloudProvisioningAllowed:false,providerHardLimitVerified:false},
    {ok:true,reservationRecorded:true,reserved_micro_usd:17063,
      cloudProvisioningAllowed:false,providerHardLimitVerified:true},
    {ok:false,reason:"pretend_success"},
  ];
  for(const response of wrong){
    await assert.rejects(reserveSignedHostedQuote(
      options(async()=>response)),/unsafe|Unverified/);
  }
});

test("DB outages do not leak secrets or claim a successful reservation",async()=>{
  const o=options(async()=>{throw Error("private-service-role-token");});
  await assert.rejects(reserveSignedHostedQuote(o),
    e=>e.message==="Hosted reservation database unavailable" &&
       !e.message.includes("private-service-role-token"));
});

test("reservation module is server-only and cannot call cloud provisioners",async()=>{
  const source=await readFile(new URL(
    "../infrastructure/cyber-range/provider/hosted-quote-reservation.mjs",
    import.meta.url),"utf8");
  assert.match(source,/verifySignedHostedQuote/);
  assert.match(source,/ctf_hosted_reserve_quote/);
  assert.doesNotMatch(source,/fetch\(|https?:\/\/|spawnSync|execSync|createCheckout|cloudProvisioningAllowed:true/);
  assert.match(source,/cloudProvisioningAllowed:false/);
});

test("SQL migration never exposes the reservation RPC to public users or refunds a quote",async()=>{
  const source=await readFile(new URL(
    "../supabase/migrations/20261123041000_ctf_hosted_spend_reservations.sql",
    import.meta.url),"utf8");
  assert.match(source,/SECURITY INVOKER/);
  assert.match(source,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(source,/DEFAULT false/);
  assert.match(source,/DEFAULT 0/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/pg_advisory_xact_lock\(20261122, 340\)/);
  assert.match(source,/quote_nonce text NOT NULL UNIQUE/);
  assert.match(source,/REFERENCES public\.ctf_range_sessions\(id\)/);
  assert.match(source,/REVOKE ALL ON FUNCTION public\.ctf_hosted_reserve_quote/);
  assert.match(source,/TO service_role/);
  assert.match(source,/cloudProvisioningAllowed',false/);
  assert.doesNotMatch(source,/SECURITY DEFINER|GRANT (?:ALL|EXECUTE) ON FUNCTION [^\n]+ TO (?:authenticated|anon)/);
  assert.doesNotMatch(source,/DELETE FROM public\.ctf_hosted_spend_reservations/);
});
