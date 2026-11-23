/**
 * ETERNYX Labs practice: 15 real, deterministic, browser-only challenges.
 * Exercises derive answer keys from the same pure calculation utilities as
 * the learner's workstations. Nothing is saved, uploaded or server-graded.
 * Client-side grading is NOT exam security, accreditation or trusted progress.
 */
import {
  calculateIpv4Subnet,simulateUnixUmask,lintCspPolicy,
  evaluateCorsHeaderExample,reviewSetCookieExample,
} from "./eternyxLabsFoundations.mjs";
import {
  inspectDnsZoneLocally,inspectHttpRequestLocally,inspectSecurityTxtLocally,
  correlateSecurityEventsLocally,generateLocalRandomToken,
} from "./eternyxLabsOperations.mjs";

export const PRACTICE_TRACKS=Object.freeze([
  Object.freeze({id:"subnet",title:"IPv4 subnetting",description:"Calculate address ranges and hosts."}),
  Object.freeze({id:"chmod",title:"Linux permissions",description:"Apply the UNIX umask."}),
  Object.freeze({id:"csp",title:"CSP hardening",description:"Count static policy findings."}),
  Object.freeze({id:"cors",title:"CORS decisions",description:"Predict simplified browser response sharing."}),
  Object.freeze({id:"cookie",title:"Cookie settings",description:"Inspect session-cookie attribute warnings."}),
  Object.freeze({id:"dns",title:"DNS record analysis",description:"Count records, owners and conflicting CNAME sources."}),
  Object.freeze({id:"http",title:"HTTP request framing",description:"Inspect real request-framing calculations without traffic."}),
  Object.freeze({id:"securitytxt",title:"Security disclosure files",description:"Check Contact and Expires metadata."}),
  Object.freeze({id:"events",title:"Incident event correlation",description:"Count defensive events and spot ten-minute patterns."}),
  Object.freeze({id:"tokens",title:"Token generation math",description:"Understand secure random byte and encoding lengths."}),
]);
const definitions=[
  ["subnet-network","subnet","Network address · /24",
    "What is the network address for this host?","192.168.42.77/24",
    "ipv4",{cidr:"192.168.42.77/24",field:"network"},
    "A /24 subnet keeps the first three octets as network bits.",
    "A /24 mask is 255.255.255.0; zero the host bits."],
  ["subnet-hosts","subnet","Usable addresses · /27",
    "How many conventional usable IPv4 addresses are in this subnet?","10.7.1.200/27",
    "integer",{cidr:"10.7.1.200/27",field:"usableCount"},
    "Count 2^(32-prefix) total, then subtract network and broadcast for /0–/30.",
    "For /27 there are five host bits. This counts assignable addresses, not online devices."],
  ["subnet-point","subnet","Broadcast value · /31",
    "What is the upper address returned by the CIDR calculator?","198.51.100.10/31",
    "ipv4",{cidr:"198.51.100.10/31",field:"broadcast"},
    "A /31 has two consecutive addresses; both can be used on point-to-point links.",
    "The calculated upper address is conventionally labelled broadcast by this arithmetic model; /31 has special endpoint use."],
  ["chmod-directory","chmod","Directory creation",
    "Which three-digit octal mode remains after the umask?","Requested: 0777\numask: 0027",
    "octal",{requested:"0777",umask:"0027"},
    "The umask removes group write and all permissions for others.",
    "Mode = requested bits AND the complement of the umask (within 0777)."],
  ["chmod-file","chmod","File creation",
    "Which three-digit octal mode remains after the umask?","Requested: 0666\numask: 0022",
    "octal",{requested:"0666",umask:"0022"},
    "Read/write permissions are requested for everyone; remove group/other write.",
    "An umask never adds execute bits that were not requested."],
  ["chmod-restrict","chmod","Private owner access",
    "Which three-digit octal mode remains after the umask?","Requested: 0750\numask: 0077",
    "octal",{requested:"0750",umask:"0077"},
    "Only owner bits survive when group and other permissions are fully masked.",
    "Compare the owner/group/other permission bit groups independently."],
  ["csp-hardened","csp","Hardened baseline",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'",
    "integer",{policy:"default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'"},
    "Review each required fallback/restriction directive and unsafe script token.",
    "A zero-warning result is NOT proof that the deployed policy is safe."],
  ["csp-unsafe","csp","Unsafe script options",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' *",
    "integer",{policy:"default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' *"},
    "Count missing protective directives plus each risky script source token.",
    "Warnings are static teaching findings, not confirmed vulnerabilities."],
  ["csp-duplicate","csp","Duplicate directives",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'none'; default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'",
    "integer",{policy:"default-src 'none'; default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'"},
    "Browsers generally use the first repeated directive within one policy.",
    "This example isolates the duplicate-directive warning."],
  ["cors-exact","cors","Credentialed exact-origin",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://api.example.org\nCredentials: yes\nAccess-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://api.example.org",
      credentials:true,headers:"Access-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true"},
    "A credentialed cross-origin read needs an exact origin and credentials header.",
    "CORS response sharing is not server authorization or a complete preflight check."],
  ["cors-wildcard","cors","Credentialed wildcard",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://api.example.org\nCredentials: yes\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://api.example.org",
      credentials:true,headers:"Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true"},
    "Credentialed cross-origin responses cannot use a wildcard allow-origin.",
    "The wildcard does not satisfy credentialed cross-origin response sharing."],
  ["cors-same","cors","Same-origin request",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://app.example.org\nCredentials: no\nNo CORS response headers",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://app.example.org",
      credentials:false,headers:""},
    "Same-origin requests do not need CORS permission.",
    "The example models same-origin response sharing only; other browser and server protections still apply."],
  ["cookie-host","cookie","Valid host-prefixed cookie",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: __Host-training=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict",
    "integer",{header:"Set-Cookie: __Host-training=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict"},
    "Check Secure, Path=/, absence of Domain, HttpOnly and SameSite.",
    "The static attribute checklist does not confirm a secure origin or actual browser cookie policy."],
  ["cookie-weak","cookie","Weak host-prefixed cookie",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: __Host-training=synthetic; Domain=example.org; SameSite=None",
    "integer",{header:"Set-Cookie: __Host-training=synthetic; Domain=example.org; SameSite=None"},
    "Missing Secure and HttpOnly, SameSite=None with no Secure, and an invalid __Host- prefix configuration each trigger a warning.",
    "The checker counts local static warnings; browser behavior also depends on the response origin."],
  ["cookie-session","cookie","HttpOnly missing",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: training=synthetic; Secure; SameSite=Lax",
    "integer",{header:"Set-Cookie: training=synthetic; Secure; SameSite=Lax"},
    "HttpOnly may be needed for a sensitive session cookie.",
    "Not every cookie must be HttpOnly; decide based on its actual purpose."],

  ["dns-count","dns","Multiple IPv4 host records",
    "How many A records does the offline DNS clinic count?",
    "example.test. 300 IN A 192.0.2.3\napi.example.test. 300 IN A 192.0.2.4\nexample.test. 300 IN MX 10 mail.example.test.",
    "integer",{zone:"example.test. 300 IN A 192.0.2.3\napi.example.test. 300 IN A 192.0.2.4\nexample.test. 300 IN MX 10 mail.example.test.",field:"A"},
    "Count only records with type A; MX is a separate type.",
    "The offline parser counts supported record types without doing a DNS lookup."],
  ["dns-cname","dns","Conflicting CNAME owner",
    "How many warnings does the training DNS record clinic return?",
    "shop.example.test. 300 IN CNAME target.example.test.\nshop.example.test. 300 IN A 192.0.2.7",
    "integer",{zone:"shop.example.test. 300 IN CNAME target.example.test.\nshop.example.test. 300 IN A 192.0.2.7",field:"warnings"},
    "A CNAME owner must not simultaneously have a different DNS record type.",
    "This local heuristic flags the contradictory CNAME owner; it does not query authoritative DNS."],
  ["dns-owners","dns","Distinct DNS owner names",
    "How many different owner names appear in this training zone?",
    "example.test. 300 IN A 192.0.2.3\nexample.test. 300 IN MX 10 mail.example.test.\napi.example.test. 300 IN A 192.0.2.4\n_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",
    "integer",{zone:"example.test. 300 IN A 192.0.2.3\nexample.test. 300 IN MX 10 mail.example.test.\napi.example.test. 300 IN A 192.0.2.4\n_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",field:"distinctOwners"},
    "Two records can belong to one owner: count unique left-hand-side names.",
    "The zone parser normalizes owner names and groups records under their owners."],
  ["http-body","http","HTTP body byte length",
    "How many UTF-8 bytes are in the synthetic request body?",
    "POST /training HTTP/1.1\nHost: example.test\nContent-Length: 5\n\nhello",
    "integer",{request:"POST /training HTTP/1.1\nHost: example.test\nContent-Length: 5\n\nhello",field:"bodyBytes"},
    "Bytes in the body are counted after the empty line separating headers and body.",
    "Content-Length describes byte length, not Unicode character count."],
  ["http-conflict","http","Ambiguous request length",
    "How many training warnings does this raw HTTP request produce?",
    "POST /items HTTP/1.1\nHost: example.test\nContent-Length: 5\nTransfer-Encoding: chunked\n\nabcde",
    "integer",{request:"POST /items HTTP/1.1\nHost: example.test\nContent-Length: 5\nTransfer-Encoding: chunked\n\nabcde",field:"warnings"},
    "Check both the conflicting framing headers and the unsupported transfer-encoding analysis.",
    "The tool warns about TE/CL conflict and incomplete chunked-body interpretation; it never sends this request."],
  ["http-headers","http","Count request header lines",
    "How many header lines (not including the request line) are present?",
    "GET /training HTTP/1.1\nHost: example.test\nAccept: text/plain\nX-Training: yes\n\n",
    "integer",{request:"GET /training HTTP/1.1\nHost: example.test\nAccept: text/plain\nX-Training: yes\n\n",field:"headerCount"},
    "Host, Accept, and X-Training are three separate header lines.",
    "The inspector parses HTTP/1.x header lines, not a live connection."],
  ["security-contacts","securitytxt","Multiple disclosure contacts",
    "How many Contact fields does the offline security.txt checker identify?",
    "Contact: mailto:security@example.test\nContact: https://example.test/security\nExpires: 2030-01-01T00:00:00Z",
    "integer",{document:"Contact: mailto:security@example.test\nContact: https://example.test/security\nExpires: 2030-01-01T00:00:00Z",field:"contactCount"},
    "Both mailto and HTTPS Contact entries are counted; their values remain hidden.",
    "A valid contact URI is not proof that the organization owns it."],
  ["security-expired","securitytxt","Expired security disclosure",
    "How many warnings does the offline security.txt checker produce?",
    "Contact: mailto:security@example.test\nExpires: 2020-01-01T00:00:00Z",
    "integer",{document:"Contact: mailto:security@example.test\nExpires: 2020-01-01T00:00:00Z",field:"warningCount"},
    "The expiry is in the past relative to the fixed training clock.",
    "An expired disclosure record needs review; the local parser does not fetch the deployed file."],
  ["security-missing","securitytxt","Missing required fields",
    "How many warnings does the security.txt checker give for this sample?",
    "Policy: https://example.test/security-policy",
    "integer",{document:"Policy: https://example.test/security-policy",field:"warningCount"},
    "The required Contact and Expires fields are both absent.",
    "This is static metadata review, not live security-contact validation."],
  ["events-window","events","Repeated failed logins",
    "How many three-failure-in-ten-minute windows does the offline event tool count?",
    "2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:04:00Z|WARN|login-failed\n2026-11-23T10:09:00Z|ERROR|login-failed",
    "integer",{events:"2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:04:00Z|WARN|login-failed\n2026-11-23T10:09:00Z|ERROR|login-failed",field:"threeFailureWindows"},
    "Three distinct login-failed events occur within a ten-minute window.",
    "A matching heuristic is not proof of an intrusion or attacker identity."],
  ["events-errors","events","Count error severity",
    "How many ERROR-severity events does the offline timeline parser count?",
    "2026-11-23T10:00:00Z|ERROR|policy-denied\n2026-11-23T10:01:00Z|WARN|rate-limit\n2026-11-23T10:02:00Z|ERROR|login-failed",
    "integer",{events:"2026-11-23T10:00:00Z|ERROR|policy-denied\n2026-11-23T10:01:00Z|WARN|rate-limit\n2026-11-23T10:02:00Z|ERROR|login-failed",field:"errors"},
    "Count ERROR labels, not event types such as policy-denied.",
    "The example contains two ERROR events and one WARN event."],
  ["events-total","events","Count synthetic log records",
    "How many events are accepted by the local event-correlation utility?",
    "2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:02:00Z|WARN|rate-limit\n2026-11-23T10:05:00Z|INFO|login-success\n2026-11-23T10:10:00Z|INFO|service-recovered",
    "integer",{events:"2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:02:00Z|WARN|rate-limit\n2026-11-23T10:05:00Z|INFO|login-success\n2026-11-23T10:10:00Z|INFO|service-recovered",field:"eventCount"},
    "Each supported line contains UTC time, a severity level, and an allowed event name.",
    "Only synthetic event types are accepted; real identity data and logs are not required."],
  ["tokens-entropy","tokens","Random byte entropy budget",
    "How many raw random bits does a 32-byte Web Crypto token contain?",
    "Token generator: 32 bytes, hexadecimal display; secure random source.",
    "integer",{bytes:32,format:"hex",field:"randomBits"},
    "Multiply bytes by eight. Encodings do not add randomness.",
    "This counts source bits, not guaranteed unpredictability after a system or implementation compromise."],
  ["tokens-hex","tokens","Hexadecimal encoded length",
    "How many characters appear in the hex form of 24 random bytes?",
    "Token generator: 24 random bytes, output format hex.",
    "integer",{bytes:24,format:"hex",field:"length"},
    "A byte is represented by two hexadecimal digits.",
    "The training key comes from a synthetic injected random-byte provider. No real secret is retained."],
  ["tokens-b64","tokens","Base64url encoded length",
    "How many characters appear in unpadded base64url for 32 random bytes?",
    "Token generator: 32 random bytes, output format base64url (without padding).",
    "integer",{bytes:32,format:"base64url",field:"length"},
    "Base64 packs six bits into each character; omit trailing '=' padding.",
    "This is output-length math on synthetic bytes, not a real token or a credential audit."],
];
export const PRACTICE_CASES=Object.freeze(definitions.map((
  [id,track,title,prompt,scenario,kind,config,hint,explanation]
)=>Object.freeze({
  id,track,title,prompt,scenario,kind,
  config:Object.freeze(config),hint,explanation,
})));
const byId=new Map(PRACTICE_CASES.map(c=>[c.id,c]));
if(byId.size!==PRACTICE_CASES.length||
   PRACTICE_TRACKS.some(t=>PRACTICE_CASES.filter(c=>c.track===t.id).length!==3))
  throw Error("Practice catalog must contain three unique exercises per track.");
export function getPracticeCase(id){
  if(typeof id!=="string"||!byId.has(id))throw Error("Unknown practice scenario.");
  return byId.get(id);
}
function answerFor(challenge){
  const c=challenge.config;
  switch(challenge.track){
    case "subnet":return String(calculateIpv4Subnet(c.cidr)[c.field]);
    case "chmod":return simulateUnixUmask(c.requested,c.umask).resultingMode;
    case "csp":return String(lintCspPolicy(c.policy).warningCount);
    case "cors":return evaluateCorsHeaderExample(c).readAllowed?"yes":"no";
    case "cookie":return String(reviewSetCookieExample(c.header).warningCount);
    case "dns":{
      const result=inspectDnsZoneLocally(c.zone);
      return String(c.field==="warnings"?result.warnings.length:
        c.field==="A"?result.counts.A:result.distinctOwners);
    }
    case "http":{
      const result=inspectHttpRequestLocally(c.request);
      return String(c.field==="warnings"?result.warnings.length:result[c.field]);
    }
    case "securitytxt":{
      const result=inspectSecurityTxtLocally(c.document,new Date("2026-11-23T00:00:00Z"));
      return String(result[c.field]);
    }
    case "events":{
      const result=correlateSecurityEventsLocally(c.events);
      return String(c.field==="errors"?result.levels.ERROR:result[c.field]);
    }
    case "tokens":{
      // Only the output LENGTH and number of source bits are used for
      // practice. The deterministic injected bytes are an explicit fixture,
      // NEVER a generated production credential or secure randomness claim.
      const result=generateLocalRandomToken({
        bytes:c.bytes,format:c.format,
        cryptoApi:{getRandomValues(bytes){bytes.fill(0xa5);return bytes;}},
      });
      return String(c.field==="length"?result.token.length:result.randomBits);
    }
    default:throw Error("Unsupported practice grading track.");
  }
}
function normalize(answer,kind){
  if(typeof answer!=="string"||answer.length>64)
    throw Error("Enter a short answer before grading.");
  const raw=answer.trim().toLowerCase();
  if(kind==="boolean"){
    if(!["yes","no"].includes(raw))
      throw Error("Choose Yes or No for this scenario.");
    return raw;
  }
  if(kind==="integer"){
    if(!/^(0|[1-9][0-9]{0,9})$/.test(raw))
      throw Error("Enter a nonnegative whole number.");
    return String(Number(raw));
  }
  if(kind==="octal"){
    if(!/^(?:0?[0-7]{3})$/.test(raw))
      throw Error("Enter a three-digit octal permission mode.");
    return raw.replace(/^0(?=[0-7]{3}$)/,"");
  }
  if(kind==="ipv4"){
    const parts=raw.split(".");
    if(parts.length!==4||parts.some(p=>!/^(0|[1-9][0-9]{0,2})$/.test(p)||Number(p)>255))
      throw Error("Enter a canonical dotted-decimal IPv4 address.");
    return parts.join(".");
  }
  throw Error("Unsupported answer format.");
}
export function gradePracticeAnswer(id,answer){
  const challenge=getPracticeCase(id);
  const normalized=normalize(answer,challenge.kind);
  const expected=answerFor(challenge);
  return Object.freeze({
    caseId:id,track:challenge.track,
    correct:normalized===expected,
    expected,explanation:challenge.explanation,
    hint:challenge.hint,
    locallyChecked:true,
    serverVerified:false,certificateAwarded:false,
    externalSystemsAccessed:false,
  });
}
export function summarizePracticeProgress(passedIds=[]){
  if(!Array.isArray(passedIds)&&!(passedIds instanceof Set))
    throw Error("Local practice progress must be a list or set.");
  const unique=new Set(passedIds);
  if(unique.size>PRACTICE_CASES.length||[...unique].some(id=>!byId.has(id)))
    throw Error("Unexpected local practice progress entry.");
  return Object.freeze({
    passed:unique.size,total:PRACTICE_CASES.length,
    byTrack:PRACTICE_TRACKS.map(track=>Object.freeze({
      id:track.id,
      passed:PRACTICE_CASES.filter(c=>c.track===track.id&&unique.has(c.id)).length,
      total:3,
    })),
    saved:false,authenticated:false,certificateAwarded:false,
  });
}
