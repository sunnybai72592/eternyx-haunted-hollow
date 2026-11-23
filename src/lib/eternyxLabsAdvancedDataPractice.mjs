/**
 * ETERNYX Labs advanced data-security open-book cases.
 * Answer keys come from the real bounded offline workstations.
 * Never award account scores or claim backend-verified credentials.
 */
import {
  deriveHkdfLocally,demonstrateEcdsaP256Locally,demonstrateAadLocally,
  redactStructuredJsonLocally,fingerprintJsonLocally,
} from "./eternyxLabsAdvancedData.mjs";
export const ADVANCED_DATA_TRACKS=Object.freeze([
  Object.freeze({id:"hkdf",title:"HKDF context separation",description:"Derive real salt- and context-bound HKDF-SHA256 bytes."}),
  Object.freeze({id:"ecdsa",title:"ECDSA signed-message integrity",description:"Verify genuine P-256 signatures and changed-message rejection."}),
  Object.freeze({id:"aesaad",title:"AES-GCM authenticated context",description:"Bind unencrypted metadata cryptographically to encrypted messages."}),
  Object.freeze({id:"jsonmask",title:"Structured privacy masking",description:"Apply bounded, nested key-based redaction without uploading records."}),
  Object.freeze({id:"jsonhash",title:"JSON canonical digests",description:"Compare SHA-256 digests of deterministic sorted-key JSON."}),
]);
// [id,track,title,prompt,scenario,kind,config,hint,explanation]
export const ADVANCED_DATA_DEFINITIONS=Object.freeze([
  ["hkdf-vector","hkdf","HKDF with fixed salt",
    "Which 64-character hex value does real HKDF-SHA256 derive?",
    "Synthetic IKM: synthetic-key-material-2026\nSalt hex: 00112233445566778899aabbccddeeff\nContext: eternyx-hkdf-training\nOutput: 32 bytes",
    "hex64",{material:"synthetic-key-material-2026",saltHex:"00112233445566778899aabbccddeeff",info:"eternyx-hkdf-training",length:32,field:"derivedHex"},
    "Import raw key material into HKDF, using SHA-256 and the exact 16-byte salt and context.",
    "HKDF uses real SubtleCrypto extraction and expansion; it cannot replace a slow password KDF."],
  ["hkdf-context","hkdf","Change only HKDF context",
    "What 64-character digest is derived after replacing only the context?",
    "Synthetic IKM: synthetic-key-material-2026\nSalt hex: 00112233445566778899aabbccddeeff\nContext: eternyx-another-context\nOutput: 32 bytes",
    "hex64",{material:"synthetic-key-material-2026",saltHex:"00112233445566778899aabbccddeeff",info:"eternyx-another-context",length:32,field:"derivedHex"},
    "Changing HKDF info/context separates derived outputs even if IKM and salt match.",
    "This is a genuine context-separated key derivation using synthetic training data only."],
  ["hkdf-length","hkdf","Sixteen-byte derivation",
    "How many bytes does the requested HKDF derivation return?",
    "HKDF-SHA256\nSynthetic IKM: synthetic-key-material-2026\nSalt hex: 00112233445566778899aabbccddeeff\nContext: length-check\nOutput: 128 bits",
    "integer",{material:"synthetic-key-material-2026",saltHex:"00112233445566778899aabbccddeeff",info:"length-check",length:16,field:"derivedBytes"},
    "Divide 128 output bits by eight; the same engine performs the actual derivation.",
    "Output length is a derived-bit count, not proof of the entropy of input key material."],
  ["ecdsa-size","ecdsa","P-256 raw signature size",
    "How many bytes does the real Web Crypto P-256 ECDSA signature contain?",
    "Synthetic message: forensic report\nECDSA: P-256 curve, SHA-256 digest, raw r||s signature",
    "integer",{message:"forensic report",field:"signatureBytes"},
    "Web Crypto uses raw IEEE P1363 r||s format, rather than ASN.1 DER.",
    "The actual browser engine generates a fresh private/public key pair and a 64-byte raw signature."],
  ["ecdsa-good","ecdsa","Verify the original message",
    "Does the fresh P-256 signature verify against the unchanged message?",
    "Synthetic message: integrity check\nSign it, then verify the same UTF-8 bytes with the ephemeral public key.",
    "boolean",{message:"integrity check",field:"verified"},
    "The public key checks the exact signed bytes and ECDSA-SHA256 signature.",
    "Real Web Crypto verification is performed; this does not establish an external signer identity."],
  ["ecdsa-changed","ecdsa","Detect signature mismatch",
    "Does the signature verification reject the modified message?",
    "Synthetic message: integrity check\nSign the original, then append ! before verification.",
    "boolean",{message:"integrity check",field:"modifiedMessageRejected"},
    "A signature over one message must not verify for different message bytes.",
    "The P-256 engine performs an actual negative signature verification, not a fixed success flag."],
  ["aad-utf8","aesaad","Authenticated context bytes",
    "How many UTF-8 bytes of additional authenticated data are bound to the ciphertext?",
    "AES-256-GCM plaintext: hello\nAdditional authenticated data: role=reader 🌍",
    "integer",{message:"hello",aad:"role=reader 🌍",field:"aadBytes"},
    "Count UTF-8 bytes, not characters. The globe emoji occupies four bytes.",
    "The real encryption feeds these exact bytes to AES-GCM as additionalData."],
  ["aad-reject","aesaad","Context tampering must fail",
    "Does authenticated decryption reject a changed context string?",
    "Plaintext: synthetic record\nContext: role=viewer\nAttempt to decrypt the original ciphertext using context role=viewer!",
    "boolean",{message:"synthetic record",aad:"role=viewer",field:"changedAadRejected"},
    "AES-GCM authenticates unencrypted AAD, so wrong context invalidates the authentication tag.",
    "The engine attempts actual decryption with changed AAD and observes authentication failure."],
  ["aad-cipherbytes","aesaad","AES-GCM ciphertext length",
    "How many total bytes are returned, including the 128-bit tag?",
    "Plaintext: hello\nContext: id=case-aad\nAES-GCM tag: 128 bits",
    "integer",{message:"hello",aad:"id=case-aad",field:"ciphertextBytes"},
    "AES-GCM ciphertext includes plaintext bytes plus 16 bytes of authentication tag.",
    "The result comes from a genuine, freshly keyed AES-256-GCM encryption."],
  ["mask-keys","jsonmask","Count masked JSON secrets",
    "How many values are replaced by the key-name redactor?",
    'Synthetic JSON: {"user":"learner","api_key":101,"password":202,"notes":"safe"}',
    "integer",{raw:'{"user":"learner","api_key":101,"password":202,"notes":"safe"}',field:"redactedFields"},
    "Only known sensitive key names match, not harmless fields such as user and notes.",
    "The bounded parser replaces values under api_key and password with a visible redaction token."],
  ["mask-nested","jsonmask","Nested credential masking",
    "How many masked fields are reported across nested objects and arrays?",
    'Synthetic JSON: {"items":[{"token":101},{"secret":202}],"profile":{"city":"Test"}}',
    "integer",{raw:'{"items":[{"token":101},{"secret":202}],"profile":{"city":"Test"}}',field:"redactedFields"},
    "Traverse arrays and objects recursively; count sensitive values regardless of nesting.",
    "This heuristic only recognizes known keys and cannot certify that all private data is removed."],
  ["mask-none","jsonmask","Harmless training JSON",
    "Does this JSON contain any key names that the local redactor masks?",
    'Synthetic JSON: {"title":"study","items":[1,2,3]}',
    "boolean",{raw:'{"title":"study","items":[1,2,3]}',field:"anyRedacted"},
    "A visible field name is not automatically a secret. The checker only masks known sensitive keys.",
    "No matching names means no masking; absence of findings is not a privacy guarantee."],
  ["jsonhash-order","jsonhash","Ignore object key order",
    "Do the two deterministically sorted JSON representations yield identical real SHA-256 digests?",
    'First: {"a":1,"b":{"x":true,"y":2}}\nSecond: {"b":{"y":2,"x":true},"a":1}',
    "boolean",{first:'{"a":1,"b":{"x":true,"y":2}}',second:'{"b":{"y":2,"x":true},"a":1}',field:"sameDigest"},
    "Sort object keys recursively; do not sort arrays or change values.",
    "Genuine SHA-256 digests match for these equivalent recursively sorted objects."],
  ["jsonhash-value","jsonhash","Changed value changes digest",
    "Do these canonical JSON documents have matching SHA-256 digests?",
    'First: {"role":"viewer","enabled":true}\nSecond: {"role":"viewer","enabled":false}',
    "boolean",{first:'{"role":"viewer","enabled":true}',second:'{"role":"viewer","enabled":false}',field:"sameDigest"},
    "SHA-256 hashes bytes. A changed Boolean produces a different canonical byte sequence.",
    "Different digest bytes are demonstrated with real SubtleCrypto, not a remote service."],
  ["jsonhash-bits","jsonhash","SHA-256 output size",
    "How many bytes are in each real canonical-JSON SHA-256 fingerprint?",
    'First: {"x":1}\nSecond: {"x":1}',
    "integer",{first:'{"x":1}',second:'{"x":1}',field:"digestBytes"},
    "SHA-256 is 256 bits, or exactly 32 bytes, regardless of input JSON length.",
    "The workbench digests both canonical text buffers locally using Web Crypto."],
]);
export function answerForStructuredPractice(challenge){
  if(challenge.track!=="jsonmask")throw Error("Unsupported structured data practice track.");
  const c=challenge.config;
  if(!["redactedFields","anyRedacted"].includes(c.field))
    throw Error("Unsupported JSON masking field.");
  const value=redactStructuredJsonLocally(c.raw)[c.field];
  return typeof value==="boolean"?(value?"yes":"no"):String(value);
}
export async function answerForAdvancedCryptoPractice(challenge,cryptoApi){
  const c=challenge.config;let result;
  switch(challenge.track){
    case "hkdf":
      if(!["derivedHex","derivedBytes"].includes(c.field))throw Error("Unsupported HKDF output field.");
      result=await deriveHkdfLocally(c.material,{
        saltHex:c.saltHex,info:c.info,length:c.length,cryptoApi,
      });break;
    case "ecdsa":
      if(!["signatureBytes","verified","modifiedMessageRejected"].includes(c.field))
        throw Error("Unsupported ECDSA output field.");
      result=await demonstrateEcdsaP256Locally(c.message,cryptoApi);break;
    case "aesaad":
      if(!["aadBytes","changedAadRejected","ciphertextBytes"].includes(c.field))
        throw Error("Unsupported AES-GCM AAD output field.");
      result=await demonstrateAadLocally(c.message,c.aad,cryptoApi);break;
    case "jsonhash":
      if(!["sameDigest","digestBytes"].includes(c.field))
        throw Error("Unsupported JSON digest output field.");
      result=await fingerprintJsonLocally(c.first,c.second,cryptoApi);break;
    default:throw Error("Unsupported advanced cryptographic training track.");
  }
  return typeof result[c.field]==="boolean"?(result[c.field]?"yes":"no"):String(result[c.field]);
}
