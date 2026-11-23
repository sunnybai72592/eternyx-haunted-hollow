/**
 * Five completely client-side ETERNYX Labs utilities.
 *
 * All input is bounded, processed only in memory, and never fetched, saved,
 * transmitted or logged. These are teaching aids, not authorization checks,
 * credential verification, a network scanner or a secret-detection guarantee.
 */
export const MAX_LAB_TEXT_BYTES = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", {fatal:true});
function bytesWithin(value,max=MAX_LAB_TEXT_BYTES){
  if(typeof value!=="string")throw Error("Enter text before running this exercise.");
  const bytes=encoder.encode(value);
  if(bytes.length>max)throw Error("Training input exceeds the local 4 KiB limit.");
  return bytes;
}
function b64FromBytes(bytes){
  return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(""));
}
function bytesFromBase64(value,urlSafe=false){
  if(typeof value!=="string"||value.length>8192)
    throw Error("Base64 input is not valid or is too large.");
  let code=value.trim();
  if(urlSafe)code=code.replace(/-/g,"+").replace(/_/g,"/");
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(code)||code.length%4===1)
    throw Error("Base64 input is not valid.");
  const unpadded=code.replace(/=+$/,"");
  if(code.includes("=")&&code.length%4!==0)
    throw Error("Base64 padding is invalid.");
  const padded=unpadded.padEnd(Math.ceil(unpadded.length/4)*4,"=");
  let raw;
  try{raw=atob(padded);}
  catch{throw Error("Base64 input is not valid.");}
  const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  if(b64FromBytes(bytes).replace(/=+$/,"")!==unpadded)
    throw Error("Base64 input is not canonically encoded.");
  return bytes;
}
function printable(value){
  try{return decoder.decode(value);}
  catch{throw Error("Decoded bytes are not valid UTF-8 text.");}
}
export function encodeTextLocally(value){
  const bytes=bytesWithin(value);
  return Object.freeze({
    byteCount:bytes.length,
    base64:b64FromBytes(bytes),
    hex:Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""),
    utf8RoundTrip:printable(bytes),
  });
}
export function decodeTextLocally(value,encoding="base64"){
  if(!["base64","hex"].includes(encoding))
    throw Error("Only UTF-8 Base64 and hexadecimal training inputs are supported.");
  if(typeof value!=="string"||value.length>8192)
    throw Error("Encoded input is too large.");
  const input=value.trim();
  let bytes;
  if(encoding==="hex"){
    if(input.length%2!==0||!/^[a-fA-F0-9]*$/.test(input))
      throw Error("Hex input must contain complete hexadecimal byte pairs.");
    bytes=Uint8Array.from(input.match(/.{2}/g)??[],x=>parseInt(x,16));
  }else bytes=bytesFromBase64(input);
  if(bytes.length>MAX_LAB_TEXT_BYTES)
    throw Error("Decoded input exceeds the local 4 KiB limit.");
  return Object.freeze({byteCount:bytes.length,text:printable(bytes)});
}
export function inspectUrlLocally(value){
  bytesWithin(value,2048);
  const input=value.trim();
  if(/[\r\n]/.test(input))throw Error("URL cannot contain line breaks.");
  let url;
  try{url=new URL(input);}
  catch{throw Error("Enter a complete http:// or https:// URL.");}
  if(!["http:","https:"].includes(url.protocol))
    throw Error("Only HTTP(S) URLs can be inspected in this exercise.");
  const names=[...url.searchParams.keys()];
  const keys=[...new Set(names)].slice(0,24);
  const warnings=[];
  if(url.protocol!=="https:")warnings.push("Plain HTTP does not encrypt transport.");
  if(url.username||url.password)warnings.push("The URL contains embedded credentials. Do not use this pattern.");
  if(url.hash)warnings.push("A fragment is present. It is not sent in a normal HTTP request.");
  if(names.some(x=>/^(?:token|access_token|api_key|password|secret|key)$/i.test(x)))
    warnings.push("A sensitive-looking query field name is present; avoid putting secrets in URLs.");
  if(url.hostname.split(".").some(x=>x.startsWith("xn--")))
    warnings.push("Internationalized hostname: inspect its spelling before trusting it.");
  return Object.freeze({
    scheme:url.protocol.slice(0,-1),
    host:url.hostname,
    port:url.port||"(default)",
    pathSegments:url.pathname.split("/").filter(Boolean).length,
    queryParameters:names.length,
    queryKeys:keys,
    moreQueryKeys:names.length>24,
    fragmentPresent:Boolean(url.hash),
    embeddedCredentials:Boolean(url.username||url.password),
    warnings,
    requestsSent:0,
  });
}
export function inspectJwtStructureLocally(value){
  bytesWithin(value,8192);
  const parts=value.trim().split(".");
  if(parts.length!==3||parts.some(x=>!x||x.length>4096))
    throw Error("A compact signed JWT has three nonempty dot-separated parts.");
  const parse=(part)=>{
    const bytes=bytesFromBase64(part,true);
    const decoded=printable(bytes);
    let parsed;
    try{parsed=JSON.parse(decoded);}
    catch{throw Error("JWT header or payload is not valid JSON.");}
    if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")
      throw Error("JWT header and payload must be JSON objects.");
    return parsed;
  };
  const header=parse(parts[0]),claims=parse(parts[1]);
  if(typeof header.alg!=="string"||header.alg.length>40)
    throw Error("JWT algorithm field is missing or malformed.");
  const warnings=[
    "Structure only: the JWT signature is NOT checked. Never trust its claims for authorization.",
  ];
  if(header.alg.toLowerCase()==="none")
    warnings.push("Unsigned algorithm 'none' is unsafe for authenticated tokens.");
  const exp=claims.exp;
  let expiresAt=null;
  if(exp!==undefined){
    if(typeof exp==="number"&&Number.isSafeInteger(exp)&&exp>=0&&
       exp<=8640000000000){
      try{expiresAt=new Date(exp*1000).toISOString();}
      catch{warnings.push("Expiry time cannot be represented.");}
    }else warnings.push("Expiry claim is not a valid numeric Unix timestamp.");
  }else warnings.push("No exp claim supplied; lifetime cannot be assessed.");
  return Object.freeze({
    algorithm:header.alg,
    type:typeof header.typ==="string"?header.typ.slice(0,40):"(unspecified)",
    claimNames:Object.keys(claims).filter(x=>x.length<=64).sort().slice(0,32),
    claimsTruncated:Object.keys(claims).length>32,
    expiresAt,
    hasIssuer:Object.hasOwn(claims,"iss"),
    hasAudience:Object.hasOwn(claims,"aud"),
    signatureVerified:false,
    authorizationVerified:false,
    warnings,
  });
}
export function redactTrainingLogLocally(value){
  bytesWithin(value);
  let count=0;
  let text=value;
  const apply=(pattern,replacement)=>{
    text=text.replace(pattern,(...args)=>{
      count++;
      return replacement(...args);
    });
  };
  apply(/(\bAuthorization\s*:\s*(?:Bearer|Basic)\s+)([^\s\r\n;]+)/gi,
    (_match,prefix)=>prefix+"[REDACTED]");
  apply(/(\b(?:Cookie|Set-Cookie)\s*:\s*)([^\r\n]+)/gi,
    (_match,prefix)=>prefix+"[REDACTED]");
  apply(/(\b(?:api[_-]?key|access[_-]?token|password|passwd|client[_-]?secret|secret|token)\s*[:=]\s*)(["']?)(?!\[REDACTED\])([^\s&;,'"]+)/gi,
    (_match,prefix)=>prefix+"[REDACTED]");
  apply(/(\b[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\s*=\s*)(["']?)(?!\[REDACTED\])([^\s&;,'"]+)/g,
    (_match,prefix)=>prefix+"[REDACTED]");
  return Object.freeze({
    redactedText:text,
    replacements:count,
    exhaustive:false,
    saved:false,
  });
}
export async function hashTextLocally(value,cryptoApi=globalThis.crypto){
  const bytes=bytesWithin(value);
  if(!cryptoApi?.subtle?.digest)
    throw Error("SHA-256 needs a secure browser context with Web Crypto.");
  const digest=await cryptoApi.subtle.digest("SHA-256",bytes);
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  return Object.freeze({algorithm:"SHA-256",byteCount:bytes.length,hex,uploaded:false});
}


// Clearly synthetic, unsigned practice token. Its third segment is dummy text.
// Never use this fixture for authentication or for a real bearer header.
const fixtureB64url=value=>btoa(JSON.stringify(value))
  .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
export const sampleTrainingJwt=[
  fixtureB64url({alg:"HS256",typ:"JWT"}),
  fixtureB64url({iss:"training.local",exp:1893456000,scope:"read"}),
  "bm90LXZlcmlmaWVk",
].join(".");
