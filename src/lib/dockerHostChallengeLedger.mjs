// Docker Phase 40 — durable, reviewer-owned, SINGLE-USE challenge ledger.
// This verifies Ed25519 evidence via the Phase39 gate, then atomically consumes
// the exact independently issued challenge. No Docker, HTTP, hosted writes,
// execution flags, private attestor keys, or journal lock cleanup.
import {randomBytes,createHash} from "node:crypto";
import {
 lstatSync,fstatSync,openSync,closeSync,readFileSync,
 readdirSync,writeSync,fsyncSync,constants
} from "node:fs";
import {isAbsolute,dirname,join,parse} from "node:path";
import {
 verifyDockerReadOnlyHostEvidence,HOST_EVIDENCE_EXPECTED_KEYS
} from "./dockerSignedHostEvidenceReview.mjs";

const HASH=/^[a-f0-9]{64}$/;
const ISSUED=/^issue-([a-f0-9]{64})\.json$/;
const CONSUMED=/^consume-([a-f0-9]{64})\.json$/;
const MAX_FILES=512,MAX_BYTES=4096;
const F=constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0);
const SHA=x=>createHash("sha256").update(x).digest("hex");
const TEMPLATE_KEYS=HOST_EVIDENCE_EXPECTED_KEYS.filter(k=>k!=="challenge");
const ISSUE_KEYS=["schema","challenge","issuedAt","expected"];
const CONSUME_KEYS=["schema","challenge","consumedAt",
 "expectedSha256","evidenceBundleSha256","originalReportSha256"];
const utc=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const exact=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).join("|")===keys.join("|");
function pathSafe(dir){
 if(typeof dir!=="string"||!isAbsolute(dir)||!dir.startsWith("/")||
    dir==="/"||dir.length>512||dir.includes("//")||dir.includes("%")||
    dir.endsWith("/")||dir!==dir.trim()||
    dir.split("/").some(k=>k==="."||k==="..")||
    /[\u0000-\u001f\u007f]/.test(dir))
  throw Error("Private host challenge ledger needs a canonical absolute path.");
}
function privateDirectory(dir){
 pathSafe(dir);
 let segment=dir;
 const root=parse(dir).root;
 while(true){
  const st=lstatSync(segment);
  if(!st.isDirectory()||st.isSymbolicLink())
   throw Error("Private challenge ledger has a symlinked or invalid ancestor.");
  if(segment===dir){
   if(st.uid!==process.getuid()||(st.mode&0o077)!==0)
    throw Error("Challenge ledger must be reviewer-owned mode 0700.");
  }else if((st.uid!==0&&st.uid!==process.getuid())||
     ((st.mode&0o022)!==0&&!(st.uid===0&&(st.mode&0o1000)!==0)))
   throw Error("Challenge ledger parent must be trusted or sticky root-owned.");
  if(segment===root)break;
  segment=dirname(segment);
 }
 const st=lstatSync(dir);
 return {dev:st.dev,ino:st.ino,uid:st.uid,mode:st.mode,
  mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs};
}
function sameFile(a,b){
 return a.isFile()&&b.isFile()&&
  a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&
  a.mode===b.mode&&a.size===b.size&&
  a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
}
function secureRead(path){
 const before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||
    before.uid!==process.getuid()||(before.mode&0o077)!==0||
    before.nlink!==1||before.size<2||before.size>MAX_BYTES)
  throw Error("Challenge ledger entry is not a private, bounded original file.");
 const fd=openSync(path,F);
 try{
  const opened=fstatSync(fd);
  if(!sameFile(before,opened))throw Error("Challenge ledger entry identity changed.");
  const raw=readFileSync(fd);
  if(raw.length!==before.size||!sameFile(before,fstatSync(fd))||
     !sameFile(before,lstatSync(path)))
   throw Error("Challenge ledger entry changed during verification.");
  const text=raw.toString("utf8");
  let value;
  try{value=JSON.parse(text);}catch{throw Error("Invalid or interrupted challenge ledger entry.");}
  if(!value||typeof value!=="object"||Array.isArray(value)||
     text!==JSON.stringify(value)+"\n")
   throw Error("Challenge ledger entry is not canonical, complete JSON.");
  return {value,sha256:SHA(raw)};
 }finally{closeSync(fd);}
}
export function validateIndependentHostChallengeTemplate(template){
 if(!exact(template,TEMPLATE_KEYS)||
    !TEMPLATE_KEYS.filter(k=>k!=="observationOperation")
      .every(k=>HASH.test(template[k]||""))||
    !["start","stop","restart"].includes(template.observationOperation))
  throw Error("Issuer requires exact independently approved host pins, operation and Ed25519 public-key SHA-256.");
 return template;
}
function issueValid(obj,ch){
 if(!exact(obj,ISSUE_KEYS)||obj.schema!=="eternyx-docker-host-challenge-issued-v1"||
    obj.challenge!==ch||!utc(obj.issuedAt)||
    !exact(obj.expected,HOST_EVIDENCE_EXPECTED_KEYS)||
    obj.expected.challenge!==ch)
  throw Error("Original reviewer challenge issuance record is malformed.");
 const t={};
 for(const k of TEMPLATE_KEYS)t[k]=obj.expected[k];
 validateIndependentHostChallengeTemplate(t);
}
function consumedValid(obj,ch){
 if(!exact(obj,CONSUME_KEYS)||
    obj.schema!=="eternyx-docker-host-challenge-consumed-v1"||
    obj.challenge!==ch||!utc(obj.consumedAt)||
    !CONSUME_KEYS.slice(3).every(k=>HASH.test(obj[k]||"")))
  throw Error("Challenge ledger contains truncated or malformed consumed evidence.");
}
function scanOne(dir){
 const before=privateDirectory(dir),names=readdirSync(dir).sort();
 if(names.length>MAX_FILES)
  throw Error("Reviewer challenge ledger capacity exceeded; archive under independent change control.");
 const entries=[],issued=new Map(),consumed=new Map();
 for(const name of names){
  const i=ISSUED.exec(name),c=CONSUMED.exec(name);
  if(!i&&!c)throw Error("Unknown or unexpected file in reviewer challenge ledger.");
  const {value,sha256}=secureRead(join(dir,name));
  const ch=(i||c)[1];
  if(i){
   issueValid(value,ch);
   issued.set(ch,{value,sha256});
  }else{
   consumedValid(value,ch);
   consumed.set(ch,{value,sha256});
  }
  entries.push({name,sha256});
 }
 for(const [ch,v] of consumed){
  const origin=issued.get(ch);
  if(!origin||v.value.expectedSha256!==SHA(JSON.stringify(origin.value.expected))||
     Date.parse(v.value.consumedAt)<Date.parse(origin.value.issuedAt)-120000)
   throw Error("Consumed host challenge lacks an authentic matching issuance.");
 }
 const after=privateDirectory(dir);
 if(before.dev!==after.dev||before.ino!==after.ino||
    readdirSync(dir).sort().join("\n")!==names.join("\n"))
  throw Error("Reviewer challenge ledger changed during complete scan.");
 return {issued,consumed,entries,digest:SHA(JSON.stringify(entries))};
}
function audit(dir){
 const a=scanOne(dir),b=scanOne(dir);
 if(a.digest!==b.digest||JSON.stringify(a.entries)!==JSON.stringify(b.entries))
  throw Error("Reviewer challenge ledger changed between complete verification passes.");
 return b;
}
function syncDir(dir){
 const fd=openSync(dir,constants.O_RDONLY|(constants.O_DIRECTORY||0)|
  (constants.O_NOFOLLOW||0));
 try{
  const st=fstatSync(fd),p=privateDirectory(dir);
  if(!st.isDirectory()||st.uid!==p.uid||
     st.dev!==p.dev||st.ino!==p.ino)
   throw Error("Reviewer ledger directory changed before durable sync.");
  fsyncSync(fd);
 }finally{closeSync(fd);}
}
function durableCreate(dir,name,obj){
 privateDirectory(dir);
 const data=Buffer.from(JSON.stringify(obj)+"\n");
 if(data.length>MAX_BYTES)
  throw Error("Host challenge durable record exceeds hard size cap.");
 const fd=openSync(join(dir,name),
  constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
 // Once O_EXCL succeeds, NEVER remove the partial or completed record on
 // error. Incomplete writes or crashes must block reuse for human review.
 try{
  if(writeSync(fd,data)!==data.length)
   throw Error("Short host challenge evidence journal write.");
  fsyncSync(fd);
 }finally{closeSync(fd);}
 syncDir(dir);
 const back=secureRead(join(dir,name));
 if(back.sha256!==SHA(data))
  throw Error("Durable host challenge changed after creation.");
 return back.sha256;
}
/** Issue a fresh challenge from a REVIEWER-APPROVED template, not a host report.
 * Requires a pre-existing private directory; no automatic directory creation. */
export function issueDockerHostChallenge(dir,template,now=new Date()){
 if(process.platform!=="linux")
  throw Error("Durable host evidence issuance requires an approved Linux reviewer.");
 validateIndependentHostChallengeTemplate(template);
 const nowMs=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(nowMs))throw Error("Invalid reviewer challenge issuance time.");
 const before=audit(dir);
 if(before.entries.length>=MAX_FILES-2)
  throw Error("Reviewer challenge ledger is full; never erase forensic history automatically.");
 const challenge=randomBytes(32).toString("hex");
 const expected={};
 for(const key of HOST_EVIDENCE_EXPECTED_KEYS){
  expected[key]=key==="challenge"?challenge:template[key];
 }
 const issued={schema:"eternyx-docker-host-challenge-issued-v1",
  challenge,issuedAt:new Date(nowMs).toISOString(),expected};
 const recordSha256=durableCreate(dir,"issue-"+challenge+".json",issued);
 const checked=audit(dir);
 if(!checked.issued.has(challenge)||checked.consumed.has(challenge)||
    checked.issued.get(challenge).sha256!==recordSha256)
  throw Error("Fresh reviewer-issued challenge could not be durably confirmed.");
 return Object.freeze({challenge,issuedAt:issued.issuedAt,expected,
  originalIssuanceSha256:recordSha256,
  reviewerOwnedLocalLedger:true,challengeAlreadyConsumed:false,
  liveDockerUsed:false,productionDeploymentAuthorized:false});
}
/** Only a matching ORIGINAL, fresh, independently pinned Ed25519 report is
 * eligible for irreversible O_EXCL consumption. Concurrent consumers cannot
 * both succeed; interrupted consumption remains a forensic hold. */
export function consumeDockerHostChallenge(dir,bundle,pub,expected,now=new Date()){
 if(process.platform!=="linux")
  throw Error("Durable host evidence review requires an approved Linux reviewer.");
 const reviewed=verifyDockerReadOnlyHostEvidence(bundle,pub,expected,now);
 const nowMs=now instanceof Date?now.valueOf():NaN;
 if(!Number.isFinite(nowMs))
  throw Error("Invalid reviewer verification time.");
 const state=audit(dir),ch=expected.challenge;
 const record=state.issued.get(ch);
 if(!record)throw Error("Reviewer did not independently issue this challenge.");
 if(state.consumed.has(ch))
  throw Error("Signed host evidence challenge was already consumed; replay denied.");
 if(JSON.stringify(record.value.expected)!==JSON.stringify(expected))
  throw Error("Signed evidence pins are not the independently issued original expectations.");
 const issueMs=Date.parse(record.value.issuedAt);
 const observed=Date.parse(bundle.report.inspectedAt);
 if(issueMs>nowMs+120000||nowMs-issueMs>15*60000||
    observed<issueMs-120000||observed-issueMs>15*60000)
  throw Error("Challenge issuance is expired, future-dated or does not precede host observation.");
 // The single exclusive create is the authoritative consumption barrier.
 // Another concurrent verifier may sign, but cannot also consume this token.
 const consume={schema:"eternyx-docker-host-challenge-consumed-v1",
  challenge:ch,consumedAt:new Date(nowMs).toISOString(),
  expectedSha256:SHA(JSON.stringify(expected)),
  evidenceBundleSha256:reviewed.evidenceBundleSha256,
  originalReportSha256:reviewed.originalReportSha256};
 const consumedSha256=durableCreate(dir,"consume-"+ch+".json",consume);
 const after=audit(dir);
 if(after.consumed.get(ch)?.sha256!==consumedSha256||
    after.issued.get(ch)?.sha256!==record.sha256)
  throw Error("Reviewer challenge consumption changed after durable commit.");
 return Object.freeze({
  ...reviewed,
  challengeConsumedExactlyOnce:true,
  reviewerOwnedLedgerVerified:true,
  originalIssuanceSha256:record.sha256,
  durableConsumptionSha256:consumedSha256,
  reviewStatus:"one_time_challenge_consumed_attestor_observation_only",
  independentPhysicalHostApproval:false,
  stagingMutationAuthorized:false,productionDeploymentAuthorized:false
 });
}
export const HOST_CHALLENGE_TEMPLATE_KEYS=Object.freeze(TEMPLATE_KEYS.slice());
