/**
 * Hosted range PRE-PROVISIONING contract only.
 *
 * NO cloud provider is integrated by this module. Passing these checks does
 * NOT start a VM, debit a bank account, guarantee a provider bill, enforce an
 * off-host currency cap, or permit public multi-tenant training labs.
 *
 * An eventual real cloud adapter must obtain a signed provider quote, hold an
 * atomic spend reservation, enforce a provider-side budget/kill switch, and
 * attest its separately isolated microVM before reporting a range "running".
 */
import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA = /^[a-f0-9]{64}$/;
const HOUR_SECONDS = 3600n;
const GIB_MIB = 1024n;
const PROFILE = "http-basics-v1";
const VM_IMAGE = "eternyx-http-basics-v1";
const REQUIRED_QUOTE_KEYS = [
  "currency","egressMicrosPerGiB","expiresAt","fixedMicros","image",
  "issuedAt","nonce","sessionId","storageMicrosPerGiBHour",
  "vCpuMicrosPerHour","vmMemoryMicrosPerGiBHour",
].sort();

function isExactFields(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === names.join("\0");
}
function boundedInt(n, max) {
  return Number.isSafeInteger(n) && n>=0 && n<=max;
}
function usdMicros(n) {
  if (!boundedInt(n, 100_000_000)) throw Error("Hosted spending policy is invalid");
  return BigInt(n);
}
const ceilDiv=(n,d)=>(n+d-1n)/d;

export function validateMicrovmManifest(manifest) {
  const keys=[
    "challengePack","egressPolicy","image","jailerEnabled","kernelSha256",
    "maxRuntimeSeconds","memoryMiB","metadataAccess","networkIngress",
    "rootfsReadOnly","rootfsSha256","snapshotting","vcpus","virtualization",
  ].sort();
  if(!isExactFields(manifest,keys) ||
     manifest.challengePack!==PROFILE || manifest.image!==VM_IMAGE ||
     manifest.virtualization!=="firecracker" ||
     !SHA.test(manifest.kernelSha256) || !SHA.test(manifest.rootfsSha256) ||
     manifest.kernelSha256===manifest.rootfsSha256 ||
     manifest.vcpus!==1 || manifest.memoryMiB!==256 ||
     manifest.maxRuntimeSeconds!==900 ||
     manifest.egressPolicy!=="deny-all" ||
     manifest.metadataAccess!=="blocked" ||
     manifest.networkIngress!=="vsock-only" ||
     manifest.rootfsReadOnly!==true ||
     manifest.jailerEnabled!==true ||
     manifest.snapshotting!=="disabled") {
    throw Error("Hosted microVM manifest is not approved");
  }
  return Object.freeze({
    image:VM_IMAGE,challengePack:PROFILE,hypervisor:"firecracker",
    maxRuntimeSeconds:900,vcpus:1,memoryMiB:256,
    egressAllowed:false,hostPublicPorts:0,
    dedicatedKernelRequired:true,readonlyRootfs:true,jailerRequired:true,
  });
}

export function canonicalHostedQuote(quote) {
  if(!isExactFields(quote,REQUIRED_QUOTE_KEYS) ||
     quote.currency!=="USD" ||quote.image!==VM_IMAGE||
     !validSessionId(quote.sessionId) ||
     typeof quote.nonce!=="string"|| !/^[a-f0-9]{32}$/.test(quote.nonce) ||
     typeof quote.issuedAt!=="string" ||
     typeof quote.expiresAt!=="string" ||
     !Number.isFinite(Date.parse(quote.issuedAt)) ||
     !Number.isFinite(Date.parse(quote.expiresAt)) ||
     ![
       quote.vCpuMicrosPerHour,quote.vmMemoryMicrosPerGiBHour,
       quote.storageMicrosPerGiBHour,quote.egressMicrosPerGiB,
       quote.fixedMicros,
     ].every(v=>boundedInt(v,20_000_000))) {
    throw Error("Hosted provider quote is not valid");
  }
  const canonical=Object.fromEntries(REQUIRED_QUOTE_KEYS.map(k=>[k,quote[k]]));
  return Buffer.from(JSON.stringify(canonical),"utf8");
}

export function verifySignedHostedQuote({
  quote,signatureBase64,publicKeyPem,trustedKeyFingerprintSha256,sessionId,now=new Date(),
}={}) {
  if(!validSessionId(sessionId) || quote?.sessionId!==sessionId ||
     !(now instanceof Date)||!Number.isFinite(now.getTime()) ||
     typeof signatureBase64!=="string"||
     !/^[a-zA-Z0-9+/]{86}==$/.test(signatureBase64) ||
     typeof publicKeyPem!=="string" || publicKeyPem.length>2048 ||
     typeof trustedKeyFingerprintSha256!=="string" || !SHA.test(trustedKeyFingerprintSha256)) {
    throw Error("Trusted hosted quote verification unavailable");
  }
  const content=canonicalHostedQuote(quote);
  const issued=Date.parse(quote.issuedAt);
  const expires=Date.parse(quote.expiresAt);
  if(issued>now.getTime() || now.getTime()-issued>60_000 ||
     expires<=now.getTime() || expires-issued>300_000) {
    throw Error("Hosted quote expired or outside accepted freshness window");
  }
  let key,verified=false;
  try{
    key=createPublicKey(publicKeyPem);
    if(key.asymmetricKeyType!=="ed25519")throw Error("Wrong quote key");
    const actualHash=createHash("sha256").update(
      key.export({type:"spki",format:"der"})).digest();
    const trustedHash=Buffer.from(trustedKeyFingerprintSha256,"hex");
    if(!timingSafeEqual(actualHash,trustedHash))
      throw Error("Provider quote verification key not pinned");
    const sig=Buffer.from(signatureBase64,"base64");
    verified=sig.length===64 &&
      verifySignature(null,content,key,sig);
  }catch{
    throw Error("Trusted hosted quote signature failed");
  }
  if(!verified)throw Error("Trusted hosted quote signature failed");
  return true;
}

/**
 * Worst-case *quoted* 15-minute cost. This is not a real provider charge,
 * nor a substitute for cloud-native budget alarms, hard quota and shutdown.
 * 64 MiB egress and 256 MiB ephemeral storage are conservatively included.
 */
export function quotedMaximumMicros(quote) {
  canonicalHostedQuote(quote);
  const vcpu=ceilDiv(BigInt(quote.vCpuMicrosPerHour)*900n,HOUR_SECONDS);
  const memory=ceilDiv(BigInt(quote.vmMemoryMicrosPerGiBHour)*256n*900n,
    GIB_MIB*HOUR_SECONDS);
  const storage=ceilDiv(BigInt(quote.storageMicrosPerGiBHour)*256n*900n,
    GIB_MIB*HOUR_SECONDS);
  const egress=ceilDiv(BigInt(quote.egressMicrosPerGiB)*64n,GIB_MIB);
  return Number(vcpu+memory+storage+egress+BigInt(quote.fixedMicros));
}

/**
 * Only a trusted orchestrator with a signed fresh provider quote AND an
 * atomic, authoritative reservation ledger may call the future provider.
 * Budget defaults zero. State fields are inputs, not self-attested provider
 * spend facts; never expose this as a publicly callable cloud launch API.
 */
export function evaluateHostedSpend({
  quote,sessionId,signatureBase64,publicKeyPem,trustedKeyFingerprintSha256,manifest,
  budget={singleSessionMicros:0,rolling24hMicros:0},
  ledger={spent24hMicros:0,reserved24hMicros:0},
  now=new Date(),
}={}) {
  validateMicrovmManifest(manifest);
  verifySignedHostedQuote({quote,sessionId,signatureBase64,publicKeyPem,trustedKeyFingerprintSha256,now});
  if(!isExactFields(budget,["rolling24hMicros","singleSessionMicros"]) ||
     !isExactFields(ledger,["reserved24hMicros","spent24hMicros"])) {
    throw Error("Hosted budget or reservation snapshot invalid");
  }
  const per=usdMicros(budget.singleSessionMicros);
  const day=usdMicros(budget.rolling24hMicros);
  const spent=usdMicros(ledger.spent24hMicros);
  const reserved=usdMicros(ledger.reserved24hMicros);
  if(per===0n||day===0n)
    return {approved:false,reason:"hosted_budget_disabled",quotedMicros:0};
  const total=BigInt(quotedMaximumMicros(quote));
  if(total>per || spent+reserved+total>day)
    return {approved:false,reason:"hosted_budget_exhausted",quotedMicros:Number(total)};
  return Object.freeze({
    approved:true,quotedMicros:Number(total),
    reservationRequired:true,
    // Real provider preauthorization must separately block network transfer,
    // volumes, paused instances, and post-900s charging.
    providerHardLimitVerified:false,
    cloudProvisioningAllowed:false,
  });
}

export function assertNoUnverifiedHostedRuntime(env=process.env) {
  const requested=Object.prototype.hasOwnProperty.call(env,"ETERNYX_RANGE_RUNTIME")
    ? env.ETERNYX_RANGE_RUNTIME : "local-docker";
  if(requested!=="local-docker")
    throw Error("Hosted microVM runtime is not deployed or approved");
  return "local-docker";
}
