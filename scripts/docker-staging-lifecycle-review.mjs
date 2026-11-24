#!/usr/bin/env node
// Offline comparison of two SANITIZED real-host staging observations.
// This verifies only internal consistency with independent operator pins.
// NO Docker, Supabase, mutation, approval, crash drill or causality proof.
import {lstatSync,openSync,readFileSync,closeSync,fstatSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {verifyDockerStagingLifecyclePair,STAGING_LIFECYCLE_EXPECTED_KEYS}
 from "../src/lib/dockerStagingLifecycleEvidence.mjs";

function readCanonical(path,max,{trusted=false}={}){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.includes("//")||path.endsWith("/")||
    path.split("/").some(s=>s==="."||s===".."))
  throw Error("Staging reviewer requires canonical absolute file path.");
 const before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||
    before.size<2||before.size>max||before.nlink!==1||
    (trusted&&(before.uid!==process.getuid()||(before.mode&0o077)!==0)))
  throw Error("Staging lifecycle reviewer file is not an admissible regular file.");
 const fd=openSync(path,constants.O_RDONLY|
  (constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
     opened.size!==before.size||opened.uid!==before.uid)
   throw Error("Staging evidence file identity changed during opening.");
  const raw=readFileSync(fd),after=fstatSync(fd),named=lstatSync(path);
  if(raw.length!==before.size||after.ctimeMs!==before.ctimeMs||
     after.mtimeMs!==before.mtimeMs||named.ino!==before.ino||
     named.ctimeMs!==before.ctimeMs)
   throw Error("Staging lifecycle evidence file changed during verification.");
  const text=raw.toString("utf8");
  let data;
  try{data=JSON.parse(text);}catch{throw Error("Invalid staging lifecycle JSON.");}
  if(!data||typeof data!=="object"||Array.isArray(data)||
     text!==JSON.stringify(data)+"\n")
   throw Error("Staging lifecycle evidence needs complete, canonical JSON.");
  return data;
 }finally{closeSync(fd);}
}
try{
 const args=process.argv.slice(2);
 if(args.length!==3)
  throw Error("Usage: node scripts/docker-staging-lifecycle-review.mjs /ABS/BEFORE.json /ABS/AFTER.json /ABS/INDEPENDENT-APPROVED.json");
 const before=readCanonical(args[0],4096);
 const after=readCanonical(args[1],4096);
 const expected=readCanonical(args[2],2048,{trusted:true});
 if(Object.keys(expected).join("|")!==STAGING_LIFECYCLE_EXPECTED_KEYS.join("|"))
  throw Error("Reviewer needs exactly the separately approved lifecycle pins.");
 const result=verifyDockerStagingLifecyclePair(before,after,expected);
 process.stdout.write(JSON.stringify(result)+"\n");
}catch(error){
 process.stderr.write((error instanceof Error?error.message:
  "Staging lifecycle review refused.")+"\n");
 process.exitCode=1;
}
