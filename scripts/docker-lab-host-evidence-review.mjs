#!/usr/bin/env node
// Independently REVIEW original Phase38 signed read-only host evidence.
// Offline only: no Docker, Supabase, network, keygen or host mutation.
import {readFileSync,openSync,closeSync,lstatSync,fstatSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {verifyDockerReadOnlyHostEvidence,HOST_EVIDENCE_EXPECTED_KEYS}
 from "../src/lib/dockerSignedHostEvidenceReview.mjs";
function boundedFile(path,max,{trusted=false}={}){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.includes("//")||path.split("/").some(s=>s==="."||s===".."))
  throw Error("Offline host evidence reviewer requires canonical absolute file paths.");
 const first=lstatSync(path);
 if(!first.isFile()||first.isSymbolicLink()||first.size<1||first.size>max||
    first.nlink!==1||
    (trusted&&(first.uid!==process.getuid()||(first.mode&0o077)!==0)))
  throw Error("Invalid or untrusted offline host evidence file.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.dev!==first.dev||opened.ino!==first.ino||
     opened.size!==first.size)
   throw Error("Host evidence file identity changed before verification.");
  const raw=readFileSync(fd);
  const after=fstatSync(fd);
  const end=lstatSync(path);
  if(raw.length!==first.size||after.ctimeMs!==first.ctimeMs||
     after.mtimeMs!==first.mtimeMs||end.ino!==first.ino||
     end.size!==first.size||end.ctimeMs!==first.ctimeMs)
   throw Error("Host evidence file changed during offline verification.");
  return raw.toString("utf8");
 }finally{closeSync(fd);}
}
function parseCanonicalJSON(raw,max){
 if(raw.length>max||!raw.endsWith("\n"))
  throw Error("Incomplete or oversized canonical host evidence JSON.");
 let value;
 try{value=JSON.parse(raw);}
 catch{throw Error("Invalid host evidence JSON.");}
 if(!value||typeof value!=="object"||Array.isArray(value)||
    JSON.stringify(value)+"\n"!==raw)
  throw Error("Noncanonical host evidence JSON; possible altered, duplicate or reordered fields.");
 return value;
}
try{
 const args=process.argv.slice(2);
 if(args.length!==3)
  throw Error("Usage: node scripts/docker-lab-host-evidence-review.mjs /ABS/SIGNED-EVIDENCE.json /ABS/TRUSTED-ED25519-PUBLIC.key /ABS/REVIEWER-PINS.json");
 const signed=parseCanonicalJSON(boundedFile(args[0],8192),8192);
 const rawKey=boundedFile(args[1],128,{trusted:true});
 if(!/^[A-Za-z0-9_-]{43}\n$/.test(rawKey))
  throw Error("Pinned reviewer key file must contain exactly one canonical Ed25519 public key.");
 const expected=parseCanonicalJSON(boundedFile(args[2],2048,{trusted:true}),2048);
 if(Object.keys(expected).join("|")!==HOST_EVIDENCE_EXPECTED_KEYS.join("|"))
  throw Error("Reviewer expectations are missing independently approved pinned fields.");
 const checked=verifyDockerReadOnlyHostEvidence(signed,rawKey.trim(),expected);
 process.stdout.write(JSON.stringify(checked)+"\n");
}catch(error){
 process.stderr.write((error instanceof Error?error.message:
  "Offline host evidence verification failed.")+"\n");
 process.exitCode=1;
}
