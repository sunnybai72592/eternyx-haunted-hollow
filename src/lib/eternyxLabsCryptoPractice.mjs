/**
 * Open-book Labs challenges for the five actual browser-local crypto/data workstations.
 * No hard-coded answer keys: answers are recomputed by the same real utilities as
 * the workstations. Crypto needs secure-context Web Crypto; never fall back to fake output.
 * All examples are synthetic and are not an examination or credential.
 */
import {
  derivePbkdf2Locally,demonstrateAesGcmLocally,calculateTotpLocally,
  compareWebOriginsLocally,neutralizeCsvFormulasLocally,
} from "./eternyxLabsCryptoDefense.mjs";

export const CRYPTO_PRACTICE_TRACKS=Object.freeze([
  Object.freeze({id:"pbkdf2",title:"PBKDF2 password derivation",description:"Compute real salted SHA-256 PBKDF2 from synthetic passphrases."}),
  Object.freeze({id:"aesgcm",title:"AES-GCM authenticity",description:"Measure authenticated encryption and verify bit-flip rejection."}),
  Object.freeze({id:"totp",title:"RFC 6238 time-based OTP",description:"Derive eight- and six-digit codes using synthetic RFC seed material."}),
  Object.freeze({id:"origins",title:"Browser origin boundary",description:"Compare exact schemes, hostnames and effective ports without traffic."}),
  Object.freeze({id:"csvsafe",title:"CSV formula defenses",description:"Recognize formula-like cells and inspect local neutralization counts."}),
]);

// [id,track,title,prompt,scenario,kind,config,hint,explanation]
export const CRYPTO_PRACTICE_DEFINITIONS=Object.freeze([
  ["pbkdf2-vector","pbkdf2","Derive a salted PBKDF2 key",
    "What 64-character SHA-256 PBKDF2 digest does the training passphrase derive?",
    "Synthetic passphrase: synthetic-example-only\nSalt (16 bytes, hex): 00112233445566778899aabbccddeeff\nIterations: 1000\nOutput: 32 bytes",
    "hex64",{password:"synthetic-example-only",saltHex:"00112233445566778899aabbccddeeff",iterations:1000,field:"derivedHex"},
    "Derive 256 bits with HMAC-SHA256 PBKDF2; return the full lowercase hexadecimal output.",
    "The browser computes the actual key using SubtleCrypto. Real accounts need an independently designed password-storage system."],
  ["pbkdf2-work","pbkdf2","Increase the PBKDF2 work factor",
    "What 64-character digest results after increasing only the iteration count to 10,000?",
    "Synthetic passphrase: synthetic-example-only\nSalt (16 bytes, hex): 00112233445566778899aabbccddeeff\nIterations: 10000\nOutput: 32 bytes",
    "hex64",{password:"synthetic-example-only",saltHex:"00112233445566778899aabbccddeeff",iterations:10000,field:"derivedHex"},
    "Even with the same passphrase and salt, the iteration count changes the actual derived bits.",
    "This genuine Web Crypto result shows why iteration parameters are part of the derivation. Do not enter real passwords."],
  ["pbkdf2-bytes","pbkdf2","Derivation output length",
    "How many bytes does this real 256-bit derivation return?",
    "Synthetic passphrase: synthetic-example-only\nSalt (16 bytes): 00112233445566778899aabbccddeeff\nIterations: 1000\nDerived length: 256 bits",
    "integer",{password:"synthetic-example-only",saltHex:"00112233445566778899aabbccddeeff",iterations:1000,field:"derivedBytes"},
    "Divide the output bit length by eight; the same Web Crypto derivation still runs.",
    "256 derived bits correspond to 32 bytes. This is training math, not a credential-storage service."],
  ["aes-utf8","aesgcm","AES-GCM plaintext bytes",
    "How many UTF-8 bytes are actually encrypted?",
    "Synthetic plaintext: hello 🌍\nAES-256-GCM: ephemeral non-exportable key and random nonce",
    "integer",{message:"hello 🌍",field:"messageBytes"},
    "The emoji occupies four bytes in UTF-8; count encoded bytes, not glyphs.",
    "The real browser encryption uses a fresh key and random nonce. No key is saved or exported."],
  ["aes-tag-overhead","aesgcm","Authenticated ciphertext size",
    "How many ciphertext bytes (including authentication tag) result?",
    "Synthetic plaintext: defensive log\nAES-256-GCM with 128-bit tag",
    "integer",{message:"defensive log",field:"ciphertextBytes"},
    "AES-GCM adds a 16-byte tag to this unpadded plaintext length.",
    "The result is measured from real Web Crypto encryption. It is not a ciphertext that can be decrypted in a later session."],
  ["aes-tamper","aesgcm","Detect a changed ciphertext",
    "Does decryption reject a one-bit modification of this authenticated ciphertext?",
    "Synthetic plaintext: verify integrity\nAES-256-GCM\nFlip one bit of the ciphertext and attempt authenticated decryption",
    "boolean",{message:"verify integrity",field:"tamperingRejected"},
    "Authenticated encryption rejects a modified ciphertext or tag rather than silently returning text.",
    "The workstation really encrypts, decrypts, flips one ciphertext bit and catches failed verification."],
  ["totp-rfc59","totp","RFC 6238 eight-digit vector",
    "What exact eight-digit code does RFC 6238 produce at Unix second 59?",
    "Synthetic RFC SHA-1 seed: 12345678901234567890\nUnix seconds: 59\nPeriod: 30 seconds\nDigits: 8",
    "otp8",{secret:"12345678901234567890",epochSeconds:59,period:30,digits:8,field:"code"},
    "Use HOTP dynamic truncation with HMAC-SHA1 on counter floor(59/30). Preserve leading zeroes.",
    "The real Web Crypto HMAC yields the published RFC 6238 eight-digit test code, not a login token."],
  ["totp-leading-zero","totp","Preserve a leading zero",
    "What exact eight-digit TOTP code is returned at this timestamp?",
    "Synthetic RFC SHA-1 seed: 12345678901234567890\nUnix seconds: 1111111109\nPeriod: 30 seconds\nDigits: 8",
    "otp8",{secret:"12345678901234567890",epochSeconds:1111111109,period:30,digits:8,field:"code"},
    "Eight digits means eight characters: a leading zero must be included in your answer.",
    "RFC 6238 codes are zero-padded decimal strings; interpreting one as a number can discard significant formatting."],
  ["totp-six","totp","Six-digit training OTP",
    "What exact six-digit code does this synthetic seed produce at Unix second 59?",
    "Synthetic RFC SHA-1 seed: 12345678901234567890\nUnix seconds: 59\nPeriod: 30 seconds\nDigits: 6",
    "otp6",{secret:"12345678901234567890",epochSeconds:59,period:30,digits:6,field:"code"},
    "The six-digit code is the last six digits of the eight-digit value for this same seed, time and algorithm.",
    "This is computed through Web Crypto with a synthetic seed; real 2FA enrollment or verification is out of scope."],
  ["origins-default","origins","Default HTTPS ports",
    "Do these URLs have the same browser origin?",
    "First: https://EXAMPLE.test/a\nSecond: https://example.test:443/b",
    "boolean",{first:"https://EXAMPLE.test/a",second:"https://example.test:443/b",field:"sameOrigin"},
    "Normalize the host's case and the default HTTPS port; paths do not affect origin.",
    "The browser URL parser compares normalized scheme, host and effective port without fetching either URL."],
  ["origins-scheme","origins","HTTPS versus HTTP",
    "Do these synthetic origins have different schemes?",
    "First: http://example.test/path\nSecond: https://example.test/path",
    "boolean",{first:"http://example.test/path",second:"https://example.test/path",field:"schemeDiffers"},
    "A shared hostname is not enough: http: and https: are different schemes.",
    "Different schemes mean different browser origins; this static exercise does not establish CORS access."],
  ["origins-port","origins","Explicit non-default port",
    "Do these two synthetic URLs have different effective ports?",
    "First: https://example.test:444/a\nSecond: https://example.test/b",
    "boolean",{first:"https://example.test:444/a",second:"https://example.test/b",field:"portDiffers"},
    "The second HTTPS URL implicitly uses port 443.",
    "The comparison is a pure local URL parse, not DNS, SSRF validation or network reachability."],
  ["csv-formulas","csvsafe","Formula-leading input cells",
    "How many training cells are neutralized before emitting a quoted one-column CSV?",
    "Cells, one per line:\n=SUM(1,2)\nplain\n@HYPERLINK(\"x\")",
    "integer",{cells:"=SUM(1,2)\nplain\n@HYPERLINK(\"x\")",field:"neutralized"},
    "Formula triggers include = and @ at the first non-whitespace position.",
    "The CSV builder apostrophe-prefixes two formula-like cells and correctly escapes quotes; spreadsheet behavior varies."],
  ["csv-whitespace","csvsafe","Whitespace before a formula",
    "How many cells get formula neutralization, including whitespace-prefixed triggers?",
    "Cells, one per line:\n  +3\n-42\nsafe",
    "integer",{cells:"  +3\n-42\nsafe",field:"neutralized"},
    "Leading spaces do not make a formula-like + or - safe in this conservative local heuristic.",
    "The checker counts two cells for apostrophe-prefix neutralization, not a universal CSV security proof."],
  ["csv-quoted","csvsafe","Quoted CSV row count",
    "How many separate cells are serialized into this one-column CSV output?",
    "Cells, one per line:\na,\"b\"\n=1+1\nsafe",
    "integer",{cells:"a,\"b\"\n=1+1\nsafe",field:"cellCount"},
    "A comma or quote within a cell is escaped by CSV quoting; a newline separates the provided cells.",
    "The real builder quotes all three rows and doubles embedded quotes; it makes no file changes."],
]);

export function answerForDataPractice(challenge){
  const c=challenge.config;
  if(challenge.track==="origins"){
    const result=compareWebOriginsLocally(c.first,c.second);
    if(!["sameOrigin","schemeDiffers","portDiffers"].includes(c.field))
      throw Error("Unsupported origin practice field.");
    return result[c.field]?"yes":"no";
  }
  if(challenge.track==="csvsafe"){
    const result=neutralizeCsvFormulasLocally(c.cells);
    if(!["neutralized","cellCount"].includes(c.field))
      throw Error("Unsupported CSV practice field.");
    return String(result[c.field]);
  }
  throw Error("This training scenario is not a synchronous data-security exercise.");
}

export async function answerForCryptoPractice(challenge,cryptoApi){
  const c=challenge.config;
  if(challenge.track==="pbkdf2"){
    if(!["derivedHex","derivedBytes"].includes(c.field))
      throw Error("Unsupported PBKDF2 practice field.");
    const result=await derivePbkdf2Locally(c.password,{
      saltHex:c.saltHex,iterations:c.iterations,cryptoApi,
    });
    return String(result[c.field]);
  }
  if(challenge.track==="aesgcm"){
    if(!["messageBytes","ciphertextBytes","tamperingRejected"].includes(c.field))
      throw Error("Unsupported AES-GCM practice field.");
    const result=await demonstrateAesGcmLocally(c.message,cryptoApi);
    return typeof result[c.field]==="boolean"?(result[c.field]?"yes":"no"):String(result[c.field]);
  }
  if(challenge.track==="totp"){
    if(c.field!=="code")throw Error("Unsupported TOTP practice field.");
    const result=await calculateTotpLocally(c.secret,{
      epochSeconds:c.epochSeconds,period:c.period,digits:c.digits,cryptoApi,
    });
    return result.code;
  }
  throw Error("This training scenario requires a supported cryptographic track.");
}
