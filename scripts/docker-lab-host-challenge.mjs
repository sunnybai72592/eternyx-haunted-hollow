#!/usr/bin/env node
// Independently issue a cryptographically random, one-time Docker host
// evidence challenge from preapproved reviewer pins. Offline only.
import {lstatSync,fstatSync,openSync,closeSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {
 issueDockerHostChallenge,inspectDockerHostChallenge,
 HOST_CHALLENGE_TEMPLATE_KEYS
} from "../src/lib/dockerHostChallengeLedger.mjs";
function reviewerTemplate(path){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.includes("//")||
    path.split("/").some(p=>p==="."||p===".."))
  throw Error("Independent reviewer pins must be an absolute, private file.");
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0||st.nlink!==1||st.size<2||st.size>2048)
  throw Error("Reviewer pins must be a private, real, bounded file.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const opened=fstatSync(fd);
  if(opened.dev!==st.dev||opened.ino!==st.ino||opened.size!==st.size)
   throw Error("Reviewer pin file changed before issuance.");
  const raw=readFileSync(fd);
  const end=fstatSync(fd),name=lstatSync(path);
  if(raw.length!==st.size||end.mtimeMs!==st.mtimeMs||
     end.ctimeMs!==st.ctimeMs||name.ino!==st.ino||
     name.ctimeMs!==st.ctimeMs)
   throw Error("Reviewer pin file changed during issuance.");
  const text=raw.toString("utf8");
  let value;
  try{value=JSON.parse(text);}catch{throw Error("Invalid reviewer pin manifest.");}
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).join("|")!==HOST_CHALLENGE_TEMPLATE_KEYS.join("|")||
     text!==JSON.stringify(value)+"\n")
   throw Error("Reviewer pin manifest must be exact canonical independent JSON.");
  return value;
 }finally{closeSync(fd);}
}
try{
 const args=process.argv.slice(2);
 let result;
 if(args.length===3&&args[0]==="issue")
  result=issueDockerHostChallenge(args[1],reviewerTemplate(args[2]));
 else if(args.length===3&&args[0]==="status")
  result=inspectDockerHostChallenge(args[1],args[2]);
 else throw Error("Usage: docker-lab-host-challenge.mjs issue /ABS/PRIVATE-LEDGER /ABS/INDEPENDENT-PINS.json | status /ABS/PRIVATE-LEDGER CHALLENGE_64_HEX");
 process.stdout.write(JSON.stringify(result)+"\n");
}catch(error){
 process.stderr.write((error instanceof Error?error.message:
  "Reviewer host challenge issuance refused.")+"\n");
 process.exitCode=1;
}
