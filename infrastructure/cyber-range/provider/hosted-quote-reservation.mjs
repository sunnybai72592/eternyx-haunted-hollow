/**
 * Trusted host pre-provisioning boundary for a future cloud adapter.
 *
 * A signed, pinned provider quote MUST pass local cryptographic verification
 * before a fenced service-only PostgreSQL reservation is requested. The
 * database atomically reserves rolling 24-hour micro-USD with no cancel
 * shortcut and denies quote nonce replay.
 *
 * Successful reservation NEVER authorizes a VM launch: public and paid hosted
 * runtimes remain disabled until a real provider-side hard cap and sandbox
 * attestation exist. Not imported into any browser or production Edge route.
 */
import { createHash } from "node:crypto";
import { acceptedFence } from "../../../supabase/functions/_shared/ctf-range-fenced-contract.mjs";
import { validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import {
  canonicalHostedQuote, quotedMaximumMicros, validateMicrovmManifest,
  verifySignedHostedQuote,
} from "./hosted-readiness.mjs";

const OWNER=/^[a-z][a-z0-9-]{2,39}$/;
const REASONS=new Set([
  "invalid_quote","lease_lost","hosted_budget_disabled",
  "hosted_budget_exhausted","duplicate_session","quote_replayed",
  "session_not_claimed",
]);

export async function reserveSignedHostedQuote({
  rpc,ownerId,leaseId,sessionId,quote,manifest,
  signatureBase64,publicKeyPem,trustedKeyFingerprintSha256,
  now=new Date(),
}={}) {
  if(typeof rpc!=="function" || typeof ownerId!=="string" ||
     !OWNER.test(ownerId) || !acceptedFence(leaseId) ||
     !validSessionId(sessionId)) {
    throw Error("Trusted hosted reservation context is invalid");
  }
  validateMicrovmManifest(manifest);
  verifySignedHostedQuote({
    quote,signatureBase64,publicKeyPem,trustedKeyFingerprintSha256,
    sessionId,now,
  });
  const amount=quotedMaximumMicros(quote);
  const hash=createHash("sha256").update(canonicalHostedQuote(quote)).digest("hex");
  const params=Object.freeze({
    p_owner_id:ownerId,p_fence_id:leaseId,p_session_id:sessionId,
    p_quote_nonce:quote.nonce,p_quote_sha256:hash,
    p_reserved_micro_usd:amount,p_quote_expires_at:quote.expiresAt,
  });
  let value;
  try{
    // No service secret is created here; caller injects its trusted
    // server-side rpc client. Never wire this into a public browser bundle.
    value=await rpc("ctf_hosted_reserve_quote",params);
  }catch{
    throw Error("Hosted reservation database unavailable");
  }
  if(value?.ok!==true){
    if(value?.ok!==false || !REASONS.has(value?.reason)){
      throw Error("Unverified hosted reservation database response");
    }
    return Object.freeze({
      reserved:false,reason:value.reason,cloudProvisioningAllowed:false,
    });
  }
  if(value.reservationRecorded!==true ||
     value.reserved_micro_usd!==amount ||
     value.providerHardLimitVerified!==false ||
     value.cloudProvisioningAllowed!==false) {
    throw Error("Hosted reservation returned an unsafe receipt");
  }
  return Object.freeze({
    reserved:true,amountMicroUsd:amount,quoteSha256:hash,
    reservationRecorded:true,
    providerHardLimitVerified:false,cloudProvisioningAllowed:false,
  });
}
