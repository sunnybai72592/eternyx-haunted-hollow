/**
 * ETERNYX Labs advanced crypto and structured-data defenses.
 * Bounded, synthetic, browser-local exercises. No network, durable keys or grading claims.
 */
const encoder=new TextEncoder();
const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const fromHex=value=>Uint8Array.from(value.match(/../g)||[],s=>parseInt(s,16));
function input(value,label,limit=2048){
  if(typeof value!=="string"||encoder.encode(value).length>limit||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw Error(label+" must be bounded synthetic text without control characters.");
  return value;
}
function requireCrypto(api,...functions){
  if(!api?.subtle||functions.some(name=>typeof api.subtle[name]!=="function"))
    throw Error("Secure browser Web Crypto is required; no simulated fallback is available.");
}
function randomBytes(api,length){
  if(typeof api?.getRandomValues!=="function")
    throw Error("Secure Web Crypto randomness is required.");
  const bytes=new Uint8Array(length);
  api.getRandomValues(bytes);
  return bytes;
}
const metadata=Object.freeze({requestsSent:0,savedToAccount:false});
export async function deriveHkdfLocally(material,{
  saltHex=null,info="eternyx-hkdf-training",length=32,cryptoApi=globalThis.crypto,
}={}){
  const ikm=encoder.encode(input(material,"Synthetic key material",128));
  if(ikm.length<8)throw Error("Use at least eight bytes of synthetic key material.");
  input(info,"HKDF context",128);
  if(![16,32,64].includes(length))throw Error("HKDF output must be 16, 32 or 64 bytes.");
  requireCrypto(cryptoApi,"importKey","deriveBits");
  let salt;
  if(saltHex===null)salt=randomBytes(cryptoApi,16);
  else{
    if(typeof saltHex!=="string"||!/^[0-9a-fA-F]{32}$/.test(saltHex))
      throw Error("HKDF salt must contain exactly 32 hexadecimal characters.");
    salt=fromHex(saltHex);
  }
  const key=await cryptoApi.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
  const bits=await cryptoApi.subtle.deriveBits({
    name:"HKDF",hash:"SHA-256",salt,info:encoder.encode(info),
  },key,length*8);
  const output=new Uint8Array(bits);
  if(output.length!==length)throw Error("Unexpected HKDF output length.");
  return Object.freeze({
    derivedHex:toHex(output),derivedBytes:output.length,saltHex:toHex(salt),
    contextBytes:encoder.encode(info).length,keyExportable:false,...metadata,
    caveat:"Real HKDF-SHA256 from synthetic key material. HKDF is not a password-hardening function. Never enter real secrets; output is local, untrusted practice data.",
  });
}
export async function demonstrateEcdsaP256Locally(message,cryptoApi=globalThis.crypto){
  const text=input(message,"Synthetic signed message",2048);
  requireCrypto(cryptoApi,"generateKey","sign","verify");
  const pair=await cryptoApi.subtle.generateKey({
    name:"ECDSA",namedCurve:"P-256",
  },false,["sign","verify"]);
  const body=encoder.encode(text);
  const signature=new Uint8Array(await cryptoApi.subtle.sign({
    name:"ECDSA",hash:"SHA-256",
  },pair.privateKey,body));
  if(signature.length!==64)throw Error("Unexpected P-256 signature length.");
  const valid=await cryptoApi.subtle.verify({
    name:"ECDSA",hash:"SHA-256",
  },pair.publicKey,signature,body);
  const changed=await cryptoApi.subtle.verify({
    name:"ECDSA",hash:"SHA-256",
  },pair.publicKey,signature,encoder.encode(text+"!"));
  if(!valid||changed)throw Error("ECDSA verification did not enforce message integrity.");
  return Object.freeze({
    signatureHex:toHex(signature),signatureBytes:signature.length,
    messageBytes:body.length,verified:true,modifiedMessageRejected:true,
    keyExportable:false,...metadata,
    caveat:"A newly generated non-exportable P-256 key pair signs and verifies synthetic text, then rejects a changed message. No key is persisted or shared; this is not identity verification, PKI or a certificate.",
  });
}
export async function demonstrateAadLocally(message,aad,cryptoApi=globalThis.crypto){
  const text=input(message,"Synthetic plaintext",2048);
  const context=input(aad,"Synthetic authenticated context",512);
  requireCrypto(cryptoApi,"generateKey","encrypt","decrypt");
  const key=await cryptoApi.subtle.generateKey({
    name:"AES-GCM",length:256,
  },false,["encrypt","decrypt"]);
  const iv=randomBytes(cryptoApi,12);
  const plaintext=encoder.encode(text),associated=encoder.encode(context);
  const options={name:"AES-GCM",iv,tagLength:128,additionalData:associated};
  const encrypted=new Uint8Array(await cryptoApi.subtle.encrypt(options,key,plaintext));
  const recovered=await cryptoApi.subtle.decrypt(options,key,encrypted);
  const matching=new TextDecoder("utf-8",{fatal:true}).decode(recovered)===text;
  let changedAadRejected=false,changedCiphertextRejected=false;
  try{
    await cryptoApi.subtle.decrypt({
      ...options,additionalData:encoder.encode(context+"!"),
    },key,encrypted);
  }catch{changedAadRejected=true;}
  const corrupted=encrypted.slice();
  corrupted[0]^=1;
  try{await cryptoApi.subtle.decrypt(options,key,corrupted);}
  catch{changedCiphertextRejected=true;}
  if(!matching||!changedAadRejected||!changedCiphertextRejected)
    throw Error("AES-GCM context or ciphertext authentication failed.");
  return Object.freeze({
    ciphertextHex:toHex(encrypted),nonceHex:toHex(iv),
    plaintextBytes:plaintext.length,aadBytes:associated.length,
    ciphertextBytes:encrypted.length,authenticated:true,
    changedAadRejected:true,changedCiphertextRejected:true,
    keyExportable:false,...metadata,
    caveat:"Authenticated additional data is bound to ciphertext but is not encrypted. The fresh non-exportable key and one-use nonce are discarded. Never reuse an AES-GCM key/nonce pair or enter real secrets.",
  });
}
function parseLimitedJson(raw,label){
  const text=input(raw,label,8192);
  let parsed;
  try{parsed=JSON.parse(text);}
  catch{throw Error(label+" must be valid JSON.");}
  let nodes=0,maxDepth=0,fieldsVisited=0;
  function walk(value,depth,visitor){
    if(depth>8||++nodes>300)throw Error("Structured JSON exceeds the eight-level or 300-node training limit.");
    maxDepth=Math.max(maxDepth,depth);
    if(Array.isArray(value))return value.map(x=>walk(x,depth+1,visitor));
    if(value!==null&&typeof value==="object"){
      const entries=Object.entries(value);
      fieldsVisited+=entries.length;
      const result=Object.create(null);
      for(const [key,val] of entries){
        result[key]=visitor(key,val,depth+1,(next,nextDepth)=>walk(next,nextDepth,visitor));
      }
      return result;
    }
    return value;
  }
  return {parsed,walk,stats:()=>({nodes,maxDepth,fieldsVisited})};
}
const privateField=/^(?:password|passwd|pwd|secret|clientsecret|client_secret|apikey|api_key|api-key|token|accesstoken|access_token|refreshtoken|refresh_token|id_token|authorization|cookie|set-cookie|session|sessionid|privatekey|private_key|credential|credentials)$/i;
export function redactStructuredJsonLocally(raw){
  const {parsed,walk,stats}=parseLimitedJson(raw,"Training JSON");
  let redacted=0;
  const cleaned=walk(parsed,0,(key,val,depth,recurse)=>{
    if(privateField.test(key)){redacted++;return "[REDACTED]";}
    return recurse(val,depth);
  });
  const {nodes,maxDepth,fieldsVisited}=stats();
  return Object.freeze({
    redactedJson:JSON.stringify(cleaned,null,2),
    redactedFields:redacted,fieldsVisited,nodeCount:nodes,maxDepth,
    anyRedacted:redacted>0,...metadata,
    caveat:"Key-name based masking only. Unknown field names, free text, PII and encoded secrets may remain visible. Review the output before sharing it; do not paste actual credentials.",
  });
}
function canonicalize(value){
  if(Array.isArray(value))return "["+value.map(canonicalize).join(",")+"]";
  if(value!==null&&typeof value==="object")
    return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonicalize(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
export async function fingerprintJsonLocally(first,second,cryptoApi=globalThis.crypto){
  const a=parseLimitedJson(first,"First training JSON");
  const b=parseLimitedJson(second,"Second training JSON");
  // Traverse and bound the full parsed structures before hashing anything.
  a.walk(a.parsed,0,(_k,v,d,recurse)=>recurse(v,d));
  b.walk(b.parsed,0,(_k,v,d,recurse)=>recurse(v,d));
  requireCrypto(cryptoApi,"digest");
  const ca=canonicalize(a.parsed),cb=canonicalize(b.parsed);
  const [ha,hb]=await Promise.all([
    cryptoApi.subtle.digest("SHA-256",encoder.encode(ca)),
    cryptoApi.subtle.digest("SHA-256",encoder.encode(cb)),
  ]);
  const firstDigest=toHex(new Uint8Array(ha)),secondDigest=toHex(new Uint8Array(hb));
  if(firstDigest.length!==64||secondDigest.length!==64)
    throw Error("Unexpected SHA-256 digest length.");
  return Object.freeze({
    firstDigest,secondDigest,sameDigest:firstDigest===secondDigest,
    firstBytes:encoder.encode(ca).length,secondBytes:encoder.encode(cb).length,
    digestBytes:32,...metadata,
    caveat:"These are actual SHA-256 digests of locally sorted-key JSON; key order is ignored, array order is preserved. This is not RFC 8785 canonical JSON or a cryptographic authenticity proof. Do not hash confidential data.",
  });
}
