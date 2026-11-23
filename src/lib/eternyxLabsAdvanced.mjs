/**
 * ETERNYX Labs — five real, entirely offline security/dev diagnostics.
 * All inputs stay in browser memory. No DNS, HTTP, VM, persistence or token use.
 */
const MAX=4096;
const bounded=(value,name,max=MAX)=>{
  if(typeof value!=="string"||new TextEncoder().encode(value).length>max||
     /[\u0000]/.test(value))throw Error(name+" exceeds the local input limit.");
  return value;
};
const IPV6_MAX=(1n<<128n)-1n;

function parseIpv6(ip){
  if(typeof ip!=="string"||ip.length>39||!/^[0-9a-fA-F:]+$/.test(ip)||
     ip.includes(":::")||ip.split("::").length>2)
    throw Error("Enter a valid IPv6 address without brackets or IPv4-mapped notation.");
  const compressed=ip.includes("::");
  const [left,right]=compressed?ip.split("::"):[ip,""];
  const a=left?left.split(":"):[],b=right?right.split(":"):[];
  const all=[...a,...b];
  if(all.some(s=>!/^[0-9a-fA-F]{1,4}$/.test(s)))throw Error("Invalid IPv6 hextet.");
  if(compressed?a.length+b.length>=8:all.length!==8)
    throw Error("IPv6 compression or group count is invalid.");
  const parts=compressed?[...a,...Array(8-a.length-b.length).fill("0"),...b]:all;
  if(parts.length!==8)throw Error("IPv6 must contain eight expanded groups.");
  return parts.reduce((num,p)=>(num<<16n)|BigInt(parseInt(p,16)),0n);
}
function formatIpv6(value){
  const parts=Array.from({length:8},(_,i)=>Number((value>>BigInt((7-i)*16))&0xffffn).toString(16));
  let bestStart=-1,bestLen=0;
  for(let i=0;i<8;){
    if(parts[i]!=="0"){i++;continue;}
    let j=i;while(j<8&&parts[j]==="0")j++;
    if(j-i>bestLen&&j-i>=2){bestStart=i;bestLen=j-i;}
    i=j;
  }
  if(bestStart<0)return parts.join(":");
  const a=parts.slice(0,bestStart).join(":"),b=parts.slice(bestStart+bestLen).join(":");
  return a+"::"+b;
}
export function calculateIpv6SubnetLocally(value){
  const raw=bounded(value,"IPv6 CIDR",96).trim();
  const pieces=raw.split("/");
  if(pieces.length!==2||!/^(0|[1-9][0-9]{0,2})$/.test(pieces[1]))
    throw Error("Enter an IPv6 address/prefix (for example 2001:db8::2/64).");
  const prefix=Number(pieces[1]);
  if(prefix>128)throw Error("IPv6 prefix must be between /0 and /128.");
  const address=parseIpv6(pieces[0]);
  const lowerBits=(1n<<BigInt(128-prefix))-1n;
  const network=address&(~lowerBits&IPV6_MAX);
  const last=network|lowerBits;
  return Object.freeze({
    address:formatIpv6(address),
    network:formatIpv6(network),
    last:formatIpv6(last),
    prefix,
    addressCount:(1n<<BigInt(128-prefix)).toString(),
    first:formatIpv6(network),
    requestsSent:0,
    caveat:"Pure unsigned 128-bit subnet math. IPv6 does not use IPv4-style broadcast. Address count does not imply all addresses are assignable to hosts.",
  });
}

export function inspectCachePolicyLocally(value,{sensitive=false}={}){
  const raw=bounded(value,"Cache-Control",2048).trim();
  if(typeof sensitive!=="boolean")throw Error("Sensitive-resource selection must be boolean.");
  if(!raw)throw Error("Enter a Cache-Control directive list.");
  const line=raw.replace(/^Cache-Control:\s*/i,"");
  if(/[\r\n]/.test(line))throw Error("Inspect one Cache-Control header value.");
  const entries=line.split(",").map(x=>x.trim());
  if(entries.length>30||entries.some(x=>!x))throw Error("Invalid Cache-Control list.");
  const tokens=new Map(),warnings=[];
  for(const entry of entries){
    const m=entry.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]{0,48})"|([a-zA-Z0-9_-]{1,48})))?$/);
    if(!m)throw Error("Invalid Cache-Control directive.");
    const name=m[1].toLowerCase(),param=m[2]??m[3]??null;
    if(tokens.has(name))warnings.push("Duplicate "+name+" directive; interpretation may vary.");
    tokens.set(name,param);
  }
  const maxAge=tokens.get("max-age"),sMaxAge=tokens.get("s-maxage");
  for(const [label,val] of [["max-age",maxAge],["s-maxage",sMaxAge]]){
    if(val!==undefined&&(val===null||!/^(0|[1-9][0-9]{0,9})$/.test(val)||
        Number(val)>315360000))
      throw Error(label+" must be a bounded nonnegative number of seconds.");
  }
  const noStore=tokens.has("no-store"),isPublic=tokens.has("public"),
    isPrivate=tokens.has("private"),noCache=tokens.has("no-cache");
  if(isPublic&&isPrivate)warnings.push("Conflicting public and private caching directives.");
  if(noStore&&(isPublic||tokens.has("immutable")||tokens.has("max-age")))
    warnings.push("no-store conflicts with cache lifetime/public hints; prefer a clear policy.");
  if(sensitive&&!noStore)warnings.push("Sensitive response: consider no-store to prevent reuse of confidential content.");
  if(sensitive&&isPublic)warnings.push("Sensitive response: public caching risks shared-cache exposure.");
  if(!noStore&&!noCache&&!isPrivate&&!isPublic&&!tokens.has("max-age"))
    warnings.push("No explicit cache reuse directive: caches may apply heuristic freshness.");
  return Object.freeze({
    directiveNames:[...tokens.keys()].sort(),
    directiveCount:tokens.size,
    publicCachingRequested:isPublic,
    privateCachingRequested:isPrivate,
    noStore,
    requiresRevalidation:noCache,
    maxAgeSeconds:maxAge!==undefined&&/^(0|[1-9][0-9]{0,9})$/.test(maxAge??"")?
      Number(maxAge):null,
    warnings,warningCount:warnings.length,
    responseFetched:false,cacheBehaviorVerified:false,
    caveat:"Static Cache-Control review only. Browser and intermediary behavior, authorization, Vary, and actual sensitive data are not verified.",
  });
}

export function inspectSpfRecordLocally(value){
  const input=bounded(value,"SPF TXT",2048).trim().replace(/^"(.*)"$/,"$1");
  if(!/^v=spf1(?:\s|$)/i.test(input))throw Error("Record must start with v=spf1.");
  const parts=input.split(/\s+/);
  if(parts.length>40)throw Error("SPF example exceeds token limit.");
  const terms=parts.slice(1);
  let lookupTerms=0,allCount=0;
  const warnings=[];
  const mechanisms=[];
  for(const term of terms){
    const m=term.match(/^([+~?-]?)([a-zA-Z][a-zA-Z0-9]*)(?::([^\s/]{1,200}))?(?:\/(\d{1,3}))?$/);
    if(!m)throw Error("Malformed SPF training mechanism.");
    const qualifier=m[1]||"+",key=m[2].toLowerCase(),arg=m[3]??null,prefix=m[4];
    if(!["all","ip4","ip6","include","a","mx","ptr","exists","redirect","exp"].includes(key))
      throw Error("Unsupported SPF mechanism or modifier.");
    if(key==="all"){allCount++;if(arg!==null||prefix!==undefined)throw Error("all must not have an argument.");}
    if(["include","exists","redirect","exp"].includes(key)&&!arg)
      throw Error(key+" requires a target.");
    if(["ip4","ip6"].includes(key)&&!arg)
      throw Error(key+" requires an address.");
    if(prefix!==undefined&&(Number(prefix)>(key==="ip6"?128:32)||!["ip4","ip6","a","mx"].includes(key)))
      throw Error("Invalid SPF CIDR prefix.");
    if(["a","mx","include","exists","ptr","redirect"].includes(key))
      lookupTerms++;
    mechanisms.push({qualifier,key});
  }
  const allTerms=terms.filter(x=>/^[+~?-]?all$/i.test(x));
  if(allCount>1)warnings.push("More than one all mechanism was found.");
  if(allTerms.includes("+all")||allTerms.includes("all"))
    warnings.push("Permissive +all explicitly authorizes all senders.");
  if(!allCount&&!mechanisms.some(x=>x.key==="redirect"))
    warnings.push("No all or redirect termination mechanism supplied.");
  if(lookupTerms>10)
    warnings.push("More than ten DNS-lookup-producing terms are present; SPF evaluation is limited to ten lookups.");
  if(mechanisms.some(x=>x.key==="ptr"))
    warnings.push("ptr is discouraged due to DNS and operational costs.");
  if(mechanisms.some(x=>x.key==="all")&&mechanisms.at(-1)?.key!=="all")
    warnings.push("Terms after all cannot be reached in a simple sequential evaluation.");
  return Object.freeze({
    mechanismCount:mechanisms.length,
    lookupProducingTerms:lookupTerms,
    allMechanisms:allCount,
    mechanismNames:mechanisms.map(x=>x.key),
    warnings,warningCount:warnings.length,
    dnsQueriesSent:0,senderAuthorized:false,
    caveat:"Simplified SPF syntax training, not DNS evaluation: macros, modifiers, IPv4/IPv6 syntax, recursive lookup counts, and real mail authorization require a standards-compliant SPF engine.",
  });
}

export function simulateTokenBucketLocally({capacity=5,refillPerSecond=1,timestamps="0,0,0,0,0,1,2"}={}){
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>100||
     !Number.isSafeInteger(refillPerSecond)||refillPerSecond<1||refillPerSecond>20)
    throw Error("Capacity and refill rate must be bounded positive integers.");
  const input=bounded(timestamps,"Request seconds",512).trim();
  if(!/^\d+(?:\s*,\s*\d+)*$/.test(input))throw Error("Use comma-separated nonnegative whole seconds.");
  const times=input.split(",").map(x=>Number(x.trim()));
  if(times.length<1||times.length>60||times.some(x=>!Number.isSafeInteger(x)||x>3600))
    throw Error("Use 1–60 requests within an hour.");
  if(times.some((t,i)=>i>0&&t<times[i-1]))
    throw Error("Request timestamps must be in nondecreasing order.");
  let available=capacity,previous=0,allowed=0,denied=0;
  const records=[];
  for(const second of times){
    available=Math.min(capacity,available+(second-previous)*refillPerSecond);
    previous=second;
    const accepted=available>=1;
    if(accepted){available--;allowed++;}else denied++;
    records.push(Object.freeze({second,allowed:accepted,tokensRemaining:available}));
  }
  return Object.freeze({
    capacity,refillPerSecond,requests:times.length,allowed,denied,
    finalTokens:available,records:Object.freeze(records),
    requestsSent:0,serverRateLimitEnforced:false,
    caveat:"Deterministic integer-second token-bucket training. Does not enforce real API rate limits, concurrency, distributed quotas, or fractional-second refill.",
  });
}

const SRI_HASH_ALGORITHMS=Object.freeze({
  sha256:Object.freeze({webCrypto:"SHA-256",digestBits:256}),
  sha384:Object.freeze({webCrypto:"SHA-384",digestBits:384}),
  sha512:Object.freeze({webCrypto:"SHA-512",digestBits:512}),
});
/** Static SRI format mathematics; does NOT compute or certify a hash. */
export function inspectSriFormatLocally(value,{algorithm="sha384"}={}){
  const bytes=new TextEncoder().encode(bounded(value,"Resource content"));
  if(!Object.prototype.hasOwnProperty.call(SRI_HASH_ALGORITHMS,algorithm))
    throw Error("Choose a supported SRI digest algorithm.");
  const digestBits=SRI_HASH_ALGORITHMS[algorithm].digestBits;
  return Object.freeze({
    algorithm,inputBytes:bytes.length,
    digestBits,digestBytes:digestBits/8,
    base64Length:4*Math.ceil((digestBits/8)/3),
    hashComputed:false,requestsSent:0,
    caveat:"Format and length calculation only. A hash must be computed with trusted bytes and a real cryptographic digest.",
  });
}
export async function generateSriLocally(value,{algorithm="sha384",cryptoApi=globalThis.crypto}={}){
  const format=inspectSriFormatLocally(value,{algorithm});
  const bytes=new TextEncoder().encode(value);
  if(!cryptoApi?.subtle?.digest)
    throw Error("Subresource Integrity requires Web Crypto in a secure browser context.");
  const digest=new Uint8Array(await cryptoApi.subtle.digest(SRI_HASH_ALGORITHMS[algorithm].webCrypto,bytes));
  if(digest.length!==format.digestBytes)
    throw Error("Unexpected Subresource Integrity digest length.");
  const base64=btoa(Array.from(digest,byte=>String.fromCharCode(byte)).join(""));
  return Object.freeze({
    integrity:algorithm+"-"+base64,
    algorithm,byteCount:bytes.length,
    requestsSent:0,resourceFetched:false,
    caveat:"SRI binds exact resource bytes to a trusted HTML integrity attribute. This local example does not load the external resource, check CORS, verify publisher identity, or deploy HTML.",
  });
}
