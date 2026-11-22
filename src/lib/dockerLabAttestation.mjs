// Offline pinned-key proof of an operator-owned Docker lab journal.
// Signed content proves key possession and integrity, not Docker execution.
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {isAbsolute,join} from "node:path";
import {readLabClaim,labJournalDir} from "./dockerLabRecovery.mjs";
const U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const B32=/^[A-Za-z0-9_-]{43}$/;
const B64=/^[A-Za-z0-9_-]{86}$/;
const outcomes=["unresolved","completed","failed","guard_denied"];
function safeRead(path,limit,privateOnly=false){
 if(!isAbsolute(path))throw Error("Absolute path required.");
 const s=lstatSync(path);
 if(!s.isFile()||s.isSymbolicLink()||s.size>limit)throw Error("Invalid key or audit file.");
 if(process.platform!=="win32"&&(s.uid!==process.getuid()||
  privateOnly&&(s.mode&0o077)!==0))throw Error("Invalid private file ownership or mode.");
 return readFileSync(path);
}
function rawJournal(id,dir){
 const claim=readLabClaim(id,dir);
 const data=safeRead(join(dir,"claim-"+claim.claimId+".jsonl"),16384,true);
 return {claim,hash:createHash("sha256").update(data).digest("hex")};
}
function message(d){
 return Buffer.from(["ETERNYX_DOCKER_AUDIT_V1",d.agentId,d.claimId,
   d.operation,d.containerId,d.journalSha256,d.outcome,d.acknowledged?"1":"0"].join("\n"));
}
export function validateLabAudit(a){
 if(!a||typeof a!=="object"||Array.isArray(a)||
   Object.keys(a).sort().join(",")!=="acknowledged,agentId,claimId,containerId,journalSha256,operation,outcome,signature,version"||
   a.version!==1||!U.test(a.agentId||"")||!U.test(a.claimId||"")||
   !["start","stop","restart"].includes(a.operation)||!HEX.test(a.containerId||"")||
   !HEX.test(a.journalSha256||"")||!outcomes.includes(a.outcome)||
   typeof a.acknowledged!=="boolean"||!B64.test(a.signature||""))
  throw Error("Invalid signed audit schema.");
 return a;
}
export function signLabAudit(id,keyPath,dir=labJournalDir){
 const {claim,hash}=rawJournal(id,dir);
 const key=createPrivateKey(safeRead(keyPath,8192,true));
 if(key.asymmetricKeyType!=="ed25519")throw Error("Ed25519 key required.");
 const data={version:1,agentId:claim.agentId,claimId:claim.claimId,
   operation:claim.operation,containerId:claim.containerId,journalSha256:hash,
   outcome:claim.outcome||"unresolved",acknowledged:claim.acknowledged};
 return {...data,signature:sign(null,message(data),key).toString("base64url")};
}
export function verifyLabAudit(value,pinnedKeyPath,dir=labJournalDir){
 const a=validateLabAudit(value);
 const {claim,hash}=rawJournal(a.claimId,dir);
 if(claim.agentId!==a.agentId||claim.operation!==a.operation||
    claim.containerId!==a.containerId||hash!==a.journalSha256||
    (claim.outcome||"unresolved")!==a.outcome||claim.acknowledged!==a.acknowledged)
    throw Error("Signed audit does not match current journal.");
 const encoded=safeRead(pinnedKeyPath,256).toString("utf8").trim();
 if(!B32.test(encoded))throw Error("Invalid pinned public key.");
 const key=Buffer.from(encoded,"base64url");
 if(key.length!==32||key.toString("base64url")!==encoded)throw Error("Noncanonical pinned public key.");
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),key]),type:"spki",format:"der"});
 const signature=Buffer.from(a.signature,"base64url");
 if(signature.length!==64||signature.toString("base64url")!==a.signature||
   !verify(null,message(a),publicKey,signature))throw Error("Signed audit verification failed.");
 return {verified:true,claimId:a.claimId,outcome:a.outcome,receiptAcknowledged:a.acknowledged,
   keyProvenance:"pinned_ed25519_key",independentDockerProof:false};
}
