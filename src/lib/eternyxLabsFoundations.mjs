/** Offline-only, bounded educational security foundations. No network, storage, auth or scanner. */
const max=4096;
const bounded=(s,name,limit=max)=>{
  if(typeof s!=="string"||new TextEncoder().encode(s).length>limit)
    throw Error(name+" must fit the local input limit.");
  return s;
};
const ipNumber=s=>{
  const p=s.split(".");
  if(p.length!==4||p.some(x=>!/^(0|[1-9][0-9]{0,2})$/.test(x)||Number(x)>255))
    throw Error("Use four canonical IPv4 octets.");
  return p.reduce((n,x)=>((n<<8)|Number(x))>>>0,0);
};
const ipText=n=>[24,16,8,0].map(b=>(n>>>b)&255).join(".");
export function calculateIpv4Subnet(text){
  const parts=bounded(text,"CIDR",64).trim().split("/");
  if(parts.length!==2||!/^(?:[0-9]|[12][0-9]|3[012])$/.test(parts[1]))
    throw Error("Use IPv4/prefix (for example 192.168.10.42/24).");
  const prefix=Number(parts[1]),ip=ipNumber(parts[0]);
  const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  const network=(ip&mask)>>>0,broadcast=(network|(~mask>>>0))>>>0;
  const total=2**(32-prefix);
  return Object.freeze({
    address:ipText(ip),prefix,
    network:ipText(network),broadcast:ipText(broadcast),
    mask:ipText(mask),wildcard:ipText((~mask)>>>0),
    first:ipText(prefix<=30?network+1:network),
    last:ipText(prefix<=30?broadcast-1:broadcast),
    addressCount:total,usableCount:prefix===32?1:prefix===31?2:total-2,
    caveat:prefix===31?"RFC 3021 point-to-point /31 may use both addresses.":prefix===32?
      "A /32 represents one address.":"Conventional IPv4 subnet reserves network and broadcast addresses.",
    networkRequests:0,
  });
}
const octal=(value,name)=>{
  if(typeof value!=="string"||!/^(0?[0-7]{3})$/.test(value))
    throw Error(name+" must have exactly three octal digits (optional leading zero).");
  return parseInt(value,8);
};
const permission=n=>[6,3,0].map(shift=>{
  const bits=(n>>>shift)&7;
  return (bits&4?"r":"-")+(bits&2?"w":"-")+(bits&1?"x":"-");
});
export function simulateUnixUmask(requested,umask){
  const mode=octal(requested,"Requested mode"),mask=octal(umask,"umask");
  const result=mode&(~mask&0o777);
  const [owner,group,other]=permission(result);
  return Object.freeze({
    requested:mode.toString(8).padStart(3,"0"),
    umask:mask.toString(8).padStart(3,"0"),
    resultingMode:result.toString(8).padStart(3,"0"),
    owner,group,other,
    caveat:"The umask only removes bits at file creation; it does not change existing files, add rights, or evaluate ACLs and special bits.",
  });
}
export function lintCspPolicy(value){
  const raw=bounded(value,"CSP").trim();
  if(!raw)throw Error("Paste a CSP policy.");
  const seen=new Map(),warnings=[];
  for(const segment of raw.split(";")){
    const tokens=segment.trim().split(/\s+/).filter(Boolean);
    if(!tokens.length)continue;
    const name=tokens.shift().toLowerCase();
    if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error("Invalid CSP directive name.");
    if(seen.has(name)){
      warnings.push("Repeated "+name+" directive: browsers generally use the first occurrence.");
      continue;
    }
    seen.set(name,tokens);
  }
  for(const [name,detail] of [
    ["default-src","Missing default-src fallback; unspecified fetch directives may remain unrestricted."],
    ["object-src","Consider restricting object-src, often to 'none'."],
    ["base-uri","Consider restricting base-uri."],
    ["frame-ancestors","Consider controlling embedding with frame-ancestors in an HTTP header."],
    ["form-action","Consider restricting form-action destinations."],
  ])if(!seen.has(name))warnings.push(detail);
  for(const [name,tokens] of seen){
    if(["script-src","script-src-elem","script-src-attr"].includes(name)){
      if(tokens.includes("'unsafe-inline'"))
        warnings.push(name+" contains 'unsafe-inline'; review script injection exposure.");
      if(tokens.includes("'unsafe-eval'"))
        warnings.push(name+" contains 'unsafe-eval'; review dynamic evaluation.");
    }
    if(tokens.includes("*"))warnings.push(name+" allows wildcard sources.");
    if(tokens.includes("http:"))warnings.push(name+" permits arbitrary plain HTTP origins.");
  }
  return Object.freeze({
    directiveCount:seen.size,names:[...seen.keys()],
    warnings,warningCount:warnings.length,
    securityCertified:false,
    caveat:"Static educational lint only; not a complete browser CSP parser or a live policy assessment.",
  });
}
function canonicalOrigin(value){
  const raw=bounded(value,"Origin",512).trim();
  if(/[\s\r\n]/.test(raw))throw Error("Enter one canonical origin.");
  let parsed;
  try{parsed=new URL(raw);}catch{throw Error("Invalid origin.");}
  if(!["http:","https:"].includes(parsed.protocol)||parsed.username||
    parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash||
    parsed.origin==="null"||raw.replace(/\/$/,"")!==parsed.origin)
    throw Error("Enter an HTTP(S) origin only, without path, credentials or query.");
  return parsed.origin;
}
export function evaluateCorsHeaderExample({requestOrigin,resourceOrigin,headers,credentials=false}={}){
  const requester=canonicalOrigin(requestOrigin),resource=canonicalOrigin(resourceOrigin);
  const lines=bounded(headers,"Response headers").split(/\r?\n/);
  if(typeof credentials!=="boolean")throw Error("Credentials selection must be a boolean.");
  const map=new Map();
  for(const row of lines){
    if(!row.trim())continue;
    const i=row.indexOf(":"),key=row.slice(0,i).trim().toLowerCase();
    if(i<1||!/^[a-z0-9-]+$/.test(key))throw Error("Malformed response header.");
    map.set(key,[...(map.get(key)??[]),row.slice(i+1).trim()]);
  }
  const allowed=map.get("access-control-allow-origin")??[];
  const cred=map.get("access-control-allow-credentials")??[];
  const crossOrigin=requester!==resource;
  let readAllowed=false,reason="";
  if(!crossOrigin){readAllowed=true;reason="Same-origin requests do not require CORS approval.";}
  else if(allowed.length!==1)reason="A cross-origin response needs one Access-Control-Allow-Origin value.";
  else if(allowed[0]!==requester&&allowed[0]!=="*")reason="The allowed origin does not match.";
  else if(credentials&&(allowed[0]==="*"||cred.length!==1||cred[0]!=="true"))
    reason="Credentialed requests require an exact allowed origin and Access-Control-Allow-Credentials: true.";
  else {readAllowed=true;reason="Simplified response-sharing conditions pass, not server authorization.";}
  const warnings=["Educational response-only check: preflights, redirects, methods, browser quirks and server authorization are not checked."];
  if(allowed.includes("null"))warnings.push("Allow-Origin: null can expose data to opaque origins.");
  if(allowed.includes("*"))warnings.push("Wildcard origin is unsuitable for credentialed cross-origin reads.");
  if(allowed.length>1||cred.length>1)warnings.push("Repeated CORS headers can invalidate browser access.");
  return Object.freeze({
    requestOrigin:requester,resourceOrigin:resource,crossOrigin,credentials,
    readAllowed,reason,warnings,networkRequests:0,
    preflightVerified:false,authorizationVerified:false,
  });
}
export function reviewSetCookieExample(value){
  let raw=bounded(value,"Cookie header").trim();
  if(!raw||/[\r\n]/.test(raw))throw Error("Enter only one Set-Cookie header line.");
  raw=raw.replace(/^set-cookie:\s*/i,"");
  const entries=raw.split(";").map(x=>x.trim());
  const first=entries.shift(),i=first.indexOf("=");
  if(i<=0)throw Error("Expected a cookie name=value pair.");
  const name=first.slice(0,i).trim();
  if(!/^[a-zA-Z0-9!#$%&'*+\-.^_\x60|~]+$/.test(name)||name.length>128)
    throw Error("Invalid cookie name.");
  const attributes=new Map(),warnings=[];
  for(const item of entries){
    if(!item)continue;
    const eq=item.indexOf("=");
    const k=(eq<0?item:item.slice(0,eq)).trim().toLowerCase();
    if(!/^[a-z][a-z0-9-]*$/.test(k))throw Error("Invalid cookie attribute.");
    if(attributes.has(k))warnings.push("Repeated "+k+" attribute: handling may vary.");
    attributes.set(k,eq<0?"":item.slice(eq+1).trim());
  }
  const secure=attributes.has("secure"),httpOnly=attributes.has("httponly");
  const sameSite=(attributes.get("samesite")??"").toLowerCase();
  const domain=attributes.has("domain");
  if(!secure)warnings.push("Missing Secure: consider transport protections.");
  if(!httpOnly)warnings.push("Missing HttpOnly: review for session cookies; not mandatory for every cookie.");
  if(!sameSite)warnings.push("No explicit SameSite policy.");
  else if(!["strict","lax","none"].includes(sameSite))
    warnings.push("Unrecognized SameSite value.");
  if(sameSite==="none"&&!secure)warnings.push("SameSite=None needs Secure in modern browsers.");
  if(name.startsWith("__Secure-")&&!secure)
    warnings.push("__Secure- prefix needs Secure and a secure origin.");
  if(name.startsWith("__Host-")&&(!secure||domain||attributes.get("path")!=="/"))
    warnings.push("__Host- prefix requires Secure, Path=/ and no Domain.");
  return Object.freeze({
    cookieName:name,secure,httpOnly,
    sameSite:sameSite||"(unspecified)",
    rootPath:attributes.get("path")==="/",
    domainSpecified:domain,
    warnings,warningCount:warnings.length,
    cookieValueShown:false,liveCookieSet:false,securityCertified:false,
  });
}
