/** Bounded, offline-only defensive training. Never fetch, scan, store, or authorize. */
const bound=(s,label,max=8192)=>{
  if(typeof s!=="string"||new TextEncoder().encode(s).length>max||s.includes("\0"))
    throw Error(label+" must be bounded plain text.");
  return s;
};
const domain=s=>{
  const v=s.endsWith(".")?s.slice(0,-1):s;
  return v==="@"||(v.length>0&&v.length<=253&&v.split(".").every(x=>
    x.length>0&&x.length<=63&&/^[a-zA-Z0-9_*][a-zA-Z0-9_-]*$/.test(x)));
};
const isIp=s=>{
  const p=s.split(".");
  return p.length===4&&p.every(x=>/^(0|[1-9][0-9]{0,2})$/.test(x)&&Number(x)<=255);
};
export function inspectDnsZoneLocally(text){
  const rows=bound(text,"DNS zone").split(/\r?\n/);
  if(rows.length>60)throw Error("Too many DNS lines.");
  const counts={A:0,CNAME:0,MX:0,TXT:0},owners=new Map();
  let count=0;
  for(const [i,row] of rows.entries()){
    const line=row.trim();
    if(!line||line.startsWith(";")||line.startsWith("#"))continue;
    const m=line.match(/^(\S+)\s+(\d{1,7})\s+IN\s+(A|CNAME|MX|TXT)\s+(.+)$/i);
    if(!m)throw Error("Invalid DNS training syntax on line "+(i+1)+".");
    const [,name,seconds,rawType,raw]=m,type=rawType.toUpperCase(),data=raw.trim();
    if(!domain(name)||Number(seconds)>86400)throw Error("Invalid DNS name or TTL.");
    if(type==="A"&&!isIp(data))throw Error("Invalid A record IPv4 value.");
    if(type==="CNAME"&&!domain(data))throw Error("Invalid CNAME target.");
    if(type==="MX"){
      const p=data.split(/\s+/);
      if(p.length!==2||!/^(0|[1-9][0-9]{0,4})$/.test(p[0])||
         Number(p[0])>65535||!domain(p[1]))throw Error("Invalid MX priority or target.");
    }
    if(type==="TXT"&&(!/^"(?:[^"\\]|\\.)*"$/.test(data)||data.length>258))
      throw Error("Invalid single-string TXT example.");
    counts[type]++;count++;
    const key=name.toLowerCase(),types=owners.get(key)||new Set();
    types.add(type);owners.set(key,types);
  }
  if(count<1||count>40)throw Error("Use 1–40 supported records.");
  const warnings=[...owners.values()].some(x=>x.has("CNAME")&&x.size>1)?
    ["A CNAME owner cannot also carry other record types."]:[];
  return Object.freeze({recordCount:count,counts,distinctOwners:owners.size,
    warnings,queriesSent:0,recordsPublished:false,
    caveat:"Simplified A, MX, CNAME and TXT syntax only. No DNS resolution, DNSSEC, or authoritative validation."});
}
export function inspectHttpRequestLocally(text){
  const s=bound(text,"HTTP request"),separator=s.match(/\r?\n\r?\n/);
  if(!separator)throw Error("Separate request headers and body with an empty line.");
  const rows=s.slice(0,separator.index).split(/\r?\n/);
  if(rows.length<1||rows.length>42)throw Error("Too many HTTP headers.");
  const line=rows.shift().match(/^([A-Z]{3,12})\s+(\S{1,2048})\s+(HTTP\/1\.[01])$/);
  if(!line||!["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].includes(line[1])||
     !(line[2].startsWith("/")||(line[1]==="OPTIONS"&&line[2]==="*")))
    throw Error("Invalid origin-form HTTP/1.x training request.");
  const headers=new Map();
  for(const row of rows){
    const i=row.indexOf(":");
    if(i<=0||/^[ \t]/.test(row))throw Error("Invalid or folded HTTP header.");
    const key=row.slice(0,i).toLowerCase(),value=row.slice(i+1).trim();
    if(!/^[a-z0-9!#$%&'*+\-.^_\x60|~]+$/.test(key)||
       /[\u0000-\u001f\u007f]/.test(value))
      throw Error("Invalid HTTP header name or value.");
    headers.set(key,[...(headers.get(key)||[]),value]);
  }
  const cl=headers.get("content-length")||[],te=headers.get("transfer-encoding")||[];
  const warnings=[];
  if(line[3]==="HTTP/1.1"&&!headers.has("host"))
    warnings.push("HTTP/1.1 requires a Host header.");
  if(cl.length>1)warnings.push("Repeated Content-Length values need rejection or consistent handling.");
  if(te.length&&cl.length)warnings.push("Both Transfer-Encoding and Content-Length are present: intermediaries can disagree about request framing.");
  if(te.length)warnings.push("Chunked bodies are not decoded or interpreted in this educational parser.");
  const bodyBytes=new TextEncoder().encode(s.slice(separator.index+separator[0].length)).length;
  if(cl.length===1){
    if(!/^(0|[1-9][0-9]{0,8})$/.test(cl[0]))
      warnings.push("Content-Length is not a canonical bounded integer.");
    else if(!te.length&&Number(cl[0])!==bodyBytes)
      warnings.push("Content-Length does not match supplied UTF-8 body bytes.");
  }
  if(headers.has("cookie")||headers.has("authorization"))
    warnings.push("A credential-bearing header exists; never paste real secrets.");
  if(line[2].includes("?"))warnings.push("The request target includes a query; avoid URL secrets.");
  return Object.freeze({method:line[1],version:line[3],headerCount:rows.length,
    bodyBytes,contentLengthHeaders:cl.length,transferEncodingHeaders:te.length,
    targetHasQuery:line[2].includes("?"),warnings,requestsSent:0,
    sensitiveValuesExposed:false,
    caveat:"Illustrative HTTP/1.x framing only; no real proxy parsing, network call, or vulnerability certification."});
}
export function inspectSecurityTxtLocally(text,now=new Date()){
  const lines=bound(text,"security.txt").split(/\r?\n/);
  if(lines.length>60||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("Invalid security.txt size or clock.");
  const fields=new Map();
  for(const [i,row] of lines.entries()){
    const v=row.trim();
    if(!v||v.startsWith("#"))continue;
    const m=v.match(/^([A-Za-z][A-Za-z-]{0,39}):\s*(\S.*?)\s*$/);
    if(!m)throw Error("Invalid security.txt line "+(i+1)+".");
    const k=m[1].toLowerCase();
    fields.set(k,[...(fields.get(k)||[]),m[2]]);
  }
  const contacts=fields.get("contact")||[],expires=fields.get("expires")||[];
  const warnings=[];
  if(!contacts.length)warnings.push("Missing Contact.");
  if(expires.length!==1)warnings.push("Expected exactly one Expires.");
  for(const c of contacts){
    try{const u=new URL(c);
      if(!["https:","mailto:"].includes(u.protocol)||u.username||u.password)
        throw Error("Invalid contact");
    }catch{warnings.push("Invalid Contact URI; use HTTPS or mailto.");}
  }
  let expiresAt=null;
  if(expires.length===1){
    const v=expires[0],time=Date.parse(v);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||
       !Number.isFinite(time))warnings.push("Expires must be a valid timestamp with timezone.");
    else{
      expiresAt=new Date(time).toISOString();
      if(time<=now.getTime())warnings.push("The security.txt example is expired.");
    }
  }
  return Object.freeze({fields:[...fields.keys()].sort(),contactCount:contacts.length,
    expiresAt,warnings,warningCount:warnings.length,contactsExposed:false,
    requestsSent:0,caveat:"Static RFC 9116 learning checklist only. No contact ownership, DNS, HTTP, or signature verification."});
}
export function correlateSecurityEventsLocally(text){
  const lines=bound(text,"Security event log").split(/\r?\n/),events=[];
  if(lines.length>52)throw Error("At most 50 synthetic events are supported.");
  const types=["login-failed","login-success","rate-limit","policy-denied","service-recovered"];
  for(const [i,row] of lines.entries()){
    if(!row.trim())continue;
    const p=row.split("|").map(x=>x.trim());
    if(p.length!==3||
       !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(p[0])||
       !["INFO","WARN","ERROR"].includes(p[1])||!types.includes(p[2]))
      throw Error("Invalid synthetic event line "+(i+1)+".");
    const time=Date.parse(p[0]);
    if(!Number.isFinite(time))throw Error("Invalid timestamp.");
    events.push({time,level:p[1],event:p[2]});
  }
  if(!events.length||events.length>50)throw Error("Supply 1–50 synthetic events.");
  events.sort((a,b)=>a.time-b.time);
  const levels={INFO:0,WARN:0,ERROR:0},counts={};
  for(const e of events){levels[e.level]++;counts[e.event]=(counts[e.event]||0)+1;}
  const failures=events.filter(e=>e.event==="login-failed").map(e=>e.time);
  let left=0,windows=0;
  for(let i=0;i<failures.length;i++){
    while(failures[i]-failures[left]>600000)left++;
    if(i-left+1===3)windows++;
  }
  return Object.freeze({eventCount:events.length,levels,eventCounts:counts,
    firstAt:new Date(events[0].time).toISOString(),
    lastAt:new Date(events[events.length-1].time).toISOString(),
    threeFailureWindows:windows,repeatedFailuresObserved:windows>0,
    logsUploaded:false,identityAttributed:false,
    caveat:"A three-failure/10-minute heuristic is a learning signal, not a confirmed intrusion."});
}
export function generateLocalRandomToken({bytes=32,format="hex",cryptoApi=globalThis.crypto}={}){
  if(![16,24,32,48].includes(bytes)||!["hex","base64url"].includes(format))
    throw Error("Choose a supported token length and format.");
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=="function")
    throw Error("Secure browser randomness is unavailable.");
  const data=new Uint8Array(bytes);
  cryptoApi.getRandomValues(data);
  const token=format==="hex"?Array.from(data,b=>b.toString(16).padStart(2,"0")).join(""):
    btoa(Array.from(data,b=>String.fromCharCode(b)).join(""))
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return Object.freeze({token,byteCount:bytes,randomBits:bytes*8,format,
    storageUsed:false,requestsSent:0,
    caveat:"Keep the generated value private; Web Crypto output is not a substitute for a complete credential storage and rotation system."});
}
