// Offline signed *report provenance*. Never a live Docker or host attestation.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {openSync,readFileSync,fstatSync,closeSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {DOCKER_DRILL_CASES} from "./dockerLabDrills.mjs";
const B32=/^[A-Za-z0-9_-]{43}$/;
const B64=/^[A-Za-z0-9_-]{86}$/;
const HEX=/^[a-f0-9]{64}$/;
function readSafe(path,max,privateMode=false){
 if(!isAbsolute(path))throw Error("Absolute evidence/key path required.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>max)throw Error("Invalid key or evidence file.");
  if(process.platform!=="win32"&&(st.uid!==process.getuid()||
    privateMode&&(st.mode&0o077)!==0))throw Error("Key/evidence ownership or mode rejected.");
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
const exact=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&
  Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
export function validateDrillReport(r){
 if(!exact(r,["schema","mode","createdAt","cases","summary","executionAuthorized","actualDockerContacted","remoteServerVerified"])||
    r.schema!=="eternyx-docker-drill-v1"||r.mode!=="offline-synthetic-only"||
    typeof r.createdAt!=="string"||!Number.isFinite(Date.parse(r.createdAt))||
    new Date(r.createdAt).toISOString()!==r.createdAt||
    r.executionAuthorized!==false||r.actualDockerContacted!==false||r.remoteServerVerified!==false||
    !Array.isArray(r.cases)||r.cases.length!==DOCKER_DRILL_CASES.length||
    !r.cases.every((c,i)=>exact(c,["id","result"])&&
      c.id===DOCKER_DRILL_CASES[i]&&["pass","fail"].includes(c.result))||
    !exact(r.summary,["total","passed","failed"])||r.summary.total!==r.cases.length||
    r.summary.passed!==r.cases.filter(x=>x.result==="pass").length||
    r.summary.failed!==r.cases.filter(x=>x.result==="fail").length)
    throw Error("Invalid offline Docker recovery drill report.");
 return r;
}
function digest(report){
 return createHash("sha256").update("ETERNYX_DOCKER_OFFLINE_DRILL_V1\n"+
    JSON.stringify(validateDrillReport(report))).digest("hex");
}
const message=hash=>Buffer.from("ETERNYX_DOCKER_DRILL_EVIDENCE_V1\n"+hash);
export function signDrillReport(report,keyPath){
 const key=createPrivateKey(readSafe(keyPath,8192,true));
 if(key.asymmetricKeyType!=="ed25519")throw Error("Ed25519 private key required.");
 const hash=digest(report);
 return {version:1,report,sha256:hash,
   signature:sign(null,message(hash),key).toString("base64url")};
}
export function verifyDrillEnvelope(e,pinnedKeyPath){
 if(!exact(e,["version","report","sha256","signature"])||
    e.version!==1||!HEX.test(e.sha256||"")||!B64.test(e.signature||""))
    throw Error("Invalid signed recovery drill envelope.");
 const hash=digest(e.report);
 if(hash!==e.sha256)throw Error("Evidence digest mismatch.");
 const encoded=readSafe(pinnedKeyPath,256).toString("utf8").trim();
 if(!B32.test(encoded))throw Error("Invalid pinned Ed25519 key.");
 const bytes=Buffer.from(encoded,"base64url");
 if(bytes.length!==32||bytes.toString("base64url")!==encoded)throw Error("Noncanonical pinned key.");
 const pub=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),bytes]),format:"der",type:"spki"});
 const signature=Buffer.from(e.signature,"base64url");
 if(signature.length!==64||signature.toString("base64url")!==e.signature||
    !verify(null,message(hash),pub,signature))
    throw Error("Signed recovery drill evidence rejected.");
 return {signatureVerified:true,allDrillsPassed:e.report.summary.failed===0,
   casesPassed:e.report.summary.passed,casesFailed:e.report.summary.failed,
   recordedAt:e.report.createdAt,executionAuthorized:false,
   actualDockerContacted:false,independentHostAttestation:false};
}
export function readDrillEvidence(path){return JSON.parse(readSafe(path,16384).toString("utf8"));}
export function inspectLocalKeyFiles(agentPrivatePath,pinnedServerPublicPath){
 const key=createPrivateKey(readSafe(agentPrivatePath,8192,true));
 const encoded=readSafe(pinnedServerPublicPath,256).toString("utf8").trim();
 const publicBytes=Buffer.from(encoded,"base64url");
 if(key.asymmetricKeyType!=="ed25519"||!B32.test(encoded)||
   publicBytes.length!==32||publicBytes.toString("base64url")!==encoded)
   throw Error("Operator key or server public key validation failed.");
 return {agentKeyValid:true,pinnedServerKeyValid:true,
   enrollmentVerified:false,credentialsUploaded:false};
}
