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

export const PRACTICE_TRACKS=Object.freeze([
  Object.freeze({id:"subnet",title:"IPv4 subnetting",description:"Calculate address ranges and hosts."}),
  Object.freeze({id:"chmod",title:"Linux permissions",description:"Apply the UNIX umask."}),
  Object.freeze({id:"csp",title:"CSP hardening",description:"Count static policy findings."}),
  Object.freeze({id:"cors",title:"CORS decisions",description:"Predict simplified browser response sharing."}),
  Object.freeze({id:"cookie",title:"Cookie settings",description:"Inspect session-cookie attribute warnings."}),
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
  if(unique.size>15||[...unique].some(id=>!byId.has(id)))
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
