/**
 * ETERNYX Labs: five strictly browser-local identity, network and policy
 * exercises. No I/O, storage, real identity verification or live scanning.
 */
import {calculateIpv6SubnetLocally} from "./eternyxLabsAdvanced.mjs";

const encoder=new TextEncoder();
function bound(value,label,max=4096){
  if(typeof value!=="string"||encoder.encode(value).length>max||
     /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw Error(label+" must be bounded text without control characters.");
  return value;
}
const binary64=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(""));
const url64=bytes=>binary64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const toBytes=value=>Uint8Array.from(value.match(/.{2}/g)||[],x=>parseInt(x,16));
function digestApi(api){
  if(!api?.subtle?.digest)throw Error("This exercise requires Web Crypto in a secure browser context.");
}
export async function derivePkceChallengeLocally(verifier,cryptoApi=globalThis.crypto){
  const text=bound(verifier,"PKCE verifier",128);
  if(text.length<43||text.length>128||!/^[A-Za-z0-9._~-]+$/.test(text))
    throw Error("A PKCE verifier requires 43–128 RFC 7636 unreserved ASCII characters.");
  digestApi(cryptoApi);
  const hash=new Uint8Array(await cryptoApi.subtle.digest("SHA-256",encoder.encode(text)));
  if(hash.length!==32)throw Error("Unexpected PKCE SHA-256 digest length.");
  return Object.freeze({challenge:url64(hash),method:"S256",verifierLength:text.length,
    sent:false,stored:false,
    caveat:"This is PKCE S256 computation only. Browser state handling, OAuth redirect checks, issuer trust and token exchange are not performed."});
}
export async function createPkcePairLocally(cryptoApi=globalThis.crypto){
  if(!cryptoApi?.getRandomValues)throw Error("Secure random generation requires browser Web Crypto.");
  const random=new Uint8Array(32);
  cryptoApi.getRandomValues(random);
  const verifier=url64(random);
  const derived=await derivePkceChallengeLocally(verifier,cryptoApi);
  return Object.freeze({
    verifier,challenge:derived.challenge,method:"S256",
    randomBytes:32,sent:false,stored:false,
    caveat:"The verifier is sensitive OAuth transient data. This browser exercise never stores or transmits it; do not reuse it in a real session.",
  });
}
function hmacApi(api,mode){
  if(!api?.subtle?.importKey||!api?.subtle?.[mode])
    throw Error("HMAC requires browser Web Crypto with key import and "+mode+".");
}
async function hmacKey(value,mode,api){
  const secret=bound(value,"HMAC training key",256);
  if(!secret||!secret.trim())throw Error("Enter a synthetic HMAC training key.");
  return api.subtle.importKey("raw",encoder.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,[mode]);
}
export async function signHmacLocally(message,trainingKey,cryptoApi=globalThis.crypto){
  bound(message,"HMAC message");
  hmacApi(cryptoApi,"sign");
  const key=await hmacKey(trainingKey,"sign",cryptoApi);
  const signature=new Uint8Array(await cryptoApi.subtle.sign("HMAC",key,encoder.encode(message)));
  if(signature.length!==32)throw Error("Unexpected HMAC-SHA256 signature length.");
  return Object.freeze({
    signatureHex:hex(signature),algorithm:"HMAC-SHA256",
    keyDisplayed:false,requestsSent:0,authenticatedIdentity:false,
    caveat:"This proves only possession of the same synthetic symmetric key, not sender identity, freshness, replay protection or production webhook authentication.",
  });
}
export async function verifyHmacLocally(message,trainingKey,signatureHex,cryptoApi=globalThis.crypto){
  bound(message,"HMAC message");
  if(typeof signatureHex!=="string"||!/^[a-fA-F0-9]{64}$/.test(signatureHex))
    throw Error("Expected exactly 64 hexadecimal characters for an HMAC-SHA256 signature.");
  hmacApi(cryptoApi,"verify");
  const key=await hmacKey(trainingKey,"verify",cryptoApi);
  const verified=await cryptoApi.subtle.verify("HMAC",key,toBytes(signatureHex),encoder.encode(message));
  return Object.freeze({
    verified:Boolean(verified),algorithm:"HMAC-SHA256",
    keyDisplayed:false,requestsSent:0,identityVerified:false,
    caveat:"A matching HMAC proves shared-key message integrity only. It does not bind a human identity or prevent replay.",
  });
}
function ipv4Number(value){
  if(!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value))
    throw Error("Use four canonical dotted-decimal IPv4 octets.");
  const octets=value.split(".").map(Number);
  if(octets.some(x=>x>255))throw Error("IPv4 octets must be 0–255.");
  return octets.reduce((acc,x)=>((acc<<8)|x)>>>0,0);
}
function ipv6Number(value){
  const address=calculateIpv6SubnetLocally(value+"/128").address;
  const [left,right]=address.split("::"),before=left?left.split(":"):[],
    after=right?right.split(":"):[];
  const parts=address.includes("::")?
    [...before,...Array(8-before.length-after.length).fill("0"),...after]:address.split(":");
  return parts.reduce((n,p)=>(n<<16n)|BigInt(parseInt(p,16)),0n);
}
export function checkCidrMembershipLocally(cidr,address){
  const net=bound(cidr,"CIDR",96).trim(),ip=bound(address,"Address",64).trim();
  const split=net.split("/");
  if(split.length!==2)throw Error("Enter a CIDR network/prefix.");
  if(net.includes(":")){
    if(!ip.includes(":"))throw Error("CIDR and tested address must be the same IP family.");
    const result=calculateIpv6SubnetLocally(net);
    const target=ipv6Number(ip),first=ipv6Number(result.network),last=ipv6Number(result.last);
    return Object.freeze({family:"IPv6",prefix:result.prefix,address:calculateIpv6SubnetLocally(ip+"/128").address,
      network:result.network,rangeEnd:result.last,contained:target>=first&&target<=last,
      probesSent:0,aclEnforced:false,caveat:"128-bit local membership arithmetic, not a live route, ACL, subnet scan or firewall rule."});
  }
  if(ip.includes(":"))throw Error("CIDR and tested address must be the same IP family.");
  if(!/^(0|[1-9]|[12]\d|3[0-2])$/.test(split[1]))
    throw Error("Invalid IPv4 CIDR prefix.");
  const base=ipv4Number(split[0]),test=ipv4Number(ip),prefix=Number(split[1]);
  const mask=prefix===0?0:(0xffffffff << (32-prefix))>>>0;
  const lower=(base&mask)>>>0,upper=(lower|(~mask>>>0))>>>0;
  const dotted=num=>[24,16,8,0].map(x=>(num>>>x)&255).join(".");
  return Object.freeze({family:"IPv4",prefix,address:dotted(test),network:dotted(lower),
    rangeEnd:dotted(upper),contained:test>=lower&&test<=upper,probesSent:0,aclEnforced:false,
    caveat:"Offline address membership only, including network/broadcast numbers; not actual firewall authorization."});
}
export function inspectHstsLocally(value){
  let raw=bound(value,"HSTS",1024).trim();
  raw=raw.replace(/^Strict-Transport-Security:\s*/i,"");
  if(!raw||/[\r\n]/.test(raw))throw Error("Enter one Strict-Transport-Security value.");
  const directives=new Map(),warnings=[];
  for(const token of raw.split(";")){
    const line=token.trim();if(!line)continue;
    const m=line.match(/^([A-Za-z][A-Za-z-]*)(?:\s*=\s*(\d{1,10}))?$/);
    if(!m)throw Error("HSTS directive syntax is invalid.");
    const name=m[1].toLowerCase();
    if(directives.has(name))warnings.push("Duplicate "+name+" directive.");
    directives.set(name,m[2]??null);
    if(!["max-age","includesubdomains","preload"].includes(name))
      warnings.push("Unknown HSTS directive: "+name+".");
    if(name!=="max-age"&&m[2]!=null)throw Error("HSTS flag must not have a value.");
  }
  const seconds=directives.get("max-age");
  if(seconds==null||!/^(0|[1-9]\d{0,9})$/.test(seconds))
    throw Error("HSTS requires one valid max-age in seconds.");
  const maxAge=Number(seconds),subdomains=directives.has("includesubdomains"),
    preload=directives.has("preload");
  if(maxAge===0)warnings.push("max-age=0 requests deletion of the HSTS policy.");
  else if(maxAge<31536000)warnings.push("One-year max-age is commonly expected for preload eligibility.");
  if(!subdomains)warnings.push("includeSubDomains is absent; subdomains are not covered by this policy.");
  if(preload&&(maxAge<31536000||!subdomains))
    warnings.push("preload requires stronger criteria; this example fails basic local preload checks.");
  return Object.freeze({maxAgeSeconds:maxAge,includeSubDomains:subdomains,
    preloadRequested:preload,warnings,warningCount:warnings.length,
    remoteHostChecked:false,preloadStatusVerified:false,
    caveat:"Static HSTS lint only. Real browsers honor HSTS only over secure HTTPS and preload eligibility requires checks not performed here."});
}
export function inspectDmarcLocally(value){
  let raw=bound(value,"DMARC TXT",2048).trim().replace(/^"(.*)"$/,"$1");
  if(!raw||/[\r\n]/.test(raw))throw Error("Enter one synthetic DMARC record.");
  const fields=new Map(),warnings=[];
  for(const chunk of raw.split(";")){
    const part=chunk.trim();if(!part)continue;
    const m=part.match(/^([a-zA-Z]{1,8})\s*=\s*(.+)$/);
    if(!m)throw Error("DMARC tag has invalid syntax.");
    const key=m[1].toLowerCase(),v=m[2].trim();
    if(fields.has(key))throw Error("Duplicate DMARC tag: "+key+".");
    fields.set(key,v);
  }
  if(fields.get("v")!=="DMARC1")throw Error("DMARC TXT must declare v=DMARC1.");
  const p=fields.get("p");
  if(!["none","quarantine","reject"].includes(p))
    throw Error("DMARC policy p must be none, quarantine or reject.");
  const sp=fields.get("sp")??p;
  if(!["none","quarantine","reject"].includes(sp))throw Error("Invalid subdomain policy.");
  const pctRaw=fields.get("pct")??"100";
  if(!/^(0|[1-9]\d?|100)$/.test(pctRaw))throw Error("DMARC pct must be 0–100.");
  const pct=Number(pctRaw),adkim=fields.get("adkim")??"r",aspf=fields.get("aspf")??"r";
  if(!["r","s"].includes(adkim)||!["r","s"].includes(aspf))throw Error("Invalid DMARC alignment mode.");
  const reports=fields.has("rua")?fields.get("rua").split(",").map(x=>x.trim()):[];
  if(reports.length>5||reports.some(x=>!/^mailto:[^\s@,;]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:!\d{1,9}[kKmMgGtT]?)?$/.test(x)))
    throw Error("DMARC aggregate report URI is malformed.");
  if(p==="none")warnings.push("p=none is monitoring-only and does not request quarantine or rejection.");
  if(pct<100)warnings.push("pct below 100 requests partial rollout of the domain policy.");
  if(sp==="none"&&p!=="none")warnings.push("The subdomain policy explicitly opts out of enforcement.");
  if(!reports.length)warnings.push("No aggregate rua reports configured for visibility.");
  const extras=[...fields.keys()].filter(x=>!["v","p","sp","pct","adkim","aspf","rua"].includes(x));
  if(extras.length)warnings.push("Additional DMARC tags were not interpreted by this teaching parser.");
  return Object.freeze({
    policy:p,subdomainPolicy:sp,percentage:pct,
    dkimAlignment:adkim,spfAlignment:aspf,aggregateReportCount:reports.length,
    warnings,warningCount:warnings.length,
    reportAddressesExposed:false,dnsQueriesSent:0,emailAuthenticated:false,
    caveat:"Static subset of DMARC policy. It does not resolve DNS, validate report recipients, evaluate SPF/DKIM, or authenticate mail.",
  });
}
