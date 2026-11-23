/**
 * Five offline, bounded browser security workstations.
 * Never fetch, authenticate accounts, store derived secrets or run arbitrary code.
 */
const utf8=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const bytesFromHex=value=>Uint8Array.from(value.match(/.{2}/g)||[],x=>parseInt(x,16));
function bounded(value,label,max){
  if(typeof value!=="string"||utf8.encode(value).length>max||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw Error(label+" must be bounded text with no control characters.");
  return value;
}
function cryptoRequirement(api,...methods){
  if(!api?.subtle||methods.some(m=>typeof api.subtle[m]!=="function"))
    throw Error("Secure browser Web Crypto is required for this exercise.");
}
export async function derivePbkdf2Locally(password,{
  iterations=10000,saltHex=null,cryptoApi=globalThis.crypto,
}={}){
  bounded(password,"Synthetic passphrase",128);
  const passwordBytes=utf8.encode(password);
  if(passwordBytes.length<8)throw Error("Use at least eight UTF-8 bytes in the synthetic passphrase.");
  if(!Number.isSafeInteger(iterations)||iterations<1000||iterations>150000)
    throw Error("Training PBKDF2 iterations must be 1000–150000.");
  cryptoRequirement(cryptoApi,"importKey","deriveBits");
  let salt;
  if(saltHex===null){
    if(typeof cryptoApi.getRandomValues!=="function")
      throw Error("Secure Web Crypto randomness is unavailable.");
    salt=new Uint8Array(16);
    cryptoApi.getRandomValues(salt);
  }else{
    if(typeof saltHex!=="string"||!/^[0-9a-fA-F]{32}$/.test(saltHex))
      throw Error("An explicit training salt must be 16 bytes as 32 hexadecimal characters.");
    salt=bytesFromHex(saltHex);
  }
  const key=await cryptoApi.subtle.importKey("raw",passwordBytes,"PBKDF2",false,["deriveBits"]);
  const derived=new Uint8Array(await cryptoApi.subtle.deriveBits({
    name:"PBKDF2",hash:"SHA-256",salt,iterations,
  },key,256));
  if(derived.length!==32)throw Error("Unexpected PBKDF2 output size.");
  return Object.freeze({
    derivedHex:hex(derived),saltHex:hex(salt),iterations,
    derivedBytes:32,requestsSent:0,passwordSaved:false,
    caveat:"Real PBKDF2-SHA256 computation for synthetic training input. Do not enter real passwords. This is not a deployable password-storage or account-authentication design.",
  });
}
export async function demonstrateAesGcmLocally(message,cryptoApi=globalThis.crypto){
  const text=bounded(message,"Synthetic plaintext",2048);
  cryptoRequirement(cryptoApi,"generateKey","encrypt","decrypt");
  if(typeof cryptoApi.getRandomValues!=="function")
    throw Error("AES-GCM requires secure nonce randomness.");
  const key=await cryptoApi.subtle.generateKey({
    name:"AES-GCM",length:256,
  },false,["encrypt","decrypt"]);
  const iv=new Uint8Array(12);
  cryptoApi.getRandomValues(iv);
  const plaintext=utf8.encode(text);
  const encrypted=new Uint8Array(await cryptoApi.subtle.encrypt({
    name:"AES-GCM",iv,tagLength:128,
  },key,plaintext));
  if(encrypted.length!==plaintext.length+16)
    throw Error("Unexpected AES-GCM authentication tag length.");
  const decrypted=await cryptoApi.subtle.decrypt({
    name:"AES-GCM",iv,tagLength:128,
  },key,encrypted);
  const recovered=new TextDecoder("utf-8",{fatal:true}).decode(decrypted)===text;
  const tampered=encrypted.slice();
  tampered[0]^=1;
  let tamperRejected=false;
  try{
    await cryptoApi.subtle.decrypt({name:"AES-GCM",iv,tagLength:128},key,tampered);
  }catch{tamperRejected=true;}
  if(!recovered||!tamperRejected)
    throw Error("AES-GCM authenticated decryption verification failed.");
  return Object.freeze({
    ciphertextHex:hex(encrypted),nonceHex:hex(iv),
    messageBytes:plaintext.length,ciphertextBytes:encrypted.length,
    authenticationTagBits:128,
    decryptedSuccessfully:true,tamperingRejected:true,
    keyExportable:false,requestsSent:0,keySaved:false,
    caveat:"AES-GCM encrypts with a fresh non-exportable, session-only key and random 96-bit nonce. The key is discarded after this one-shot test, so the ciphertext cannot be decrypted later. Never paste real secrets.",
  });
}
export async function calculateTotpLocally(secret,{
  epochSeconds=59,period=30,digits=8,cryptoApi=globalThis.crypto,
}={}){
  bounded(secret,"Synthetic TOTP secret",128);
  if(utf8.encode(secret).length<8)
    throw Error("Enter at least eight UTF-8 bytes of synthetic secret material.");
  if(!Number.isSafeInteger(epochSeconds)||epochSeconds<0||epochSeconds>4102444800)
    throw Error("Use an integer Unix second within the supported training period.");
  if(![30,60].includes(period)||![6,8].includes(digits))
    throw Error("Use a 30/60-second TOTP period and six/eight digits.");
  cryptoRequirement(cryptoApi,"importKey","sign");
  const counter=Math.floor(epochSeconds/period);
  const input=new Uint8Array(8);
  let n=BigInt(counter);
  for(let i=7;i>=0;i--){input[i]=Number(n&255n);n>>=8n;}
  const key=await cryptoApi.subtle.importKey("raw",utf8.encode(secret),{
    name:"HMAC",hash:"SHA-1",
  },false,["sign"]);
  const digest=new Uint8Array(await cryptoApi.subtle.sign("HMAC",key,input));
  if(digest.length!==20)throw Error("Unexpected HMAC-SHA1 output.");
  const offset=digest[digest.length-1]&15;
  const binary=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|
    (digest[offset+2]<<8)|digest[offset+3];
  const code=String(binary%(10**digits)).padStart(digits,"0");
  return Object.freeze({
    code,counter:String(counter),period,digits,
    secondsRemaining:period-(epochSeconds%period),
    algorithm:"HMAC-SHA1 (RFC 6238)",secretExposed:false,
    secretSaved:false,requestsSent:0,
    caveat:"RFC 6238 TOTP demonstration using an ASCII/UTF-8 synthetic secret and local training timestamp. Do not enter a real 2FA seed; this does not enroll an authenticator or verify a login.",
  });
}
function parseWebOrigin(value,label){
  const raw=bounded(value,label,2048).trim();
  let parsed;
  try{parsed=new URL(raw);}
  catch{throw Error(label+" must be an absolute HTTP(S) URL.");}
  if(!["http:","https:"].includes(parsed.protocol)||!parsed.hostname)
    throw Error("Only absolute HTTP(S) URLs are supported.");
  return parsed;
}
export function compareWebOriginsLocally(first,second){
  const a=parseWebOrigin(first,"First URL"),b=parseWebOrigin(second,"Second URL");
  const warnings=[];
  if(a.username||a.password||b.username||b.password)
    warnings.push("A URL contains embedded credentials; do not use URL userinfo for real secrets.");
  if(a.protocol==="http:"||b.protocol==="http:")
    warnings.push("An HTTP URL is unencrypted in transit; this exercise never visits it.");
  if(a.search||b.search)
    warnings.push("A URL contains a query string. Query values are deliberately omitted from results.");
  if([a,b].some(u=>["localhost","127.0.0.1","[::1]","0.0.0.0"].includes(u.hostname.toLowerCase())))
    warnings.push("A localhost/loopback-style host appears; this analysis does not resolve or contact it.");
  const effectivePort=u=>u.port||((u.protocol==="https:")?"443":"80");
  return Object.freeze({
    firstOrigin:a.origin,secondOrigin:b.origin,
    sameOrigin:a.origin===b.origin,
    sameHostname:a.hostname===b.hostname,
    schemeDiffers:a.protocol!==b.protocol,
    portDiffers:effectivePort(a)!==effectivePort(b),
    queriesHidden:true,credentialsHidden:true,
    warnings,requestsSent:0,dnsQueriesSent:0,
    caveat:"Exact browser origin (scheme, hostname, effective port) comparison only. It does not implement registrable-site/PSL rules, CORS authorization, DNS rebinding protection or SSRF validation.",
  });
}
export function neutralizeCsvFormulasLocally(input){
  const text=bounded(input,"CSV training cells",4096);
  const cells=text.split(/\r?\n/);
  if(cells.length<1||cells.length>30||cells.some(x=>x.length>1024||x.includes("\r")))
    throw Error("Enter at most 30 single-line cells, each no longer than 1024 characters.");
  const lines=[];
  let neutralized=0;
  for(const cell of cells){
    const dangerous=/^[\s\uFEFF]*[=+\-@]/u.test(cell);
    if(dangerous)neutralized++;
    const safe=(dangerous?"'":"")+cell;
    lines.push('"'+safe.replace(/"/g,'""')+'"');
  }
  return Object.freeze({
    csv:lines.join("\r\n")+"\r\n",
    cellCount:cells.length,neutralized,
    rowsDelimitedBy:"CRLF",requestsSent:0,filesWritten:false,
    caveat:"Single-column RFC 4180-style quoting plus apostrophe-prefix neutralization for common spreadsheet formula triggers. Spreadsheet applications vary; verify behavior in the target application, and do not treat this as comprehensive CSV import/export security.",
  });
}
