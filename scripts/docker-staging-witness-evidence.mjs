#!/usr/bin/env node
// Phase42 local OFFLINE witness signer + independent, ONE-TIME reviewer.
// Never executes Docker, requests network access, issues permits or authorizes
// staging/production. The signer requires a human witness acknowledgment.
import {readFileSync,lstatSync,fstatSync,openSync,closeSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {loadHostEvidencePrivateKey,HOST_EVIDENCE_EXPECTED_KEYS}
 from "../src/lib/dockerSignedHostEvidenceReview.mjs";
import {STAGING_LIFECYCLE_EXPECTED_KEYS}
 from "../src/lib/dockerStagingLifecycleEvidence.mjs";
import {signDockerStagingWitnessEvidence,verifyAndConsumeDockerStagingWitness}
 from "../src/lib/dockerStagingWitnessEvidence.mjs";

const SHA=/^[a-f0-9]{64}$/;
function file(path,max,privateInput=false){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.includes("//")||path.endsWith("/")||
    path.split("/").some(s=>s==="."||s==="..")||
    /[\u0000-\u001f\u007f]/.test(path))
  throw Error("Canonical absolute offline evidence path required.");
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.size<2||st.size>max||
    (privateInput&&(st.uid!==process.getuid()||(st.mode&0o077)!==0)))
  throw Error("Offline evidence input is not a trusted bounded regular file.");
 const fd=openSync(path,constants.O_RDONLY|
   (constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.dev!==st.dev||opened.ino!==st.ino||
     opened.size!==st.size||opened.uid!==st.uid)
   throw Error("Offline evidence file changed before read.");
  const bytes=readFileSync(fd),after=fstatSync(fd),named=lstatSync(path);
  if(bytes.length!==st.size||after.mtimeMs!==st.mtimeMs||
     after.ctimeMs!==st.ctimeMs||named.ino!==st.ino||
     named.ctimeMs!==st.ctimeMs)
   throw Error("Offline evidence file changed during read.");
  return bytes.toString("utf8");
 }finally{closeSync(fd);}
}
function json(path,max,trust=false,fields=null){
 const raw=file(path,max,trust);
 if(!raw.endsWith("\n"))throw Error("Incomplete canonical witness JSON.");
 let value;
 try{value=JSON.parse(raw);}catch{throw Error("Invalid witness evidence JSON.");}
 if(!value||typeof value!=="object"||Array.isArray(value)||
    JSON.stringify(value)+"\n"!==raw||
    (fields&&Object.keys(value).join("|")!==fields.join("|")))
  throw Error("Noncanonical or untrusted witness evidence fields.");
 return value;
}
function key(path){
 const raw=file(path,128,true);
 if(!/^[A-Za-z0-9_-]{43}\n$/.test(raw))
  throw Error("Witness/host public key must be canonical Ed25519 base64url.");
 return raw.slice(0,-1);
}
function base(args,i){
 return {
  host:json(args[i],8192),
  hostPublic:key(args[i+1]),
  hostExpected:json(args[i+2],2048,true,HOST_EVIDENCE_EXPECTED_KEYS),
  before:json(args[i+3],4096),
  after:json(args[i+4],4096),
  lifecycleExpected:json(args[i+5],2048,true,STAGING_LIFECYCLE_EXPECTED_KEYS)
 };
}
try{
 const args=process.argv.slice(2);
 if(args[0]==="sign"&&args.length===9&&
    args[8]==="--attest-independent-witness"){
  const input=base(args,1);
  const priv=loadHostEvidencePrivateKey(args[7]);
  const signed=signDockerStagingWitnessEvidence({
   ...input,witnessPrivateKey:priv,acknowledged:true
  });
  process.stdout.write(JSON.stringify(signed)+"\n");
 }else if(args[0]==="review"&&args.length===11){
  const witness=json(args[1],4096);
  const input=base(args,2);
  const pub=key(args[8]);
  const approved=json(args[9],512,true,["witnessPublicKeySha256"]);
  if(!SHA.test(approved.witnessPublicKeySha256||""))
   throw Error("Independently pinned witness public-key digest required.");
  // No alternate "skip consumption" review mode; one-use ledger check is
  // the final irreversible step after all cryptographic/phase41 gates.
  const result=verifyAndConsumeDockerStagingWitness(args[10],{
   ...input,witness,witnessPublic:pub,
   witnessPublicKeySha256:approved.witnessPublicKeySha256
  });
  process.stdout.write(JSON.stringify(result)+"\n");
 }else{
  throw Error("Usage: sign HOST.json HOST.pub HOST-EXPECTED.json BEFORE.json AFTER.json LIFECYCLE-PINS.json WITNESS-PRIVATE.pk8 --attest-independent-witness | review WITNESS.json HOST.json HOST.pub HOST-EXPECTED.json BEFORE.json AFTER.json LIFECYCLE-PINS.json WITNESS.pub WITNESS-PIN.json LEDGER");
 }
}catch{
 // Never echo host JSON, file content, secret keys, original subprocess logs,
 // or other untrusted material from exceptions into shared reviewer output.
 process.stderr.write("Independent Docker staging witness evidence refused; verify private file pins, original signed observations, witness identity, freshness and one-time challenge ledger.\n");
 process.exitCode=1;
}
